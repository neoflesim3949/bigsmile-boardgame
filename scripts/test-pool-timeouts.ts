/**
 * 驗證 src/lib/db.ts 三道 timeout 保險絲是否真的觸發。
 *
 * 三個案例：
 *   1. connectionTimeoutMillis: 5_000 — 拿不到連線等 5s 就放棄
 *   2. query_timeout: 30_000 — 單 query client 端 30s 上限
 *   3. statement_timeout: 30_000 — PG 端 30s 上限（雙保險）
 *
 * 跑：npx tsx scripts/test-pool-timeouts.ts
 * 預期：3 個案例都在 ~30s 或 ~5s 內主動 abort，不會 hang 永久。
 */

import { config as loadEnv } from 'dotenv';
import { Pool, type PoolClient } from 'pg';

loadEnv({ path: '.env.local' });

const url = process.env.DATABASE_URL!;
const isLocal = /\/\/(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);

// 完全照 src/lib/db.ts 的 pool config
function makePool() {
  return new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    query_timeout: 30_000,
    statement_timeout: 30_000,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
}

interface Result {
  case: string;
  expectedAbortMs: number;
  actualMs: number;
  abortedCorrectly: boolean;
  errorCode?: string;
  errorMsg?: string;
}

async function testConnectionTimeout(): Promise<Result> {
  console.log('\n=== Case 1: connectionTimeoutMillis (saturate pool 10/10, try 11th) ===');
  const pool = makePool();
  pool.on('error', () => {});
  const held: PoolClient[] = [];
  try {
    // 占滿 10 個 slot（不 release）
    for (let i = 0; i < 10; i++) {
      const c = await pool.connect();
      held.push(c);
    }
    console.log('  pool 已飽和（10/10）');

    const t0 = Date.now();
    let actualMs = -1;
    let errorCode: string | undefined;
    let errorMsg: string | undefined;
    try {
      // 第 11 個 acquire 應該 5s 後 throw timeout
      const c = await pool.connect();
      held.push(c); // 不應該到這
      console.log('  ⚠️ acquire 居然成功 — timeout 沒觸發！');
    } catch (err) {
      actualMs = Date.now() - t0;
      const e = err as { code?: string; message?: string };
      errorCode = e.code;
      errorMsg = e.message;
      console.log(`  ✓ acquire 被 abort，耗時 ${actualMs}ms：${errorMsg}`);
    }
    return {
      case: 'connectionTimeoutMillis',
      expectedAbortMs: 5_000,
      actualMs,
      abortedCorrectly: actualMs >= 4_500 && actualMs <= 6_500,
      errorCode,
      errorMsg,
    };
  } finally {
    for (const c of held) c.release();
    await pool.end();
  }
}

async function testStatementTimeout(): Promise<Result> {
  console.log('\n=== Case 2 & 3: statement_timeout / query_timeout (pg_sleep 35s) ===');
  const pool = makePool();
  pool.on('error', () => {});
  try {
    const c = await pool.connect();
    const t0 = Date.now();
    let actualMs = -1;
    let errorCode: string | undefined;
    let errorMsg: string | undefined;
    try {
      // 預期 30s 後被 abort（PG statement_timeout 或 client query_timeout 任一先觸發）
      await c.query(`SELECT pg_sleep(35)`);
      console.log('  ⚠️ pg_sleep 居然完成 — timeout 沒觸發！');
    } catch (err) {
      actualMs = Date.now() - t0;
      const e = err as { code?: string; message?: string };
      errorCode = e.code;
      errorMsg = e.message;
      console.log(`  ✓ query 被 abort，耗時 ${actualMs}ms`);
      console.log(`    code=${errorCode}, msg=${errorMsg}`);
    } finally {
      c.release();
    }
    return {
      case: 'statement_timeout / query_timeout',
      expectedAbortMs: 30_000,
      actualMs,
      // 容錯範圍：28~33s（PG 內部 polling + 網路延遲）
      abortedCorrectly: actualMs >= 28_000 && actualMs <= 33_000,
      errorCode,
      errorMsg,
    };
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('🔬 src/lib/db.ts 三道 timeout 保險絲驗證');
  console.log(`   DATABASE_URL: ${url.replace(/\/\/[^@]+@/, '//***@')}`);
  console.log(`   pool config: max=10, idle=30s, conn=5s, query=30s, statement=30s`);

  const results: Result[] = [];
  results.push(await testConnectionTimeout());
  results.push(await testStatementTimeout());

  console.log('\n=== 結果摘要 ===');
  console.log('| Case | 預期 abort 時間 | 實際 | 是否如預期 | 錯誤代碼 |');
  console.log('|------|---------------|------|---------|---------|');
  for (const r of results) {
    const ok = r.abortedCorrectly ? '✅' : '❌';
    console.log(`| ${r.case} | ${r.expectedAbortMs}ms | ${r.actualMs}ms | ${ok} | ${r.errorCode ?? '(none)'} |`);
  }

  const allPass = results.every((r) => r.abortedCorrectly);
  console.log(`\n${allPass ? '✅ 全部通過' : '❌ 有未通過項目'}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
