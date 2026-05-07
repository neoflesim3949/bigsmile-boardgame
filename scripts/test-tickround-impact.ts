/**
 * tickRound 合併單 tx vs 拆兩 tx 結構成本對照
 *
 * **不影響 production 資料**：所有 query 用 SELECT 替換，COMMIT 替換為 ROLLBACK。
 * 量的是「結構成本」（acquire / BEGIN / ROLLBACK 次數），COMMIT 的 fsync 差另計（見 §4）。
 *
 * 兩種結構：
 *   A. merged：1 connect + 1 BEGIN + 所有 SQL + 1 ROLLBACK + 1 release
 *   B. split：（1 connect + 1 BEGIN + tx1 SQL + 1 ROLLBACK + 1 release） × 2
 *
 * 跑：npx tsx scripts/test-tickround-impact.ts
 * 各做 5 次，取中位數。
 */

import { config as loadEnv } from 'dotenv';
import { Pool, type PoolClient } from 'pg';

loadEnv({ path: '.env.local' });

const url = process.env.DATABASE_URL!;
const isLocal = /\/\/(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);

const pool = new Pool({
  connectionString: url,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  query_timeout: 30_000,
  statement_timeout: 30_000,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});
pool.on('error', () => {});

/** tx1 內容：股價更新 + 強制平倉 + 業力（用 SELECT 模擬讀取與計算成本）*/
async function runTx1Body(c: PoolClient) {
  await c.query(`SELECT key, value FROM "AppSettings" WHERE key = 'BoardGameEnabled'`);
  await c.query(`SELECT final_scoring_triggered_at, current_round FROM "BoardConfig" WHERE id = 1`);
  // 模擬 UPDATE BoardConfig 用 SELECT 取代（structure 一致）
  await c.query(`SELECT current_round FROM "BoardConfig" WHERE id = 1 FOR UPDATE`);
  await c.query(`SELECT stock_id, change_type, change_value FROM "StockRoundScript" WHERE round = $1`, [1]);
  await c.query(`SELECT value FROM "AppSettings" WHERE key = 'StockPriceRule'`);
  const stocks = await c.query<{ id: string }>(`SELECT id, current_price FROM "Stock"`);
  // 模擬 UPDATE Stock + INSERT StockHistory 的迴圈（read-only 版）
  for (const _s of stocks.rows) {
    await c.query(`SELECT 1`);
    await c.query(`SELECT 1`);
  }
  await c.query(`SELECT event_text, force_liquidation_ratio FROM "StockRoundEvent" WHERE round = $1`, [1]);
  // 模擬 UPDATE BoardConfig marquee（read-only）
  await c.query(`SELECT marquee_text, marquee_until FROM "BoardConfig" WHERE id = 1`);
  // 模擬強制平倉 CTE：用 SELECT JOIN 替代
  await c.query(`SELECT sh.user_id, sh.stock_id, FLOOR(sh.shares * 50 / 100)::int FROM "StockHolding" sh`);
  // 業力 CTE 模擬
  await c.query(`
    SELECT ps.user_id, kb.label
    FROM "PlayerStats" ps
    LEFT JOIN LATERAL (
      SELECT label FROM "KarmaBand"
      WHERE is_active = true
        AND (karma_min IS NULL OR ps.karma >= karma_min)
        AND (karma_max IS NULL OR ps.karma <= karma_max)
      ORDER BY sort_order ASC LIMIT 1
    ) kb ON true
    WHERE ps.health > 0 AND ps.blessing > 0
  `);
  await c.query(`SELECT value FROM "AppSettings" WHERE key = 'BoardGameStartedAt'`);
  // round_tick INSERT 模擬
  await c.query(`SELECT 1`);
}

/** tx2 內容：借款利息 CTE + recompute scores（read-only 模擬）*/
async function runTx2Body(c: PoolClient) {
  // 借款利息 CTE 模擬：JOIN PlayerLoan + PlayerStats
  await c.query(`
    SELECT pl.user_id, SUM(ROUND(pl.base_interest_money_per_round * pl.balance::numeric / pl.principal))
    FROM "PlayerLoan" pl
    WHERE pl.balance > 0
    GROUP BY pl.user_id
  `);
  // recompute scores 模擬：讀全玩家 + AppSettings weights
  await c.query(`
    SELECT ps.user_id,
           ROUND(ps.money::float * 0.05 + ps.blessing::float * 200 - ps.karma::float * 150)::int
    FROM "PlayerStats" ps
  `);
}

async function runMerged(): Promise<number> {
  const t0 = Date.now();
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await runTx1Body(c);
    await runTx2Body(c);
    await c.query('ROLLBACK');
  } finally {
    c.release();
  }
  return Date.now() - t0;
}

async function runSplit(): Promise<number> {
  const t0 = Date.now();
  // tx1
  {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await runTx1Body(c);
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
  }
  // tx2
  {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await runTx2Body(c);
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
  }
  return Date.now() - t0;
}

/** 額外：量單獨一次 BEGIN/COMMIT 的 fsync overhead（trivial tx）*/
async function measureCommitCost(): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    const c = await pool.connect();
    const t0 = Date.now();
    try {
      await c.query('BEGIN');
      await c.query('SELECT 1');
      await c.query('COMMIT');
    } finally {
      c.release();
    }
    samples.push(Date.now() - t0);
  }
  return median(samples);
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

async function main() {
  console.log('🔬 tickRound 合併 vs 拆 tx 結構成本對照');
  console.log(`   各 5 次取中位數`);
  console.log(`   read-only 模擬，不影響 production\n`);

  const ROUNDS = 5;

  // 暖機（避免第一次冷啟動）
  console.log('暖機...');
  await runMerged();
  await runSplit();

  console.log('\n=== 跑 merged 5 次 ===');
  const mergedSamples: number[] = [];
  for (let i = 1; i <= ROUNDS; i++) {
    const ms = await runMerged();
    mergedSamples.push(ms);
    console.log(`  run #${i}: ${ms}ms`);
  }

  console.log('\n=== 跑 split 5 次 ===');
  const splitSamples: number[] = [];
  for (let i = 1; i <= ROUNDS; i++) {
    const ms = await runSplit();
    splitSamples.push(ms);
    console.log(`  run #${i}: ${ms}ms`);
  }

  console.log('\n=== 額外：trivial BEGIN/SELECT/COMMIT 5 次（量 fsync 成本）===');
  const commitCost = await measureCommitCost();
  console.log(`  trivial commit median: ${commitCost}ms`);

  await pool.end();

  const mergedMed = median(mergedSamples);
  const splitMed = median(splitSamples);
  const diff = splitMed - mergedMed;
  const diffPct = ((diff / splitMed) * 100).toFixed(1);

  console.log('\n=== 結果摘要 ===');
  console.log(`| 指標 | merged 中位數 | split 中位數 | split − merged |`);
  console.log(`|------|--------------|-------------|----------------|`);
  console.log(`| 結構成本（含 ROLLBACK，無 fsync）| ${mergedMed}ms | ${splitMed}ms | ${diff}ms (${diffPct}%) |`);
  console.log(`\n單獨 commit fsync 成本：~${commitCost}ms / 次（可加到實際生產差）`);
  console.log(`→ 真實生產情境（merge 比 split 少 1 個 COMMIT）：merged 比 split 約快 ${diff + commitCost}ms`);
  console.log(`→ 但更重要的是 **merged tx 半完成狀態風險為 0**（split 在 tx1 commit + tx2 fail 時會留漏扣利息的問題）`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
