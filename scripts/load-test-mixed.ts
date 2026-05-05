/**
 * Mixed workload 壓測（Phase 1-5 混合並發）
 *
 * 500 個 worker 同時起，每個 worker 隨機挑一個 Phase 執行。模擬實際活動中：
 * - 玩家 A 在抽命格（Phase 1）
 * - 玩家 B 在買股（Phase 2）
 * - 玩家 C 在看排行榜（Phase 3）
 * - 主持人剛好按了下一回合 → 觸發強制平倉（Phase 4）+ 業力影響（Phase 5）
 * 都在同一秒發生
 *
 * 結果寫入 docs/testspeed_0504_1.md
 */

import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

loadEnv({ path: '.env.local' });

const N = 500;
const POOL = 50;

/**
 * MODE：
 * - 'all'        500 worker 隨機挑 Phase 1-5（最壞情境壓力）
 * - 'players'    500 worker 隨機挑 Phase 1-3（純玩家行為，剔除 4/5 global CTE 干擾）
 * - 'realistic'  500 worker 隨機挑 Phase 1-3 + 1 worker 跑 Phase 4 + 1 worker 跑 Phase 5（主持人+玩家真實情境）
 */
type Mode = 'all' | 'players' | 'realistic';
const MODE = (process.argv.find((a) => a.startsWith('--mode='))?.slice(7) ?? 'all') as Mode;
const APPEND = process.argv.includes('--append');

interface Sample {
  phase: number;
  ok: boolean;
  ms: number;
  err?: string;
}

interface PhaseStat {
  phase: number;
  name: string;
  total: number;
  ok: number;
  fail: number;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  min_ms: number;
  max_ms: number;
  errors: Array<{ msg: string; count: number }>;
}

const PHASE_NAMES: Record<number, string> = {
  1: '抽命格 drawDestiny',
  2: '買股 buyStock',
  3: '查排行榜 leaderboardCompute',
  4: '強制平倉 forceLiquidation',
  5: '業力影響 karmaBandTick',
};

// ─── 各 Phase 模擬 ─────────────────────────────────────────────

async function simDraw(pool: Pool, userId: string): Promise<{ ok: boolean; ms: number; err?: string }> {
  const t0 = Date.now();
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const psR = await c.query<{ destiny_name: string | null }>(
      `SELECT destiny_name FROM "PlayerStats" WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    if (!psR.rows[0]) throw new Error('PlayerStats not found');
    if (psR.rows[0].destiny_name) {
      await c.query('ROLLBACK');
      return { ok: true, ms: Date.now() - t0, err: 'ALREADY_DRAWN' };
    }
    const tR = await c.query<{ label: string; money: number; health: number; blessing: number; karma: number }>(
      `SELECT label, money, health, blessing, karma FROM "InitialValueTemplate" WHERE is_active = true`,
    );
    const chosen = tR.rows.length > 0
      ? tR.rows[Math.floor(Math.random() * tR.rows.length)]
      : { label: '預設命格', money: 1000, health: 80, blessing: 5, karma: 0 };
    await c.query(
      `UPDATE "PlayerStats" SET destiny_name = $2, money = $3, health = $4, blessing = $5, karma = $6, updated_at = now()
       WHERE user_id = $1 AND destiny_name IS NULL`,
      [userId, chosen.label, chosen.money, Math.min(chosen.health, 100), chosen.blessing, chosen.karma],
    );
    await c.query(
      `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
       VALUES ($1, $1, 'destiny_draw', $2)`,
      [userId, JSON.stringify({ chosen: chosen.label, mixed_test: true })],
    );
    await c.query('COMMIT');
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch {}
    return { ok: false, ms: Date.now() - t0, err: e instanceof Error ? e.message : String(e) };
  } finally {
    c.release();
  }
}

async function simBuy(pool: Pool, userId: string, stockId: string): Promise<{ ok: boolean; ms: number; err?: string }> {
  const t0 = Date.now();
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const stockR = await c.query<{ current_price: number; code: string; name: string }>(
      `SELECT current_price, code, name FROM "Stock" WHERE id = $1`,
      [stockId],
    );
    if (stockR.rows.length === 0) throw new Error('股票不存在');
    const price = stockR.rows[0].current_price;
    const psR = await c.query<{ money: number; health: number; blessing: number }>(
      `SELECT money, health, blessing FROM "PlayerStats" WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const me = psR.rows[0];
    if (!me) throw new Error('玩家資料不存在');
    if (me.health <= 0 || me.blessing <= 0) throw new Error('PLAYER_DEAD');
    if (me.money < price) throw new Error('INSUFFICIENT_FUNDS');
    await c.query(`UPDATE "PlayerStats" SET money = money - $2, updated_at = now() WHERE user_id = $1`, [userId, price]);
    await c.query(
      `INSERT INTO "StockHolding" (user_id, stock_id, shares, avg_cost)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (user_id, stock_id) DO UPDATE SET
         shares = "StockHolding".shares + 1,
         avg_cost = ROUND(("StockHolding".shares * "StockHolding".avg_cost + $3) / NULLIF("StockHolding".shares + 1, 0)),
         updated_at = now()`,
      [userId, stockId, price],
    );
    await c.query(
      `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
       VALUES ($1, $1, 'stock_buy', $2)`,
      [userId, JSON.stringify({ stock_id: stockId, shares: 1, price, cost: price, mixed_test: true })],
    );
    await c.query('COMMIT');
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch {}
    return { ok: false, ms: Date.now() - t0, err: e instanceof Error ? e.message : String(e) };
  } finally {
    c.release();
  }
}

async function simScore(pool: Pool): Promise<{ ok: boolean; ms: number; err?: string }> {
  const t0 = Date.now();
  try {
    await pool.query<{ user_id: string; name: string; final_score: number }>(
      `SELECT a.user_id, a.name, ps.final_score
       FROM "Account" a
       JOIN "PlayerStats" ps ON ps.user_id = a.user_id
       WHERE a.role = 'player' AND a.is_active = true
       ORDER BY ps.final_score DESC LIMIT 50`,
    );
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, err: e instanceof Error ? e.message : String(e) };
  }
}

async function simLiq(pool: Pool): Promise<{ ok: boolean; ms: number; err?: string }> {
  const t0 = Date.now();
  try {
    await pool.query(
      `WITH liquidated AS (
         SELECT sh.user_id, sh.stock_id, s.code AS stock_code, s.name AS stock_name,
                FLOOR(sh.shares * 50::int / 100)::int AS shares_sold,
                sh.shares AS shares_before
         FROM "StockHolding" sh JOIN "Stock" s ON s.id = sh.stock_id
         WHERE FLOOR(sh.shares * 50::int / 100) > 0
           AND sh.user_id LIKE 'loadtest_%'
       ),
       upd AS (
         UPDATE "StockHolding" sh
         SET shares = sh.shares - l.shares_sold, updated_at = now()
         FROM liquidated l
         WHERE sh.user_id = l.user_id AND sh.stock_id = l.stock_id
           AND l.shares_sold < l.shares_before
         RETURNING 1
       )
       INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
       SELECT user_id, NULL, 'forced_liquidation',
              jsonb_build_object('round', 999, 'ratio', 50, 'stock_id', stock_id,
                'stock_code', stock_code, 'stock_name', stock_name,
                'shares_sold', shares_sold, 'money_gain', 0, 'mixed_test', true)
       FROM liquidated`,
    );
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, err: e instanceof Error ? e.message : String(e) };
  }
}

async function simKarma(pool: Pool): Promise<{ ok: boolean; ms: number; err?: string }> {
  const t0 = Date.now();
  try {
    await pool.query(
      `WITH affected AS (
         SELECT ps.user_id, kb.label AS band_label,
                kb.money_delta, kb.health_delta, kb.blessing_delta, kb.karma_delta
         FROM "PlayerStats" ps
         JOIN LATERAL (
           SELECT label, money_delta, health_delta, blessing_delta, karma_delta
           FROM "KarmaBand" WHERE is_active = true
             AND (karma_min IS NULL OR ps.karma >= karma_min)
             AND (karma_max IS NULL OR ps.karma <= karma_max)
           ORDER BY sort_order ASC LIMIT 1
         ) kb ON true
         WHERE ps.health > 0 AND ps.blessing > 0
           AND (kb.money_delta != 0 OR kb.health_delta != 0
                OR kb.blessing_delta != 0 OR kb.karma_delta != 0)
           AND ps.user_id LIKE 'loadtest_%'
       ),
       upd AS (
         UPDATE "PlayerStats" ps SET
           money = GREATEST(0, ps.money + a.money_delta),
           health = LEAST(100, GREATEST(0, ps.health + a.health_delta)),
           blessing = GREATEST(0, ps.blessing + a.blessing_delta),
           karma = ps.karma + a.karma_delta,
           updated_at = now()
         FROM affected a WHERE ps.user_id = a.user_id RETURNING ps.user_id
       )
       INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
       SELECT a.user_id, NULL, 'karma_band_effect',
              jsonb_build_object('round', 999, 'band_label', a.band_label,
                'money_delta', a.money_delta, 'health_delta', a.health_delta,
                'blessing_delta', a.blessing_delta, 'karma_delta', a.karma_delta,
                'mixed_test', true)
       FROM affected a JOIN upd u ON u.user_id = a.user_id`,
    );
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, err: e instanceof Error ? e.message : String(e) };
  }
}

// ─── 主流程 ─────────────────────────────────────────────────

function summarize(samples: Sample[], phase: number): PhaseStat {
  const phaseSamples = samples.filter((s) => s.phase === phase);
  const oks = phaseSamples.filter((s) => s.ok);
  const fails = phaseSamples.filter((s) => !s.ok);
  const sorted = oks.map((s) => s.ms).sort((a, b) => a - b);
  const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  const avg = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
  const errMap = new Map<string, number>();
  for (const f of fails) errMap.set(f.err ?? 'unknown', (errMap.get(f.err ?? 'unknown') ?? 0) + 1);
  return {
    phase,
    name: PHASE_NAMES[phase],
    total: phaseSamples.length,
    ok: oks.length,
    fail: fails.length,
    avg_ms: Math.round(avg),
    p50_ms: pick(0.5),
    p95_ms: pick(0.95),
    p99_ms: pick(0.99),
    min_ms: sorted[0] ?? 0,
    max_ms: sorted[sorted.length - 1] ?? 0,
    errors: Array.from(errMap.entries()).map(([msg, count]) => ({ msg, count })).sort((a, b) => b.count - a.count),
  };
}

async function setupPlayers(pool: Pool, n: number) {
  console.log(`📝 準備 ${n} 個 loadtest_* 帳號 + 重設狀態...`);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const values = Array.from({ length: n }, (_, i) => i + 1)
      .map((i) => `('loadtest_${i}', 'LoadTest #${i}', 'loadtest_${i}', '$2a$04$placeholder.hash', 'player', true)`)
      .join(',');
    await c.query(
      `INSERT INTO "Account" (user_id, name, login_id, password_hash, role, is_active)
       VALUES ${values}
       ON CONFLICT (user_id) DO NOTHING`,
    );
    // 重置：destiny=NULL（讓 Phase 1 能跑）+ 給足金錢 + karma 隨機分散（讓 Phase 5 各 band 都會被觸發）
    await c.query(
      `INSERT INTO "PlayerStats" (user_id, money, health, blessing, karma)
       SELECT user_id, 100000, 100, 50, (random() * 600 - 200)::int
       FROM "Account" WHERE user_id LIKE 'loadtest_%'
       ON CONFLICT (user_id) DO UPDATE SET
         destiny_name = NULL,
         money = 100000, health = 100, blessing = 50,
         karma = (random() * 600 - 200)::int`,
    );
    // 鋪設一些持股讓 Phase 4 有東西可平倉（每人 1 股，避開先前測試殘留）
    await c.query(`DELETE FROM "StockHolding" WHERE user_id LIKE 'loadtest_%'`);
    await c.query(
      `INSERT INTO "StockHolding" (user_id, stock_id, shares, avg_cost)
       SELECT a.user_id, s.id, 10, 100
       FROM "Account" a, (SELECT id FROM "Stock" ORDER BY code LIMIT 1) s
       WHERE a.user_id LIKE 'loadtest_%'`,
    );
    await c.query(`DELETE FROM "Transaction" WHERE user_id LIKE 'loadtest_%' AND payload->>'mixed_test' = 'true'`);
    await c.query('COMMIT');
    console.log(`✅ ${n} 個帳號就緒（命格已重設、$100K、karma 隨機 -200~400、每人 10 股）`);
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

async function pickStock(pool: Pool): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM "Stock" WHERE is_visible = true ORDER BY code LIMIT 1`,
  );
  if (r.rows.length === 0) throw new Error('沒有可用股票，請先 seed');
  return r.rows[0].id;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const isPgBouncer = /:6543\b/.test(url);
  console.log(`\n🚀 Mixed Workload 壓測 — ${N} 個 worker 隨機挑 Phase 1-5 同時跑`);
  console.log(`   pg pool size: ${POOL}`);
  console.log(`   PgBouncer 6543: ${isPgBouncer ? '✅' : '⚠️ 5432 直連'}`);

  const pool = new Pool({
    connectionString: url,
    max: POOL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await setupPlayers(pool, N);
    const stockId = await pickStock(pool);

    // 預先決定每個 worker 的 phase。MODE 決定挑選範圍：
    // - all: random 1-5
    // - players: random 1-3 only
    // - realistic: 500 個 1-3 + 1 個 Phase 4 + 1 個 Phase 5
    const phases: number[] = (() => {
      if (MODE === 'players') {
        return Array.from({ length: N }, () => 1 + Math.floor(Math.random() * 3));
      }
      if (MODE === 'realistic') {
        return [
          ...Array.from({ length: N }, () => 1 + Math.floor(Math.random() * 3)),
          4,
          5,
        ];
      }
      // 'all'
      return Array.from({ length: N }, () => 1 + Math.floor(Math.random() * 5));
    })();
    console.log(`\n🎯 Mode: ${MODE} — total workers: ${phases.length}`);
    const dist = phases.reduce((m, p) => ({ ...m, [p]: (m[p] ?? 0) + 1 }), {} as Record<number, number>);
    console.log(`\n📊 Phase 分佈（每個 worker 隨機挑）：`);
    for (let p = 1; p <= 5; p++) {
      console.log(`   Phase ${p} (${PHASE_NAMES[p]}): ${dist[p] ?? 0} workers`);
    }

    console.log(`\n⏱  500 worker 同時起跑...`);
    const wallStart = Date.now();
    const samples = await Promise.all(
      phases.map(async (phase, i): Promise<Sample> => {
        const userId = `loadtest_${i + 1}`;
        let r: { ok: boolean; ms: number; err?: string };
        switch (phase) {
          case 1: r = await simDraw(pool, userId); break;
          case 2: r = await simBuy(pool, userId, stockId); break;
          case 3: r = await simScore(pool); break;
          case 4: r = await simLiq(pool); break;
          case 5: r = await simKarma(pool); break;
          default: r = { ok: false, ms: 0, err: 'unknown phase' };
        }
        return { phase, ...r };
      }),
    );
    const wallMs = Date.now() - wallStart;
    console.log(`✅ 全部完成，wallclock ${wallMs} ms（throughput ${(N / (wallMs / 1000)).toFixed(1)} req/s）`);

    // 統計各 Phase
    const stats = [1, 2, 3, 4, 5].map((p) => summarize(samples, p));
    const totalOk = samples.filter((s) => s.ok).length;
    const totalFail = samples.filter((s) => !s.ok).length;

    console.log(`\n=== 各 Phase 結果（單位 ms）===`);
    console.log('Phase | total | ok / fail | avg | p50 | p95 | p99 | min | max');
    for (const s of stats) {
      console.log(`${s.phase} | ${s.total} | ${s.ok} / ${s.fail} | ${s.avg_ms} | ${s.p50_ms} | ${s.p95_ms} | ${s.p99_ms} | ${s.min_ms} | ${s.max_ms}`);
    }

    // 寫報告
    const md = renderReport({ wallMs, totalOk, totalFail, stats, dist, isPgBouncer, url, mode: MODE, totalWorkers: phases.length });
    const dest = join(process.cwd(), 'docs', 'testspeed_0504_1.md');
    if (APPEND) {
      const { readFileSync, existsSync } = await import('node:fs');
      const existing = existsSync(dest) ? readFileSync(dest, 'utf-8') : '';
      writeFileSync(dest, existing + '\n\n---\n\n' + md, 'utf-8');
      console.log(`\n📝 報告已 append：${dest}`);
    } else {
      writeFileSync(dest, md, 'utf-8');
      console.log(`\n📝 報告已寫入：${dest}`);
    }
  } finally {
    await pool.end();
  }
}

function renderReport(opts: {
  wallMs: number;
  totalOk: number;
  totalFail: number;
  stats: PhaseStat[];
  dist: Record<number, number>;
  isPgBouncer: boolean;
  url: string;
  mode: Mode;
  totalWorkers: number;
}): string {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const modeTitle: Record<Mode, string> = {
    all: '500 人隨機挑 Phase 1-5 同時跑（壓力極限）',
    players: '500 人隨機挑 Phase 1-3 同時跑（純玩家行為，剔除 4/5 global CTE）',
    realistic: '500 玩家挑 Phase 1-3 + 1 主持人觸發 Phase 4 + 1 主持人觸發 Phase 5（真實情境）',
  };
  const modeContext: Record<Mode, string> = {
    all: '500 個 worker 同時起跑，每個 worker **uniform random** 挑一個 Phase 執行：',
    players: '500 個 worker 同時起跑，每個 worker **uniform random** 挑 Phase 1-3 之一（剔除主持人才會觸發的 Phase 4/5 global CTE）：',
    realistic: '500 個玩家 worker（隨機挑 1-3）+ 1 個主持人 worker 跑 Phase 4 + 1 個主持人 worker 跑 Phase 5，全部同時起跑：',
  };
  const md: string[] = [];
  md.push(`# Mixed Workload 壓測 — ${modeTitle[opts.mode]}`);
  md.push('');
  md.push(`> 自動由 \`scripts/load-test-mixed.ts --mode=${opts.mode}\` 產出`);
  md.push(`> 執行時間：${ts}（UTC）`);
  md.push('');
  md.push(`## 情境`);
  md.push('');
  md.push(modeContext[opts.mode]);
  md.push('');
  md.push('| Phase | 動作 | worker 數 |');
  md.push('|-------|------|----------|');
  md.push(`| 1 | 抽命格 \`drawDestiny\` | ${opts.dist[1] ?? 0} |`);
  md.push(`| 2 | 買股 \`buyStock\` | ${opts.dist[2] ?? 0} |`);
  md.push(`| 3 | 查排行榜 \`leaderboardCompute\` | ${opts.dist[3] ?? 0} |`);
  if (opts.mode !== 'players') {
    md.push(`| 4 | 強制平倉 \`forceLiquidation\` CTE | ${opts.dist[4] ?? 0} |`);
    md.push(`| 5 | 業力影響 \`karmaBandTick\` CTE | ${opts.dist[5] ?? 0} |`);
  }
  md.push('');
  md.push('');
  md.push(`## 環境`);
  md.push('');
  md.push(`| 項目 | 值 |`);
  md.push(`|------|----|`);
  md.push(`| worker 數 | ${opts.totalWorkers} |`);
  md.push(`| pg pool size | ${POOL} |`);
  md.push(`| PgBouncer 6543 | ${opts.isPgBouncer ? '✅' : '⚠️ 5432'} |`);
  md.push(`| Region | ap-northeast-1（東京）|`);
  md.push(`| 設置 | 每人 \`$100,000\` / karma 隨機 -200~400 / 每人 10 股一檔 |`);
  md.push('');
  md.push(`## 整體`);
  md.push('');
  md.push(`- 總 wallclock：**${opts.wallMs} ms**`);
  md.push(`- throughput：**${(opts.totalWorkers / (opts.wallMs / 1000)).toFixed(1)} req/s**`);
  md.push(`- 成功：${opts.totalOk} / 失敗：${opts.totalFail} / 錯誤率 ${((opts.totalFail / opts.totalWorkers) * 100).toFixed(2)}%`);
  md.push('');
  md.push(`## 各 Phase Latency（單位 ms）`);
  md.push('');
  md.push(`| Phase | 動作 | total | ok | fail | avg | p50 | **p95** | p99 | min | max |`);
  md.push(`|-------|------|-------|----|----|-----|-----|---------|-----|-----|-----|`);
  for (const s of opts.stats) {
    if (s.total === 0) continue; // mode=players 時 4/5 都 0，不列出
    const p95Cls = s.p95_ms < 300 ? '✅' : s.p95_ms < 1000 ? '🟡' : '🔴';
    md.push(`| ${s.phase} | ${s.name} | ${s.total} | ${s.ok} | ${s.fail} | ${s.avg_ms} | ${s.p50_ms} | **${s.p95_ms}** ${p95Cls} | ${s.p99_ms} | ${s.min_ms} | ${s.max_ms} |`);
  }
  md.push('');
  md.push(`> 驗收門檻（CLAUDE.md §12）：p95 < 300ms ✅；超過 1s 標 🔴`);
  md.push('');

  // 錯誤分布
  const phasesWithErrors = opts.stats.filter((s) => s.errors.length > 0);
  if (phasesWithErrors.length > 0) {
    md.push(`## 錯誤分佈`);
    md.push('');
    for (const s of phasesWithErrors) {
      md.push(`### Phase ${s.phase} — ${s.name}`);
      for (const e of s.errors) {
        md.push(`- \`${e.msg}\` × ${e.count}`);
      }
      md.push('');
    }
  }

  md.push(`## 結論`);
  md.push('');
  const activeStats = opts.stats.filter((s) => s.total > 0);
  const allP95Ok = activeStats.every((s) => s.p95_ms < 300);
  const allErrOk = activeStats.every((s) => s.fail / Math.max(1, s.total) < 0.001);
  md.push(`- p95 < 300ms：${allP95Ok ? '✅ 全部通過' : '⚠️ 有 phase 超標（見上表）'}`);
  md.push(`- error rate < 0.1%：${allErrOk ? '✅ 全部通過' : '⚠️ 有 phase 超標'}`);
  md.push('');

  return md.join('\n') + '\n';
}

main().catch((e) => {
  console.error('\n❌ 失敗：', e);
  process.exit(1);
});
