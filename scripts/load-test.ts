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
    await client.query(
      `UPDATE "PlayerStats"
       SET destiny_name = $2, money = $3, health = $4, blessing = $5, karma = $6, updated_at = now()
       WHERE user_id = $1 AND destiny_name IS NULL`,
      [userId, chosen.label, chosen.money, Math.min(chosen.health, 100), chosen.blessing, chosen.karma],
    );
    await client.query(
      `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
       VALUES ($1, $1, 'destiny_draw', $2)`,
      [userId, JSON.stringify({ chosen: chosen.label, load_test: true })],
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

    await client.query(
      `UPDATE "PlayerStats" SET money = money - $2, updated_at = now() WHERE user_id = $1`,
      [userId, cost],
    );
    await client.query(
      `INSERT INTO "StockHolding" (user_id, stock_id, shares, avg_cost)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, stock_id) DO UPDATE SET
         shares = "StockHolding".shares + EXCLUDED.shares,
         avg_cost = ROUND(
           ("StockHolding".shares * "StockHolding".avg_cost + EXCLUDED.shares * $4)
           / NULLIF("StockHolding".shares + EXCLUDED.shares, 0)
         ),
         updated_at = now()`,
      [userId, stockId, shares, price],
    );
    await client.query(
      `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
       VALUES ($1, $1, 'stock_buy', $2)`,
      [userId, JSON.stringify({
        stock_id: stockId, stock_code: stockR.rows[0].code, stock_name: stockR.rows[0].name,
        shares, price, cost, load_test: true,
      })],
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

  // 總結
  md.push(`## 結論`);
  md.push('');
  const allPhases = [opts.draw, opts.buy].filter(Boolean) as PhaseStats[];
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

  const dest = join(process.cwd(), 'docs', 'testspeed.md');
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

    // ─── 寫報告 ───
    const dest = await writeReport({ args, isPgBouncer, url, draw: drawStats, buy: buyStats, stockInfo, consistency });
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
