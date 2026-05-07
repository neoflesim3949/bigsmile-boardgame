/**
 * Production login 壓測 — 對 deployed Vercel URL 跑
 *
 * 用法：
 *   1. （首次）seed 500 個 loadtest 帳號的 bcrypt password：
 *      `npx tsx scripts/load-test-login-prod.ts --setup`
 *   2. 在 Vercel env var 加 `LOAD_TEST_ENABLED=true` 並 redeploy
 *   3. 跑壓測：
 *      `npx tsx scripts/load-test-login-prod.ts --url=https://bigsmile-boardgame.vercel.app --concurrent=500`
 *      或同步發 500 個 fetch、或 spaced 模式（後者更貼近真實）
 *
 * 壓測完記得移除 `LOAD_TEST_ENABLED` 並 redeploy 關閉 endpoint。
 *
 * 報告：docs/0505_testspeed_login_prod.md
 */

import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

loadEnv({ path: '.env.local' });

const N = 500;
const TEST_PASSWORD = 'loadtest_pwd_2026!';
const SETUP_FLAG = process.argv.includes('--setup');
const URL_ARG = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1];
const MODE = process.argv.find((a) => a.startsWith('--mode='))?.split('=')[1] ?? 'sync';
const SPACED_INTERVAL_MS = Number(process.argv.find((a) => a.startsWith('--interval='))?.split('=')[1] ?? '0');

interface LoginResult {
  ok: boolean;
  ms: number;
  status: number;
  reason?: string;
  breakdown?: {
    throttle_ms: number;
    select_ms: number;
    bcrypt_ms: number;
    clear_ms: number;
    refresh_ms: number;
  };
  client_ms: number;  // 含網路 RTT 的總時間
}

async function setupAccounts() {
  console.log(`📝 Setup：seed 500 個 loadtest_X 帳號 bcrypt 密碼（cost=12）...`);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 5 });
  try {
    // 1. 先確保 500 個 loadtest 帳號存在（hot-path 用過的同一批）
    const accountsR = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM "Account" WHERE user_id LIKE 'loadtest_%' AND role = 'player'`,
    );
    if (accountsR.rows.length < N) {
      console.log(`  尚無 500 帳號（${accountsR.rows.length}/${N}），先建立...`);
      const vals = Array.from({ length: N }, (_, i) => i + 1)
        .map((i) => `('loadtest_${i}', 'LoadTest #${i}', 'loadtest_${i}', 'placeholder', 'player', true)`)
        .join(',');
      await pool.query(
        `INSERT INTO "Account" (user_id, name, login_id, password_hash, role, is_active)
         VALUES ${vals}
         ON CONFLICT (user_id) DO NOTHING`,
      );
    }
    // 2. 算一個共用 bcrypt hash（cost=12 跟 production 一致）
    console.log(`  計算 bcrypt hash（cost=12）...`);
    const hash = await bcrypt.hash(TEST_PASSWORD, 12);
    console.log(`  ✓ hash: ${hash.slice(0, 20)}...`);
    // 3. 更新所有 loadtest 帳號使用此 hash
    await pool.query(
      `UPDATE "Account" SET password_hash = $1 WHERE user_id LIKE 'loadtest_%' AND role = 'player'`,
      [hash],
    );
    // 4. 清掉舊 LoginThrottle / RefreshToken
    await pool.query(`DELETE FROM "LoginThrottle" WHERE login_id LIKE 'loadtest_%'`);
    await pool.query(`DELETE FROM "RefreshToken" WHERE user_id LIKE 'loadtest_%'`);
    console.log(`✅ Setup 完成。500 個 loadtest_X 帳號可用密碼 "${TEST_PASSWORD}" 登入`);
  } finally {
    await pool.end();
  }
}

async function tryLoginOnce(url: string, loginId: string, t0: number): Promise<LoginResult> {
  try {
    const r = await fetch(`${url}/api/loadtest-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, password: TEST_PASSWORD }),
    });
    const client_ms = Math.round(performance.now() - t0);
    const data = await r.json() as { ok: boolean; ms: number; reason?: string; breakdown?: LoginResult['breakdown'] };
    return {
      ok: data.ok,
      ms: data.ms,
      status: r.status,
      reason: data.reason,
      breakdown: data.breakdown,
      client_ms,
    };
  } catch (err) {
    return {
      ok: false, ms: 0, status: 0,
      reason: err instanceof Error ? err.message : String(err),
      client_ms: Math.round(performance.now() - t0),
    };
  }
}

/**
 * Exponential backoff + full jitter retry（最多 3 次重試）
 * - attempt 1: wait 0~1000ms（base 500ms）
 * - attempt 2: wait 0~2000ms（base 1000ms）
 * - attempt 3: wait 0~4000ms（base 2000ms）
 *
 * Jitter 解決「大家同時 retry 同時撞牆」問題，把 retry 散在時間軸上讓 pool 有空隙服務
 */
const USER_ERRORS = ['NOT_FOUND', 'WRONG_PASSWORD', 'LOGIN_LOCKED'] as const;
const MAX_RETRIES = 3;

async function tryLogin(url: string, loginId: string): Promise<LoginResult> {
  const t0 = performance.now();
  let last: LoginResult | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // exponential backoff base = 500 * 2^(attempt-1)，full jitter [0, 2 × base]
      const baseMs = 500 * Math.pow(2, attempt - 1);
      const waitMs = Math.random() * baseMs * 2;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    const r = await tryLoginOnce(url, loginId, t0);
    if (r.ok) return r;
    last = r;
    if (USER_ERRORS.includes((r.reason ?? '') as typeof USER_ERRORS[number])) return r;
  }
  return last!;
}

function summarize(samples: LoginResult[]) {
  const oks = samples.filter((s) => s.ok);
  const fails = samples.filter((s) => !s.ok);
  const sortedClient = oks.map((s) => s.client_ms).sort((a, b) => a - b);
  const sortedServer = oks.map((s) => s.ms).sort((a, b) => a - b);
  const sortedBcrypt = oks.filter((s) => s.breakdown).map((s) => s.breakdown!.bcrypt_ms).sort((a, b) => a - b);
  const pick = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] ?? 0;
  const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  const reasons = new Map<string, number>();
  for (const f of fails) reasons.set(f.reason ?? 'unknown', (reasons.get(f.reason ?? 'unknown') ?? 0) + 1);
  return {
    total: samples.length,
    ok: oks.length,
    fail: fails.length,
    client: { avg: avg(sortedClient), p50: pick(sortedClient, 0.5), p95: pick(sortedClient, 0.95), p99: pick(sortedClient, 0.99), min: sortedClient[0] ?? 0, max: sortedClient.at(-1) ?? 0 },
    server: { avg: avg(sortedServer), p50: pick(sortedServer, 0.5), p95: pick(sortedServer, 0.95), p99: pick(sortedServer, 0.99), min: sortedServer[0] ?? 0, max: sortedServer.at(-1) ?? 0 },
    bcrypt: { avg: avg(sortedBcrypt), p50: pick(sortedBcrypt, 0.5), p95: pick(sortedBcrypt, 0.95), p99: pick(sortedBcrypt, 0.99), min: sortedBcrypt[0] ?? 0, max: sortedBcrypt.at(-1) ?? 0 },
    reasons: Array.from(reasons.entries()).map(([k, v]) => ({ reason: k, count: v })).sort((a, b) => b.count - a.count),
  };
}

async function runSync(url: string): Promise<{ wallMs: number; samples: LoginResult[] }> {
  const ids = Array.from({ length: N }, (_, i) => `loadtest_${i + 1}`);
  console.log(`\n🚀 同步 fetch ${N} 個並發 login...`);
  const t0 = Date.now();
  const samples = await Promise.all(ids.map((id) => tryLogin(url, id)));
  const wallMs = Date.now() - t0;
  return { wallMs, samples };
}

async function runSpaced(url: string, intervalMs: number): Promise<{ wallMs: number; samples: LoginResult[] }> {
  const ids = Array.from({ length: N }, (_, i) => `loadtest_${i + 1}`);
  console.log(`\n🚀 spaced ${intervalMs}ms 間隔 ${N} 個 login...`);
  const t0 = Date.now();
  const promises: Promise<LoginResult>[] = [];
  for (let i = 0; i < ids.length; i++) {
    promises.push(tryLogin(url, ids[i]));
    if (i < ids.length - 1) {
      await new Promise<void>((r) => setTimeout(r, intervalMs));
    }
  }
  const samples = await Promise.all(promises);
  const wallMs = Date.now() - t0;
  return { wallMs, samples };
}

async function main() {
  if (SETUP_FLAG) {
    await setupAccounts();
    return;
  }
  if (!URL_ARG) {
    console.error('❌ 缺 --url=https://your-deploy.vercel.app');
    process.exit(1);
  }
  const url = URL_ARG.replace(/\/$/, '');

  // 先測一個確認 endpoint 通
  console.log(`📡 測試 endpoint：${url}/api/loadtest-login`);
  const probe = await tryLogin(url, 'loadtest_1');
  console.log(`   probe → status=${probe.status} ok=${probe.ok} ms=${probe.ms} reason=${probe.reason ?? '-'}`);
  if (probe.status === 403) {
    console.error(`❌ endpoint 回 403 — 確認 Vercel env var LOAD_TEST_ENABLED=true 已設且 redeploy`);
    process.exit(1);
  }
  if (!probe.ok) {
    console.error(`❌ probe 失敗：${probe.reason}（先跑 --setup？）`);
    process.exit(1);
  }
  console.log(`✓ endpoint 正常\n`);

  const { wallMs, samples } = MODE === 'spaced' && SPACED_INTERVAL_MS > 0
    ? await runSpaced(url, SPACED_INTERVAL_MS)
    : await runSync(url);

  const stats = summarize(samples);
  console.log(`\n📊 結果`);
  console.log(`   wallclock: ${wallMs}ms = ${(wallMs / 1000).toFixed(1)}s`);
  console.log(`   total: ${stats.total} | ok: ${stats.ok} | fail: ${stats.fail}`);
  console.log(`   client (含網路 RTT): avg=${stats.client.avg}ms p50=${stats.client.p50}ms p95=${stats.client.p95}ms p99=${stats.client.p99}ms`);
  console.log(`   server (Vercel 內部): avg=${stats.server.avg}ms p50=${stats.server.p50}ms p95=${stats.server.p95}ms p99=${stats.server.p99}ms`);
  console.log(`   bcrypt only: avg=${stats.bcrypt.avg}ms p50=${stats.bcrypt.p50}ms p95=${stats.bcrypt.p95}ms p99=${stats.bcrypt.p99}ms`);
  if (stats.reasons.length > 0) {
    console.log(`   錯誤分佈：${stats.reasons.map((r) => `${r.reason}×${r.count}`).join(' / ')}`);
  }

  // 寫報告
  const md = renderReport({ url, mode: MODE, intervalMs: SPACED_INTERVAL_MS, wallMs, stats });
  const dest = join(process.cwd(), 'docs', '0505_testspeed_login_prod.md');
  writeFileSync(dest, md, 'utf-8');
  console.log(`\n📝 報告寫入：${dest}`);
}

function renderReport(a: {
  url: string; mode: string; intervalMs: number; wallMs: number;
  stats: ReturnType<typeof summarize>;
}): string {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const md: string[] = [];
  md.push(`# Production Login 壓測報告`);
  md.push('');
  md.push(`> 由 \`scripts/load-test-login-prod.ts\` 對 deployed Vercel URL 直測`);
  md.push(`> 執行時間：${ts}（UTC）`);
  md.push('');
  md.push(`## 設定`);
  md.push('');
  md.push(`| 項目 | 值 |`);
  md.push(`|------|----|`);
  md.push(`| 目標 URL | ${a.url} |`);
  md.push(`| 模式 | ${a.mode}${a.mode === 'spaced' && a.intervalMs ? ` (${a.intervalMs}ms 間隔)` : ''} |`);
  md.push(`| 並發 | ${a.stats.total} |`);
  md.push(`| 帳號 | loadtest_1..500（共用 bcrypt cost=12 hash）|`);
  md.push(`| 路徑 | POST /api/loadtest-login（不 set cookies、純測 latency）|`);
  md.push(`| wallclock | ${a.wallMs}ms |`);
  md.push('');
  md.push(`## 整體結果`);
  md.push('');
  md.push(`| 指標 | client（含網路）| server（Vercel 內部）| bcrypt only |`);
  md.push(`|------|------|--------|-------------|`);
  md.push(`| avg | ${a.stats.client.avg}ms | ${a.stats.server.avg}ms | ${a.stats.bcrypt.avg}ms |`);
  md.push(`| p50 | ${a.stats.client.p50}ms | ${a.stats.server.p50}ms | ${a.stats.bcrypt.p50}ms |`);
  md.push(`| **p95** | **${a.stats.client.p95}ms** | **${a.stats.server.p95}ms** | **${a.stats.bcrypt.p95}ms** |`);
  md.push(`| p99 | ${a.stats.client.p99}ms | ${a.stats.server.p99}ms | ${a.stats.bcrypt.p99}ms |`);
  md.push(`| min | ${a.stats.client.min}ms | ${a.stats.server.min}ms | ${a.stats.bcrypt.min}ms |`);
  md.push(`| max | ${a.stats.client.max}ms | ${a.stats.server.max}ms | ${a.stats.bcrypt.max}ms |`);
  md.push('');
  md.push(`| 成功 / 失敗 | ${a.stats.ok} / ${a.stats.fail} |`);
  md.push('');
  if (a.stats.reasons.length > 0) {
    md.push(`### 失敗分佈`);
    md.push('');
    for (const r of a.stats.reasons) md.push(`- \`${r.reason}\` × ${r.count}`);
    md.push('');
  }
  md.push(`## 解讀`);
  md.push('');
  md.push(`- **client** = 我的 Mac → Vercel 全程（含 client→Vercel 網路）。**最接近真實玩家手機 → Vercel 的體感**`);
  md.push(`- **server** = Vercel function 內部測量（不含 client 端網路）。bcrypt + DB 純內部成本`);
  md.push(`- **bcrypt only** = 純 bcrypt.compare 的 CPU 時間。**Vercel function CPU 共享狀況的指標**`);
  md.push('');
  md.push(`### 體感對應`);
  md.push('');
  md.push(`- p95 ${a.stats.client.p95}ms：5% 玩家會等 ${(a.stats.client.p95 / 1000).toFixed(2)} 秒看到登入結果`);
  md.push(`- p50 ${a.stats.client.p50}ms：一半玩家在 ${(a.stats.client.p50 / 1000).toFixed(2)} 秒內登入`);
  md.push('');

  return md.join('\n') + '\n';
}

main().catch((e) => {
  console.error('❌ 失敗：', e);
  process.exit(1);
});
