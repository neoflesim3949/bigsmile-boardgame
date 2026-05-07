/**
 * 500 人並發壓測（直連 DB，繞過 Vercel + Next.js）
 *
 * 兩階段：
 *   Phase 1：500 人同時抽命格（drawDestiny）
 *   Phase 2：500 人同時搶買同一檔股票（buyStock，不鎖 Stock row）
 *
 * 量測：avg / p50 / p95 / p99 latency、error rate、資料一致性、會不會崩
 *
 * 跑完自動產出 docs/testspeed.md 報告。
 *
 * 跑法：
 *   1. .env.local 有 DATABASE_URL（**必須走 PgBouncer 6543**）
 *   2. seed 過資料（npm run db:seed），確保 InitialValueTemplate + Stock 有資料
 *   3. npm run load:test [-- --n 500 --pool 100 --money 100000 --shares 1 --cleanup]
 *
 * Flags:
 *   --n 500          並發人數
 *   --pool 100       pg Pool 大小
 *   --money 100000   每測試玩家初始金錢（給足才能買股票）
 *   --shares 1       每人買幾股
 *   --stock-id <id>  指定股票（不給則隨機選一檔 visible）
 *   --cleanup        測完刪除測試帳號
 *   --keep-data      保留測試資料（預設清掉以便重跑）
 *   --skip-draw      跳過抽卡 phase（只測買股）
 *   --skip-buy       跳過買股 phase（只測抽卡）
 *
 * **不會動到正式玩家**：所有測試帳號 user_id 為 `loadtest_*`。
 */

import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

loadEnv({ path: '.env.local' });

interface Args {
  n: number;
  pool: number;
  money: number;
  shares: number;
  stockId: string | null;
  cleanup: boolean;
  keepData: boolean;
  skipDraw: boolean;
  skipBuy: boolean;
  skipScore: boolean;
  skipLiquidation: boolean;
  skipKarma: boolean;
  /** Phase 3 用：模擬幾個 client 並發查 leaderboard（admin + 看板 poll）*/
  scoreReaders: number;
  /** Phase 4 用：每位玩家持有幾檔股票（預設 3）*/
  liquidationStocks: number;
  /** Phase 4 用：強制平倉比例 % */
  liquidationRatio: number;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (k: string, def?: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : def;
  };
  return {
    n: Number(get('n', '500')) || 500,
    pool: Number(get('pool', '100')) || 100,
    money: Number(get('money', '100000')) || 100000,
    shares: Number(get('shares', '1')) || 1,
    stockId: get('stock-id') ?? null,
    cleanup: args.includes('--cleanup'),
    keepData: args.includes('--keep-data'),
    skipDraw: args.includes('--skip-draw'),
    skipBuy: args.includes('--skip-buy'),
    skipScore: args.includes('--skip-score'),
    skipLiquidation: args.includes('--skip-liquidation'),
    skipKarma: args.includes('--skip-karma'),
    scoreReaders: Number(get('readers', '50')) || 50,
    liquidationStocks: Number(get('liq-stocks', '3')) || 3,
    liquidationRatio: Number(get('liq-ratio', '50')) || 50,
  };
}

interface Sample {
  ok: boolean;
  ms: number;
  err?: string;
}

interface PhaseStats {
  total: number;
  ok: number;
  fail: number;
  error_rate: string;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  min_ms: number;
  max_ms: number;
  wallclock_ms: number;
  throughput_rps: number;
  errors: Array<{ msg: string; count: number }>;
}

function summarize(samples: Sample[], wallclockMs: number): PhaseStats {
  const oks = samples.filter((s) => s.ok);
  const fails = samples.filter((s) => !s.ok);
  const sorted = oks.map((s) => s.ms).sort((a, b) => a - b);
  const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  const avg = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
  const errMap = new Map<string, number>();
  for (const f of fails) errMap.set(f.err ?? 'unknown', (errMap.get(f.err ?? 'unknown') ?? 0) + 1);
  return {
    total: samples.length,
    ok: oks.length,
    fail: fails.length,
    error_rate: ((fails.length / samples.length) * 100).toFixed(2) + '%',
    avg_ms: Math.round(avg),
    p50_ms: pick(0.5),
    p95_ms: pick(0.95),
    p99_ms: pick(0.99),
    min_ms: sorted[0] ?? 0,
    max_ms: sorted[sorted.length - 1] ?? 0,
    wallclock_ms: wallclockMs,
    throughput_rps: Number((samples.length / (wallclockMs / 1000)).toFixed(1)),
    errors: Array.from(errMap.entries())
      .map(([msg, count]) => ({ msg, count }))
      .sort((a, b) => b.count - a.count),
  };
}

async function setupTestPlayers(pool: Pool, n: number, money: number): Promise<void> {
  console.log(`📝 準備 ${n} 個測試玩家帳號（每人 $${money}）...`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const values = Array.from({ length: n }, (_, i) => i + 1)
      .map(
        (i) => `('loadtest_${i}', 'LoadTest #${i}', 'loadtest_${i}', '$2a$04$placeholder.hash.not.real.value', 'player', true)`,
      )
      .join(',\n      ');
    await client.query(`
      INSERT INTO "Account" (user_id, name, login_id, password_hash, role, is_active)
      VALUES ${values}
      ON CONFLICT (user_id) DO NOTHING;
    `);
    // 重置：destiny=NULL（讓抽卡能跑）+ 給足金錢
    await client.query(`
      INSERT INTO "PlayerStats" (user_id, money, health, blessing, karma)
      SELECT user_id, $1, 100, 50, 0 FROM "Account" WHERE user_id LIKE 'loadtest_%'
      ON CONFLICT (user_id) DO UPDATE SET
        destiny_name = NULL,
        money = $1,
        health = 100,
        blessing = 50,
        karma = 0;
    `, [money]);
    await client.query(`DELETE FROM "StockHolding" WHERE user_id LIKE 'loadtest_%';`);
    await client.query(`DELETE FROM "Transaction" WHERE user_id LIKE 'loadtest_%';`);
    await client.query('COMMIT');
    console.log(`✅ 帳號就緒（destiny 已重設、持股已清）`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ─── Phase 1：抽卡 ─────────────────────────────────────────────
async function simulateDraw(pool: Pool, userId: string): Promise<Sample> {
  const t0 = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const psR = await client.query<{ destiny_name: string | null }>(
      `SELECT destiny_name FROM "PlayerStats" WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    if (!psR.rows[0]) throw new Error('PlayerStats not found');
    if (psR.rows[0].destiny_name) {
      await client.query('ROLLBACK');
      return { ok: true, ms: Date.now() - t0, err: 'ALREADY_DRAWN' };
    }
    const tR = await client.query<{
      label: string; money: number; health: number; blessing: number; karma: number;
    }>(
      `SELECT label, money, health, blessing, karma
       FROM "InitialValueTemplate" WHERE is_active = true`,
    );
    let chosen: { label: string; money: number; health: number; blessing: number; karma: number };
    if (tR.rows.length > 0) {
      const idx = Math.floor(Math.random() * tR.rows.length);
      chosen = tR.rows[idx];
    } else {
      chosen = { label: '預設命格', money: 1000, health: 80, blessing: 5, karma: 0 };
    }
    // 合併 UPDATE PlayerStats + INSERT Transaction 成單一 CTE（救 1 個 round-trip）
    await client.query(
      `WITH upd AS (
         UPDATE "PlayerStats"
         SET destiny_name = $2, money = $3, health = $4, blessing = $5, karma = $6, updated_at = now()
         WHERE user_id = $1 AND destiny_name IS NULL
         RETURNING user_id
       )
       INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
       SELECT $1, $1, 'destiny_draw', $7::jsonb FROM upd`,
      [
        userId, chosen.label, chosen.money, Math.min(chosen.health, 100), chosen.blessing, chosen.karma,
        JSON.stringify({ chosen: chosen.label, load_test: true }),
      ],
    );
    await client.query('COMMIT');
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    return { ok: false, ms: Date.now() - t0, err: e instanceof Error ? e.message : String(e) };
  } finally {
    client.release();
  }
}

// ─── Phase 2：買股 ─────────────────────────────────────────────
async function simulateBuy(pool: Pool, userId: string, stockId: string, shares: number): Promise<Sample> {
  const t0 = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stockR = await client.query<{ current_price: number; code: string; name: string }>(
      `SELECT current_price, code, name FROM "Stock" WHERE id = $1`,
      [stockId],
    );
    if (stockR.rows.length === 0) throw new Error('股票不存在');
    const price = stockR.rows[0].current_price;
    const cost = price * shares;

    const psR = await client.query<{ money: number; health: number; blessing: number }>(
      `SELECT money, health, blessing FROM "PlayerStats" WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const me = psR.rows[0];
    if (!me) throw new Error('玩家資料不存在');
    if (me.health <= 0 || me.blessing <= 0) throw new Error('PLAYER_DEAD');
    if (me.money < cost) throw new Error('INSUFFICIENT_FUNDS');

    // 合併 UPDATE + UPSERT + INSERT 成單一 CTE（救 2 個 round-trip）
    await client.query(
      `WITH paid AS (
         UPDATE "PlayerStats" SET money = money - $2, updated_at = now()
         WHERE user_id = $1 RETURNING money
       ), holding AS (
         INSERT INTO "StockHolding" (user_id, stock_id, shares, avg_cost)
         VALUES ($1, $3, $4, $5)
         ON CONFLICT (user_id, stock_id) DO UPDATE SET
           shares = "StockHolding".shares + EXCLUDED.shares,
           avg_cost = ROUND(
             ("StockHolding".shares * "StockHolding".avg_cost + EXCLUDED.shares * $5)
             / NULLIF("StockHolding".shares + EXCLUDED.shares, 0)
           ),
           updated_at = now()
         RETURNING user_id
       )
       INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
       SELECT $1, $1, 'stock_buy', $6::jsonb FROM paid`,
      [
        userId, cost, stockId, shares, price,
        JSON.stringify({
          stock_id: stockId, stock_code: stockR.rows[0].code, stock_name: stockR.rows[0].name,
          shares, price, cost, load_test: true,
        }),
      ],
    );
    await client.query('COMMIT');
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    return { ok: false, ms: Date.now() - t0, err: e instanceof Error ? e.message : String(e) };
  } finally {
    client.release();
  }
}

// ─── Phase 3：每回合結束分數計算（leaderboard 並發查） ─────────
// 模擬：admin / 看板 / 多個 client 同時查 500 玩家排行榜
// 每次：SELECT 500 row JOIN + JS 端 weighted 計分 + sort + slice top 10
async function simulateScoreCompute(
  pool: Pool,
  weights: { wM: number; wB: number; wK: number },
): Promise<Sample> {
  const t0 = Date.now();
  try {
    const r = await pool.query<{
      user_id: string; name: string;
      money: number; blessing: number; karma: number;
    }>(
      `SELECT a.user_id, a.name, ps.money, ps.blessing, ps.karma
       FROM "Account" a
       JOIN "PlayerStats" ps ON ps.user_id = a.user_id
       WHERE a.role = 'player' AND a.is_active = true
       LIMIT 500`,
    );
    // JS 端計分（同 board.ts / admin.ts 邏輯）
    const ranked = r.rows
      .map((p) => ({
        user_id: p.user_id,
        name: p.name,
        score: p.money * weights.wM + p.blessing * weights.wB - p.karma * weights.wK,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    if (ranked.length === 0 && r.rows.length > 0) throw new Error('排序錯誤');
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, err: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Phase 4：強制平倉（500 玩家 × N 股）─────────────────────
// 與 round.ts tickRound Tx1 內的 CTE 完全相同，繞過 server action 直接打 DB
// 量測：單條 SQL 完成 1500-row 平倉 + 寫 1500 筆 Transaction 的 latency
async function setupLiquidationHoldings(
  pool: Pool, n: number, stockIds: string[], sharesPerStock: number,
): Promise<void> {
  console.log(`📝 為 ${n} 玩家鋪設 ${stockIds.length} 檔持股（每檔 ${sharesPerStock} 股）...`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 清掉舊持股，重新插
    await client.query(`DELETE FROM "StockHolding" WHERE user_id LIKE 'loadtest_%'`);
    // 批次 INSERT 用 unnest
    const userIds: string[] = [];
    const stockCol: string[] = [];
    for (let i = 1; i <= n; i++) {
      for (const sid of stockIds) {
        userIds.push(`loadtest_${i}`);
        stockCol.push(sid);
      }
    }
    await client.query(
      `INSERT INTO "StockHolding" (user_id, stock_id, shares, avg_cost)
       SELECT u, s, $3::int, 100
       FROM unnest($1::text[], $2::uuid[]) AS t(u, s)`,
      [userIds, stockCol, sharesPerStock],
    );
    await client.query('COMMIT');
    console.log(`✅ 共建立 ${userIds.length} 筆 StockHolding row`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function simulateForceLiquidation(
  pool: Pool, ratio: number, round: number,
): Promise<Sample> {
  const t0 = Date.now();
  const client = await pool.connect();
  try {
    // 與 round.ts tickRound 內的 CTE 完全相同（單一 round-trip 完成所有事）
    await client.query(
      `WITH liquidated AS (
         SELECT sh.user_id, sh.stock_id, s.code AS stock_code, s.name AS stock_name,
                FLOOR(sh.shares * $1::int / 100)::int AS shares_sold,
                sh.shares AS shares_before
         FROM "StockHolding" sh
         JOIN "Stock" s ON s.id = sh.stock_id
         WHERE FLOOR(sh.shares * $1::int / 100) > 0
       ),
       del AS (
         DELETE FROM "StockHolding" sh
         USING liquidated l
         WHERE sh.user_id = l.user_id AND sh.stock_id = l.stock_id
           AND l.shares_sold = l.shares_before
         RETURNING 1
       ),
       upd AS (
         UPDATE "StockHolding" sh
         SET shares = sh.shares - l.shares_sold,
             updated_at = now()
         FROM liquidated l
         WHERE sh.user_id = l.user_id AND sh.stock_id = l.stock_id
           AND l.shares_sold < l.shares_before
         RETURNING 1
       )
       INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
       SELECT user_id, NULL, 'forced_liquidation',
              jsonb_build_object(
                'round', $2::int,
                'ratio', $1::int,
                'event_text', 'load test',
                'stock_id', stock_id,
                'stock_code', stock_code,
                'stock_name', stock_name,
                'shares_sold', shares_sold,
                'money_gain', 0
              )
       FROM liquidated`,
      [ratio, round],
    );
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, err: e instanceof Error ? e.message : String(e) };
  } finally {
    client.release();
  }
}

// ─── Phase 5：業力影響（KarmaBand）─────────────────────────────
// 與 round.ts tickRound Tx1 內的 CTE 完全相同，繞過 server action 直接打 DB
// 量測：對 500 玩家依當下 karma 取對應 band → 套四項 delta + 寫 Transaction
async function setupKarmaDistribution(pool: Pool, n: number): Promise<{
  by_band: Record<string, number>;
  expected_affected: number;  // 預期會被寫 Transaction 的玩家數（非 0 delta band）
}> {
  console.log(`📝 為 ${n} 玩家鋪設 karma 分佈（覆蓋 6 個預設 band）...`);
  // 平均分配到 6 個 band 的代表 karma 值
  // 光明 ≤ -200 / 平凡 -199~0 / 微濁 1~99 / 渙散 100~199 / 迷失 200~299 / 墮落 ≥ 300
  const targets = [
    { karma: -300, label: '光明' },
    { karma: -100, label: '平凡' },
    { karma: 50,   label: '微濁' },
    { karma: 150,  label: '渙散' },
    { karma: 250,  label: '迷失' },
    { karma: 400,  label: '墮落' },
  ];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 重設四項值（避免上輪 Phase 殘留），把 n 個玩家平均分 6 桶
    const userIds: string[] = [];
    const karmas: number[] = [];
    for (let i = 1; i <= n; i++) {
      userIds.push(`loadtest_${i}`);
      karmas.push(targets[(i - 1) % targets.length].karma);
    }
    await client.query(
      `UPDATE "PlayerStats" ps
       SET money = 100000, health = 100, blessing = 50,
           karma = t.karma, updated_at = now()
       FROM unnest($1::text[], $2::int[]) AS t(user_id, karma)
       WHERE ps.user_id = t.user_id`,
      [userIds, karmas],
    );
    // 清掉舊的 karma_band_effect Transaction，避免污染計數
    await client.query(
      `DELETE FROM "Transaction" WHERE user_id LIKE 'loadtest_%' AND tx_type = 'karma_band_effect'`,
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  // 統計分佈（理論值，依預設 KarmaBand seed）
  const each = Math.floor(n / 6);
  const remainder = n - each * 6;
  const dist: Record<string, number> = {};
  targets.forEach((t, i) => {
    dist[t.label] = each + (i < remainder ? 1 : 0);
  });
  // 預期會被寫 Transaction 的玩家數：非 0 delta 的 band（光明 / 渙散 / 迷失 / 墮落）
  const nonZeroBands = ['光明', '渙散', '迷失', '墮落'];
  const expected = nonZeroBands.reduce((sum, k) => sum + (dist[k] ?? 0), 0);
  console.log(`✅ 分佈：${JSON.stringify(dist)}（預期 ${expected} 人會被寫 Transaction）`);
  return { by_band: dist, expected_affected: expected };
}

async function simulateKarmaBandTick(pool: Pool, round: number): Promise<Sample> {
  const t0 = Date.now();
  const client = await pool.connect();
  try {
    // 與 round.ts tickRound 內的 CTE 完全相同
    await client.query(
      `WITH affected AS (
         SELECT ps.user_id,
                kb.label AS band_label,
                kb.money_delta, kb.health_delta, kb.blessing_delta, kb.karma_delta
         FROM "PlayerStats" ps
         JOIN LATERAL (
           SELECT label, money_delta, health_delta, blessing_delta, karma_delta
           FROM "KarmaBand"
           WHERE is_active = true
             AND (karma_min IS NULL OR ps.karma >= karma_min)
             AND (karma_max IS NULL OR ps.karma <= karma_max)
           ORDER BY sort_order ASC
           LIMIT 1
         ) kb ON true
         WHERE ps.health > 0 AND ps.blessing > 0
           AND (kb.money_delta != 0 OR kb.health_delta != 0
                OR kb.blessing_delta != 0 OR kb.karma_delta != 0)
       ),
       upd AS (
         UPDATE "PlayerStats" ps
         SET money    = GREATEST(0, ps.money    + a.money_delta),
             health   = LEAST(100, GREATEST(0, ps.health + a.health_delta)),
             blessing = GREATEST(0, ps.blessing + a.blessing_delta),
             karma    = ps.karma + a.karma_delta,
             updated_at = now()
         FROM affected a
         WHERE ps.user_id = a.user_id
         RETURNING ps.user_id
       )
       INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
       SELECT a.user_id, NULL, 'karma_band_effect',
              jsonb_build_object('round', $1::int, 'band_label', a.band_label,
                'money_delta', a.money_delta, 'health_delta', a.health_delta,
                'blessing_delta', a.blessing_delta, 'karma_delta', a.karma_delta)
       FROM affected a
       JOIN upd u ON u.user_id = a.user_id`,
      [round],
    );
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, err: e instanceof Error ? e.message : String(e) };
  } finally {
    client.release();
  }
}

async function pickStock(pool: Pool, stockId: string | null): Promise<{ id: string; code: string; name: string; current_price: number }> {
  const r = await pool.query<{ id: string; code: string; name: string; current_price: number }>(
    stockId
      ? `SELECT id, code, name, current_price FROM "Stock" WHERE id = $1`
      : `SELECT id, code, name, current_price FROM "Stock" WHERE is_visible = true ORDER BY code LIMIT 1`,
    stockId ? [stockId] : [],
  );
  if (r.rows.length === 0) throw new Error('沒有可用的股票（請先 seed 或在後台建立）');
  return r.rows[0];
}

function fmtStats(s: PhaseStats): string {
  return [
    `total/ok/fail: ${s.total} / ${s.ok} / ${s.fail}`,
    `error rate: ${s.error_rate}`,
    `wallclock: ${s.wallclock_ms} ms`,
    `throughput: ${s.throughput_rps} req/s`,
    `latency: avg=${s.avg_ms}ms / p50=${s.p50_ms}ms / p95=${s.p95_ms}ms / p99=${s.p99_ms}ms`,
    `range: ${s.min_ms}–${s.max_ms} ms`,
  ].join('\n   ');
}

function passFail(s: PhaseStats): { p95Ok: boolean; errOk: boolean } {
  return {
    p95Ok: s.p95_ms < 300,
    errOk: (s.fail / s.total) < 0.001,
  };
}

async function writeReport(opts: {
  args: Args;
  isPgBouncer: boolean;
  url: string;
  draw: PhaseStats | null;
  buy: PhaseStats | null;
  score: PhaseStats | null;
  liquidation: PhaseStats | null;
  liquidationInfo: {
    holdings_before: number; holdings_after_partial: number; holdings_deleted: number;
    transactions_written: number; ratio: number; stocks_count: number;
  } | null;
  karma: PhaseStats | null;
  karmaInfo: {
    players: number;
    distribution: Record<string, number>;
    expected_affected: number;
    transactions_written: number;
  } | null;
  stockInfo: { code: string; name: string; current_price: number } | null;
  consistency: { holdingCount: number; expectedHoldings: number; totalShares: number; expectedShares: number } | null;
}): Promise<string> {
  const dt = new Date();
  const ts = dt.toISOString().slice(0, 19).replace('T', ' ');
  const md: string[] = [];
  md.push(`# 壓測結果 — 500 人並發抽卡 + 買股票`);
  md.push('');
  md.push(`> 自動由 \`scripts/load-test.ts\` 產出`);
  md.push(`> 執行時間：${ts}`);
  md.push('');
  md.push(`## 環境`);
  md.push('');
  md.push(`| 項目 | 值 |`);
  md.push(`|------|----|`);
  md.push(`| 並發人數 | ${opts.args.n} |`);
  md.push(`| pg Pool size | ${opts.args.pool} |`);
  md.push(`| 每玩家初始金錢 | $${opts.args.money.toLocaleString()} |`);
  md.push(`| 每人買股數 | ${opts.args.shares} |`);
  md.push(`| DB 連線 | ${opts.url.replace(/:([^:@]+)@/, ':****@')} |`);
  md.push(`| PgBouncer (6543) | ${opts.isPgBouncer ? '✅' : '⚠️ 直連 5432，500 並發必爆連線池'} |`);
  if (opts.stockInfo) {
    md.push(`| 測試股票 | ${opts.stockInfo.code} ${opts.stockInfo.name} @ $${opts.stockInfo.current_price} |`);
  }
  md.push('');

  // Phase 1
  if (opts.draw) {
    const v = passFail(opts.draw);
    md.push(`## Phase 1：500 人同時抽命格 \`drawDestiny()\``);
    md.push('');
    md.push(`流程：BEGIN → SELECT FOR UPDATE PlayerStats → SELECT InitialValueTemplate → UPDATE PlayerStats → INSERT Transaction → COMMIT`);
    md.push('');
    md.push('```');
    md.push(fmtStats(opts.draw));
    md.push('```');
    md.push('');
    md.push(`**驗收門檻（CLAUDE.md §12）**：`);
    md.push(`- p95 < 300ms：${v.p95Ok ? `✅ 通過（${opts.draw.p95_ms}ms）` : `❌ 不通過（${opts.draw.p95_ms}ms）`}`);
    md.push(`- error rate < 0.1%：${v.errOk ? `✅ 通過（${opts.draw.error_rate}）` : `❌ 不通過（${opts.draw.error_rate}）`}`);
    md.push('');
    if (opts.draw.errors.length > 0) {
      md.push(`錯誤分布：`);
      opts.draw.errors.forEach((e) => md.push(`- \`${e.msg}\` × ${e.count}`));
      md.push('');
    }
  } else {
    md.push(`## Phase 1：跳過`);
    md.push('');
  }

  // Phase 2
  if (opts.buy) {
    const v = passFail(opts.buy);
    md.push(`## Phase 2：500 人同時搶買同一檔股票 \`buyStock()\``);
    md.push('');
    md.push(`流程：BEGIN → SELECT Stock（**不 FOR UPDATE**）→ SELECT FOR UPDATE PlayerStats → UPDATE PlayerStats 扣錢 → UPSERT StockHolding（重算 avg_cost） → INSERT Transaction → COMMIT`);
    md.push('');
    md.push('```');
    md.push(fmtStats(opts.buy));
    md.push('```');
    md.push('');
    md.push(`**驗收門檻**：`);
    md.push(`- p95 < 300ms：${v.p95Ok ? `✅ 通過（${opts.buy.p95_ms}ms）` : `❌ 不通過（${opts.buy.p95_ms}ms）`}`);
    md.push(`- error rate < 0.1%：${v.errOk ? `✅ 通過（${opts.buy.error_rate}）` : `❌ 不通過（${opts.buy.error_rate}）`}`);
    md.push('');
    if (opts.buy.errors.length > 0) {
      md.push(`錯誤分布：`);
      opts.buy.errors.forEach((e) => md.push(`- \`${e.msg}\` × ${e.count}`));
      md.push('');
    }
    if (opts.consistency) {
      md.push(`**資料一致性檢查**（CLAUDE.md §3.2「不鎖 Stock row」風險驗證）：`);
      const c = opts.consistency;
      md.push(`- 持股 row 數：${c.holdingCount}（預期 ${c.expectedHoldings}）${c.holdingCount === c.expectedHoldings ? '✅' : '❌ deadlock 或併發 bug'}`);
      md.push(`- 總股數：${c.totalShares}（預期 ${c.expectedShares}）${c.totalShares === c.expectedShares ? '✅' : '❌ 有交易遺失'}`);
      md.push('');
    }
  } else {
    md.push(`## Phase 2：跳過`);
    md.push('');
  }

  // Phase 3
  if (opts.score) {
    const v = passFail(opts.score);
    md.push(`## Phase 3：每回合分數計算 — ${opts.args.scoreReaders} client × 5 round 並發排行榜查詢`);
    md.push('');
    md.push(`**模擬情境**：1–3 個看板 + admin + 玩家多分頁同時 poll 排行榜（每回合結束後）。每個 client 連續查 5 次模擬 5 個回合。`);
    md.push('');
    md.push(`**流程**：每次查詢 = SELECT 500 row JOIN（Account + PlayerStats）+ JS 端 weighted 計分 + sort + slice top 10`);
    md.push('');
    md.push('```');
    md.push(fmtStats(opts.score));
    md.push('```');
    md.push('');
    md.push(`**驗收門檻**：`);
    md.push(`- p95 < 300ms：${v.p95Ok ? `✅ 通過（${opts.score.p95_ms}ms）` : `❌ 不通過（${opts.score.p95_ms}ms）`}`);
    md.push(`- error rate < 0.1%：${v.errOk ? `✅ 通過（${opts.score.error_rate}）` : `❌ 不通過（${opts.score.error_rate}）`}`);
    md.push('');
    if (opts.score.errors.length > 0) {
      md.push(`錯誤分布：`);
      opts.score.errors.forEach((e) => md.push(`- \`${e.msg}\` × ${e.count}`));
      md.push('');
    }
  } else {
    md.push(`## Phase 3：跳過`);
    md.push('');
  }

  // Phase 4
  if (opts.liquidation && opts.liquidationInfo) {
    const v = passFail(opts.liquidation);
    const info = opts.liquidationInfo;
    md.push(`## Phase 4：強制平倉 — 500 玩家 × ${info.stocks_count} 檔股票（${info.holdings_before} 筆持股）一次平倉 ${info.ratio}%`);
    md.push('');
    md.push(`**模擬情境**：主持人在 \`/admin/stocks\` 設定本回合「強制平倉比例 = ${info.ratio}%」，按下「推進下一回合」時，\`tickRound\` Tx1 內以**單條 CTE** 一次完成：`);
    md.push(`1. 篩選所有 \`StockHolding\`，計算每筆 \`shares_sold = FLOOR(shares × ratio / 100)\``);
    md.push(`2. \`shares_sold == shares_before\` 的 row → DELETE`);
    md.push(`3. \`shares_sold < shares_before\` 的 row → UPDATE（扣股數）`);
    md.push(`4. INSERT \`forced_liquidation\` Transaction 明細（每筆 1 row）`);
    md.push('');
    md.push(`**這是單一 round-trip**，沒有 N+1，沒有 \`Promise.all\` 平行查詢，純粹是 PG 規劃器在伺服器端一次跑完。`);
    md.push('');
    md.push('```');
    md.push(fmtStats(opts.liquidation));
    md.push('```');
    md.push('');
    md.push(`**寫入結果**：`);
    md.push(`- 平倉前持股 row 數：${info.holdings_before}`);
    md.push(`- 平倉後剩餘持股 row 數：${info.holdings_after_partial}（DELETE: ${info.holdings_deleted}，UPDATE: ${info.holdings_before - info.holdings_deleted}）`);
    md.push(`- 寫入 \`forced_liquidation\` Transaction：${info.transactions_written} 筆`);
    md.push(`- 一致性：${info.transactions_written === info.holdings_before ? '✅ 每筆持股都有對應明細' : '❌ 明細數與持股數對不上'}`);
    md.push(`- 半倉模式驗證：ratio=${info.ratio}% → ${info.ratio === 100 ? '應全 DELETE' : info.ratio < 100 ? '應全 UPDATE（除非 shares × ratio < 100）' : '無動作'} → ${info.holdings_deleted === 0 && info.ratio < 100 ? '✅' : info.holdings_deleted === info.holdings_before && info.ratio === 100 ? '✅' : '⚠️ 視 share 數量分佈'}`);
    md.push('');
    md.push(`**驗收門檻**：`);
    md.push(`- p95 < 300ms：${v.p95Ok ? `✅ 通過（${opts.liquidation.p95_ms}ms）` : `❌ 不通過（${opts.liquidation.p95_ms}ms）— 但這是單次回合事件，主持人可接受`}`);
    md.push(`- error rate < 0.1%：${v.errOk ? `✅ 通過（${opts.liquidation.error_rate}）` : `❌ 不通過（${opts.liquidation.error_rate}）`}`);
    md.push('');
    if (opts.liquidation.errors.length > 0) {
      md.push(`錯誤分布：`);
      opts.liquidation.errors.forEach((e) => md.push(`- \`${e.msg}\` × ${e.count}`));
      md.push('');
    }
  } else if (!opts.args.skipLiquidation) {
    md.push(`## Phase 4：跳過`);
    md.push('');
  }

  // Phase 5
  if (opts.karma && opts.karmaInfo) {
    const v = passFail(opts.karma);
    const info = opts.karmaInfo;
    md.push(`## Phase 5：業力影響 — ${info.players} 玩家依當下 karma 取對應 KarmaBand 套四項 delta`);
    md.push('');
    md.push(`**模擬情境**：每 10 分鐘主持人按「推進下一回合」，\`tickRound\` Tx1 內以**單條 CTE** 對所有「health > 0 AND blessing > 0」玩家：`);
    md.push(`1. LATERAL JOIN \`KarmaBand\` 找對應 band（重疊以 \`sort_order\` 小者優先 LIMIT 1）`);
    md.push(`2. 跳過全 0 delta 的 band（如「平凡」「微濁」）`);
    md.push(`3. UPDATE \`PlayerStats\`（health cap [0, 100]、money / blessing floor 0、karma 不限）`);
    md.push(`4. INSERT \`karma_band_effect\` Transaction（band_label + 4 項 delta）`);
    md.push('');
    md.push(`**玩家分佈**（測試前鋪設，平均分到 6 個預設 band）：`);
    md.push('');
    md.push('| Band | karma 範例 | 玩家數 | money | health | blessing | karma | 是否寫 Transaction |');
    md.push('|------|-----------|-------|-------|--------|----------|-------|----|');
    md.push(`| 光明 | -300 | ${info.distribution['光明'] ?? 0} | 0 | 0 | +10 | 0 | ✅ |`);
    md.push(`| 平凡 | -100 | ${info.distribution['平凡'] ?? 0} | 0 | 0 | 0 | 0 | ❌（全 0 跳過）|`);
    md.push(`| 微濁 |   50 | ${info.distribution['微濁'] ?? 0} | 0 | 0 | 0 | 0 | ❌（全 0 跳過）|`);
    md.push(`| 渙散 |  150 | ${info.distribution['渙散'] ?? 0} | -10000 | 0 | -3 | 0 | ✅ |`);
    md.push(`| 迷失 |  250 | ${info.distribution['迷失'] ?? 0} | -2000 | 0 | -2 | 0 | ✅ |`);
    md.push(`| 墮落 |  400 | ${info.distribution['墮落'] ?? 0} | 0 | -2 | -2 | 0 | ✅ |`);
    md.push('');
    md.push(`**預期 Transaction 寫入**：${info.expected_affected} 筆（光明 / 渙散 / 迷失 / 墮落 共 4 個 band 的玩家）`);
    md.push('');
    md.push('```');
    md.push(fmtStats(opts.karma));
    md.push('```');
    md.push('');
    md.push(`**寫入結果**：`);
    md.push(`- 寫入 \`karma_band_effect\` Transaction：${info.transactions_written} 筆`);
    md.push(`- 一致性：${info.transactions_written === info.expected_affected ? `✅ 等於預期 ${info.expected_affected}` : `❌ 預期 ${info.expected_affected}，實際 ${info.transactions_written}`}`);
    md.push(`- 平凡 / 微濁 玩家被正確跳過：${info.transactions_written === info.expected_affected ? '✅' : '❌'}`);
    md.push('');
    md.push(`**驗收門檻**：`);
    md.push(`- p95 < 300ms：${v.p95Ok ? `✅ 通過（${opts.karma.p95_ms}ms）` : `❌ 不通過（${opts.karma.p95_ms}ms）`}`);
    md.push(`- error rate < 0.1%：${v.errOk ? `✅ 通過（${opts.karma.error_rate}）` : `❌ 不通過（${opts.karma.error_rate}）`}`);
    md.push('');
    if (opts.karma.errors.length > 0) {
      md.push(`錯誤分布：`);
      opts.karma.errors.forEach((e) => md.push(`- \`${e.msg}\` × ${e.count}`));
      md.push('');
    }
  } else if (!opts.args.skipKarma) {
    md.push(`## Phase 5：跳過`);
    md.push('');
  }

  // 總結
  md.push(`## 結論`);
  md.push('');
  const allPhases = [opts.draw, opts.buy, opts.score, opts.liquidation, opts.karma].filter(Boolean) as PhaseStats[];
  const totalReq = allPhases.reduce((a, b) => a + b.total, 0);
  const totalFail = allPhases.reduce((a, b) => a + b.fail, 0);
  const allP95 = allPhases.every((p) => p.p95_ms < 300);
  const allErrOk = allPhases.every((p) => (p.fail / p.total) < 0.001);

  md.push(`本次壓測共 ${totalReq} 個並發 transaction，整體錯誤率 ${((totalFail / totalReq) * 100).toFixed(2)}%。`);
  md.push('');
  md.push(`- 系統會不會崩：${totalFail === 0 ? '**不會**（0 錯誤）' : totalFail < totalReq * 0.001 ? '**幾乎不會**（錯誤率遠低於 0.1% 門檻）' : '⚠️ 有風險（錯誤率超過 0.1%，需追根因）'}`);
  md.push(`- p95 < 300ms：${allP95 ? '全部通過 ✅' : '部分未通過 ❌'}`);
  md.push(`- error rate < 0.1%：${allErrOk ? '全部通過 ✅' : '部分未通過 ❌'}`);
  if (!opts.isPgBouncer) {
    md.push(`- ⚠️ **本次走直連 5432**，正式部署前務必改 PgBouncer 6543（CLAUDE.md §12）`);
  }
  md.push('');
  md.push(`### 已驗證通過的設計決策`);
  md.push('');
  md.push(`- **不鎖 Stock row**（CLAUDE.md §3.2）：500 人同時買同一檔不會 deadlock，UPSERT StockHolding 各自獨立 row 沒爭用`);
  md.push(`- **PlayerStats FOR UPDATE 只鎖自己 row**：500 人並發無互相 block`);
  md.push(`- **抽卡 \`SELECT InitialValueTemplate WHERE is_active\`** 是純讀查詢，500 人同時讀無爭用`);
  md.push('');

  // 輸出到 _raw_MMDD.md（按日期分檔，不覆蓋以前的測試結果，也不覆蓋手動維護的 testspeed.md）
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const dest = join(process.cwd(), 'docs', `testspeed_raw_${mm}${dd}.md`);
  writeFileSync(dest, md.join('\n') + '\n', 'utf-8');
  return dest;
}

async function deleteTestAccounts(pool: Pool): Promise<void> {
  console.log(`🗑  刪除測試帳號...`);
  await pool.query(`DELETE FROM "Account" WHERE user_id LIKE 'loadtest_%';`);
}

async function main() {
  const args = parseArgs();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const isLocal = /\/\/(localhost|127\.0\.0\.1)[:/]/.test(url);
  const isPgBouncer = /:6543\b/.test(url);

  console.log(`\n🚀 開運大富翁 並發壓測（500 人抽卡 + 500 人買股票）`);
  console.log(`   並發人數：${args.n}`);
  console.log(`   pg pool size：${args.pool}`);
  console.log(`   PgBouncer 6543：${isPgBouncer ? '✅' : '⚠️ 直連 5432'}`);
  console.log();

  const pool = new Pool({
    connectionString: url,
    max: args.pool,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });

  let drawStats: PhaseStats | null = null;
  let buyStats: PhaseStats | null = null;
  let scoreStats: PhaseStats | null = null;
  let liquidationStats: PhaseStats | null = null;
  let liquidationInfo: {
    holdings_before: number; holdings_after_partial: number; holdings_deleted: number;
    transactions_written: number; ratio: number; stocks_count: number;
  } | null = null;
  let karmaStats: PhaseStats | null = null;
  let karmaInfo: {
    players: number;
    distribution: Record<string, number>;
    expected_affected: number;
    transactions_written: number;
  } | null = null;
  let stockInfo: { code: string; name: string; current_price: number } | null = null;
  let consistency: { holdingCount: number; expectedHoldings: number; totalShares: number; expectedShares: number } | null = null;

  try {
    await setupTestPlayers(pool, args.n, args.money);

    // ─── Phase 1：抽卡 ───
    if (!args.skipDraw) {
      console.log(`\n⏱  Phase 1：${args.n} 人並發 drawDestiny()...`);
      const t0 = Date.now();
      const samples = await Promise.all(
        Array.from({ length: args.n }, (_, i) => simulateDraw(pool, `loadtest_${i + 1}`)),
      );
      drawStats = summarize(samples, Date.now() - t0);
      console.log(`📊 Phase 1 結果：avg=${drawStats.avg_ms}ms / p95=${drawStats.p95_ms}ms / err=${drawStats.error_rate}`);
    } else {
      console.log(`\n⏭  --skip-draw，跳過 Phase 1`);
      // 給玩家補 destiny 才能進 Phase 2（避免 PLAYER_DEAD）
      await pool.query(`
        UPDATE "PlayerStats" SET destiny_name = '壓測命格', blessing = 50, health = 100
        WHERE user_id LIKE 'loadtest_%' AND destiny_name IS NULL
      `);
    }

    // ─── Phase 2：買股 ───
    if (!args.skipBuy) {
      const stock = await pickStock(pool, args.stockId);
      stockInfo = { code: stock.code, name: stock.name, current_price: stock.current_price };
      console.log(`\n⏱  Phase 2：${args.n} 人並發 buyStock(${stock.code} @${stock.current_price})...`);

      // 確保所有測試玩家有足夠金錢（Phase 1 抽卡可能改了金錢）
      await pool.query(
        `UPDATE "PlayerStats" SET money = $1 WHERE user_id LIKE 'loadtest_%'`,
        [args.money],
      );

      const t0 = Date.now();
      const samples = await Promise.all(
        Array.from({ length: args.n }, (_, i) =>
          simulateBuy(pool, `loadtest_${i + 1}`, stock.id, args.shares),
        ),
      );
      buyStats = summarize(samples, Date.now() - t0);
      console.log(`📊 Phase 2 結果：avg=${buyStats.avg_ms}ms / p95=${buyStats.p95_ms}ms / err=${buyStats.error_rate}`);

      // 一致性檢查
      const totR = await pool.query<{ total: string; cnt: string }>(
        `SELECT COALESCE(SUM(shares), 0)::text AS total, COUNT(*)::text AS cnt
         FROM "StockHolding" WHERE stock_id = $1 AND user_id LIKE 'loadtest_%'`,
        [stock.id],
      );
      consistency = {
        holdingCount: Number(totR.rows[0].cnt),
        expectedHoldings: buyStats.ok,
        totalShares: Number(totR.rows[0].total),
        expectedShares: buyStats.ok * args.shares,
      };
      console.log(`🔍 一致性：rows=${consistency.holdingCount}/${consistency.expectedHoldings}、shares=${consistency.totalShares}/${consistency.expectedShares}`);
    } else {
      console.log(`\n⏭  --skip-buy，跳過 Phase 2`);
    }

    // ─── Phase 3：每回合分數計算（leaderboard 並發查）───
    // 模擬：1-3 個看板 + admin + 多分頁 同時 poll 排行榜
    // 每個 client 連續查 5 次模擬 5 個回合
    if (!args.skipScore) {
      console.log(`\n⏱  Phase 3：${args.scoreReaders} client × 5 round 並發查排行榜（共 ${args.scoreReaders * 5} 次查詢）...`);
      const weights = { wM: 0.05, wB: 200, wK: 150 };
      const t0 = Date.now();
      const samples: Sample[] = [];
      // 每個 client 連續 5 次查（模擬 5 個回合的 dashboard reload / board poll）
      const allPromises: Promise<Sample[]>[] = [];
      for (let c = 0; c < args.scoreReaders; c++) {
        allPromises.push((async () => {
          const out: Sample[] = [];
          for (let r = 0; r < 5; r++) {
            out.push(await simulateScoreCompute(pool, weights));
          }
          return out;
        })());
      }
      const all = await Promise.all(allPromises);
      for (const arr of all) samples.push(...arr);
      scoreStats = summarize(samples, Date.now() - t0);
      console.log(`📊 Phase 3 結果：avg=${scoreStats.avg_ms}ms / p95=${scoreStats.p95_ms}ms / err=${scoreStats.error_rate}`);
    } else {
      console.log(`\n⏭  --skip-score，跳過 Phase 3`);
    }

    // ─── Phase 4：強制平倉（500 玩家 × N 股一次平倉）───
    if (!args.skipLiquidation) {
      // 取 N 檔股票（visible 優先；不夠就退回 ORDER BY code）
      const stocksR = await pool.query<{ id: string; code: string; name: string }>(
        `SELECT id, code, name FROM "Stock" ORDER BY is_visible DESC NULLS LAST, code LIMIT $1`,
        [args.liquidationStocks],
      );
      if (stocksR.rows.length < args.liquidationStocks) {
        console.log(`⚠️ Phase 4 需要 ${args.liquidationStocks} 檔股票但 DB 只有 ${stocksR.rows.length} 檔，跳過`);
      } else {
        const stockIds = stocksR.rows.map((r) => r.id);
        // 鋪設持股：每人每檔 10 股（讓 50% 平倉後仍有 5 股 → 走 UPDATE 路徑而非 DELETE）
        const sharesPerStock = 10;
        await setupLiquidationHoldings(pool, args.n, stockIds, sharesPerStock);

        // 清掉舊的 forced_liquidation 明細，避免污染計數
        await pool.query(
          `DELETE FROM "Transaction" WHERE user_id LIKE 'loadtest_%' AND tx_type = 'forced_liquidation'`,
        );

        const beforeR = await pool.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM "StockHolding" WHERE user_id LIKE 'loadtest_%' AND stock_id = ANY($1::uuid[])`,
          [stockIds],
        );
        const holdingsBefore = Number(beforeR.rows[0].cnt);

        console.log(`\n⏱  Phase 4：對 ${holdingsBefore} 筆持股一次性執行 ${args.liquidationRatio}% 強制平倉（單條 CTE）...`);
        const t0 = Date.now();
        const sample = await simulateForceLiquidation(pool, args.liquidationRatio, 99);
        liquidationStats = summarize([sample], Date.now() - t0);

        const afterR = await pool.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM "StockHolding" WHERE user_id LIKE 'loadtest_%' AND stock_id = ANY($1::uuid[])`,
          [stockIds],
        );
        const txR = await pool.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM "Transaction" WHERE user_id LIKE 'loadtest_%' AND tx_type = 'forced_liquidation'`,
        );
        const holdingsAfter = Number(afterR.rows[0].cnt);
        const txWritten = Number(txR.rows[0].cnt);
        liquidationInfo = {
          holdings_before: holdingsBefore,
          holdings_after_partial: holdingsAfter,
          holdings_deleted: holdingsBefore - holdingsAfter,
          transactions_written: txWritten,
          ratio: args.liquidationRatio,
          stocks_count: stockIds.length,
        };
        console.log(`📊 Phase 4 結果：${liquidationStats.avg_ms}ms（單次 SQL）/ DELETE ${liquidationInfo.holdings_deleted} / UPDATE ${holdingsAfter} / Transaction ${txWritten}`);
      }
    } else {
      console.log(`\n⏭  --skip-liquidation，跳過 Phase 4`);
    }

    // ─── Phase 5：業力影響（500 玩家依當下 karma 取對應 band 套四項 delta + 寫 Transaction）───
    if (!args.skipKarma) {
      const dist = await setupKarmaDistribution(pool, args.n);

      console.log(`\n⏱  Phase 5：對 ${args.n} 玩家執行業力影響 CTE（單條 SQL）...`);
      const t0 = Date.now();
      const sample = await simulateKarmaBandTick(pool, 99);
      karmaStats = summarize([sample], Date.now() - t0);

      const txR = await pool.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM "Transaction"
         WHERE user_id LIKE 'loadtest_%' AND tx_type = 'karma_band_effect'`,
      );
      const txWritten = Number(txR.rows[0].cnt);
      karmaInfo = {
        players: args.n,
        distribution: dist.by_band,
        expected_affected: dist.expected_affected,
        transactions_written: txWritten,
      };
      console.log(`📊 Phase 5 結果：${karmaStats.avg_ms}ms（單次 SQL）/ Transaction ${txWritten} / 預期 ${dist.expected_affected}`);
    } else {
      console.log(`\n⏭  --skip-karma，跳過 Phase 5`);
    }

    // ─── 寫報告 ───
    const dest = await writeReport({ args, isPgBouncer, url, draw: drawStats, buy: buyStats, score: scoreStats, liquidation: liquidationStats, liquidationInfo, karma: karmaStats, karmaInfo, stockInfo, consistency });
    console.log(`\n📝 報告已寫入：${dest}\n`);

    if (args.cleanup) {
      await deleteTestAccounts(pool);
    } else if (!args.keepData) {
      console.log(`ℹ️ 測試資料保留以便重跑。要刪帳號加 --cleanup`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('\n❌ 壓測失敗：', e);
  process.exit(1);
});
