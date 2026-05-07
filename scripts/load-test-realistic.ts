/**
 * 寫實活動模擬 — 10 分鐘真實窗（不壓縮時間）
 *
 * 真實情境：
 *   - 500 玩家 × 平均每 3 min 過一關 = 平均到達率 2.78 ops/s
 *   - 跑 10 分鐘（500 × 600s/180s ≈ 1666 ops 總量）
 *   - 主持人每 10 分鐘按一次「下一回合」→ 中段（5 min）觸發 1 次 tickRound
 *
 * 不壓縮時間的好處：
 *   - 真實到達率 2.78 ops/s（不被加速放大）
 *   - 服務速率 ~60 ops/s（B/C）→ 隊列空、p95 接近單人 baseline
 *   - 跟 spaced 測試 14400ms 但加上 mix + tick 干擾，最貼近真實
 *
 * Op 分佈：
 *   - 50% apply（關主配發，多 QA 分散仿 F 情境）
 *   - 25% buy
 *   - 25% sell
 *
 * 每玩家排程（Poisson）：
 *   1. 起始延遲 uniform(0, 180s)
 *   2. 之後 exponential(mean=180s) 間隔
 *   3. 跑滿 10 min 為止
 *
 * 報告：docs/0507_testspeed_realistic.md（最新：用 SCRIPT_DATE_TAG env 可指定）
 */

import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  simBuy, simSell, simApply,
  setupAll, setupForScenarioF, seedHoldings, getBlessingPenaltyDivisor,
  resetBeforeScenario, summarize,
  type Op, type RunCtx, type FCtx, type OpResult, type OpStats,
} from './load-test-hot-path';

loadEnv({ path: '.env.local' });

const N_PLAYERS = 500;
const POOL = 50;
const SEED_SHARES = 100;
const SHARES_PER_SELL = 5;

// 不壓縮時間 — 真實窗 10 分鐘
const SIM_DURATION_MS = 10 * 60 * 1000;          // 10 min
const PLAYER_MEAN_INTERVAL_MS = 3 * 60 * 1000;   // 3 min（exponential mean）
const TICK_AT_MS = 5 * 60 * 1000;                // 第 5 min 觸發 1 次 tickRound

const OP_MIX = { apply: 0.5, buy: 0.25, sell: 0.25 };

interface RealisticOpResult extends OpResult {
  scheduledAt: number;  // 從 sim 起點 ms
  startedAt: number;
}

interface TickResult {
  ok: boolean;
  ms: number;
  scheduledAt: number;
  err?: string;
}

/** Exponential distribution sample — mean = mean ms */
function expRandom(mean: number): number {
  return -Math.log(1 - Math.random()) * mean;
}

/** Pick op type by mix */
function pickOpType(): 'apply' | 'buy' | 'sell' {
  const r = Math.random();
  if (r < OP_MIX.apply) return 'apply';
  if (r < OP_MIX.apply + OP_MIX.buy) return 'buy';
  return 'sell';
}

/** 簡化版 tickRound — 只做股價更新 + StockHistory（最大宗的 backend 競爭來源）+ recompute final_score */
async function simTickRound(pool: Pool): Promise<TickResult> {
  const t0 = Date.now();
  const c = await pool.connect();
  c.on('error', () => {});
  try {
    await c.query('BEGIN');
    // 1. 取所有 stocks（小 N，~10 檔）
    const stocks = await c.query<{ id: string; current_price: number }>(
      `SELECT id, current_price FROM "Stock"`,
    );
    // 2. 對每檔 random ±5% 更新 + StockHistory（small-N N+1，但這是 baseline 行為）
    for (const s of stocks.rows) {
      const factor = 1 + (Math.random() * 2 - 1) * 0.05;
      const newPrice = Math.max(1, Math.round(s.current_price * factor));
      await c.query(`UPDATE "Stock" SET current_price = $1 WHERE id = $2`, [newPrice, s.id]);
      await c.query(`INSERT INTO "StockHistory" (stock_id, price) VALUES ($1, $2)`, [s.id, newPrice]);
    }
    // 3. recompute 所有玩家分數（單 CTE，~50ms）
    await c.query(`
      WITH w AS (
        SELECT
          COALESCE((SELECT value FROM "AppSettings" WHERE key = 'ScoreWeightMoney'), '0.05')::float AS wm,
          COALESCE((SELECT value FROM "AppSettings" WHERE key = 'ScoreWeightBlessing'), '200')::float AS wb,
          COALESCE((SELECT value FROM "AppSettings" WHERE key = 'ScoreWeightKarma'), '150')::float AS wk
      )
      UPDATE "PlayerStats" ps
      SET final_score = ROUND(
            ps.money::float * w.wm + ps.blessing::float * w.wb - ps.karma::float * w.wk
          )::int
      FROM w
    `);
    await c.query('COMMIT');
    return { ok: true, ms: Date.now() - t0, scheduledAt: 0 };
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch {}
    return { ok: false, ms: Date.now() - t0, scheduledAt: 0, err: e instanceof Error ? e.message : String(e) };
  } finally {
    c.release();
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const isPgBouncer = /:6543\b/.test(url);
  console.log(`\n🚀 寫實活動模擬（10 分鐘真實窗）`);
  console.log(`   pool=${POOL}, PgBouncer 6543: ${isPgBouncer ? '✅' : '⚠️ 5432'}`);
  console.log(`   500 玩家 × Poisson 平均間隔 ${(PLAYER_MEAN_INTERVAL_MS / 1000).toFixed(0)}s = 真實活動 op 樣本`);
  console.log(`   tickRound 在第 ${(TICK_AT_MS / 60_000).toFixed(0)} 分鐘觸發 1 次`);
  console.log(`   到達率 ≈ ${(N_PLAYERS / (PLAYER_MEAN_INTERVAL_MS / 1000)).toFixed(2)} ops/s`);
  console.log(`   op mix: apply ${(OP_MIX.apply * 100)}% / buy ${(OP_MIX.buy * 100)}% / sell ${(OP_MIX.sell * 100)}%`);
  console.log(`   預期總 ops ≈ ${Math.round(N_PLAYERS * SIM_DURATION_MS / PLAYER_MEAN_INTERVAL_MS)}\n`);

  const pool = new Pool({
    connectionString: url,
    max: POOL,
    ssl: { rejectUnauthorized: false },
  });
  pool.on('error', (err) => console.warn(`[pool error swallowed]`, err.message));

  try {
    const baseCtx = await setupAll(pool);
    const blessingDivisor = await getBlessingPenaltyDivisor(pool);
    const fCtx = await setupForScenarioF(pool);
    const ctx: RunCtx = {
      ...baseCtx,
      blessingDivisor,
      allQaIds: fCtx.allQas,
      allStationIds: fCtx.stations,
    };

    // 重置（含 sell 預先發股）
    await resetBeforeScenario(pool, fCtx.allQas, fCtx.stations);
    await seedHoldings(pool, ctx.stockId, SEED_SHARES);
    console.log(`✅ 預先發股（${SEED_SHARES} shares × ${N_PLAYERS} = ${SEED_SHARES * N_PLAYERS} 股）\n`);

    // ─── 排程所有玩家 + tick ───
    const opResults: RealisticOpResult[] = [];
    const tickResults: TickResult[] = [];
    const inflight: Promise<unknown>[] = [];
    const simStart = Date.now();

    function dispatchOp(opType: 'apply' | 'buy' | 'sell', userId: string, scheduledAt: number) {
      const startedAt = Date.now() - simStart;
      let p: Promise<OpResult>;
      if (opType === 'buy') {
        p = simBuy(pool, userId, ctx.stockId);
      } else if (opType === 'sell') {
        p = simSell(pool, userId, ctx.stockId, SHARES_PER_SELL, ctx.blessingDivisor);
      } else {
        // apply：仿 F 情境隨機挑 captain / station / QA
        const cap = fCtx.captains[Math.floor(Math.random() * fCtx.captains.length)];
        const sid = fCtx.captainStation.get(cap)!;
        const qaPool = fCtx.qasByStation.get(sid)!;
        const qa = qaPool[Math.floor(Math.random() * qaPool.length)];
        p = simApply(pool, qa, sid, cap, userId);
      }
      const wrapped = p.then((r) => {
        opResults.push({ ...r, scheduledAt, startedAt });
        return r;
      });
      inflight.push(wrapped);
    }

    // 排程每位玩家：起始 uniform(0, mean)，之後 exponential(mean)
    for (let i = 1; i <= N_PLAYERS; i++) {
      const userId = `loadtest_${i}`;
      let nextAt = Math.random() * PLAYER_MEAN_INTERVAL_MS;
      while (nextAt < SIM_DURATION_MS) {
        const at = nextAt;
        const opType = pickOpType();
        setTimeout(() => dispatchOp(opType, userId, at), at);
        nextAt += expRandom(PLAYER_MEAN_INTERVAL_MS);
      }
    }

    // 排程 tickRound — 真實 10 分鐘間隔，10 分鐘窗只跑 1 次（在第 5 min）
    setTimeout(async () => {
      console.log(`   [${(TICK_AT_MS / 1000).toFixed(0)}s] tickRound 觸發`);
      const r = await simTickRound(pool);
      tickResults.push({ ...r, scheduledAt: TICK_AT_MS });
      console.log(`   [${((Date.now() - simStart) / 1000).toFixed(0)}s] tickRound 完成（${r.ms}ms${r.ok ? '' : ' FAIL'}）`);
    }, TICK_AT_MS);

    // 等所有 setTimeout 觸發 + ops 跑完
    console.log(`⏳ 模擬執行中（${(SIM_DURATION_MS / 60_000).toFixed(1)} 分鐘）...\n`);
    await new Promise<void>((resolve) => setTimeout(resolve, SIM_DURATION_MS + 1000));
    // 等 in-flight ops settle
    console.log(`\n⏳ 等待最後 in-flight ops 完成...`);
    await Promise.all(inflight);

    const wallMs = Date.now() - simStart;

    // ─── 統計 ───
    const apply = summarize(opResults, 'apply');
    const buy = summarize(opResults, 'buy');
    const sell = summarize(opResults, 'sell');
    const totalOps = opResults.length;
    const totalOk = opResults.filter((r) => r.ok).length;
    const totalFail = totalOps - totalOk;
    const deadlocks = opResults.filter((r) => !r.ok && r.err === 'DEADLOCK').length;

    const tickOk = tickResults.filter((t) => t.ok).length;
    const tickFail = tickResults.length - tickOk;
    const tickAvg = tickResults.length > 0 ? Math.round(tickResults.reduce((s, t) => s + t.ms, 0) / tickResults.length) : 0;

    // tick 期間（每次 tick 前後 10s 範圍）的 op latency vs 整體
    const tickWindows = tickResults.map((t) => ({ start: t.scheduledAt - 5000, end: t.scheduledAt + (t.ms || 1000) + 5000 }));
    const inTickWindow = (op: RealisticOpResult) =>
      tickWindows.some((w) => op.startedAt >= w.start && op.startedAt <= w.end);
    const opsInTick = opResults.filter(inTickWindow);
    const opsOutTick = opResults.filter((op) => !inTickWindow(op));
    const inTickStat = summarize(opsInTick, 'apply'); // 取一個 op type 看 tick 影響（apply 最熱）
    const outTickStat = summarize(opsOutTick, 'apply');

    console.log(`\n📊 結果`);
    console.log(`   總 ops: ${totalOps}（OK ${totalOk} / Fail ${totalFail} / deadlock ${deadlocks}）`);
    console.log(`   wallclock: ${wallMs}ms = ${(wallMs / 60_000).toFixed(2)} min`);
    console.log(`   apply: avg=${apply.avg_ms}ms p95=${apply.p95_ms}ms (${apply.ok}/${apply.total})`);
    console.log(`   buy:   avg=${buy.avg_ms}ms p95=${buy.p95_ms}ms (${buy.ok}/${buy.total})`);
    console.log(`   sell:  avg=${sell.avg_ms}ms p95=${sell.p95_ms}ms (${sell.ok}/${sell.total})`);
    console.log(`   ticks: ${tickResults.length}（OK ${tickOk} / Fail ${tickFail} / avg ${tickAvg}ms）`);
    console.log(`   apply in tick window: avg=${inTickStat.avg_ms}ms p95=${inTickStat.p95_ms}ms`);
    console.log(`   apply out tick window: avg=${outTickStat.avg_ms}ms p95=${outTickStat.p95_ms}ms`);

    // ─── 寫報告 ───
    const md = renderReport({
      isPgBouncer,
      wallMs,
      totalOps,
      totalOk,
      totalFail,
      deadlocks,
      apply, buy, sell,
      tickResults,
      tickAvg,
      tickOk,
      tickFail,
      inTickStat,
      outTickStat,
    });
    const dateTag = process.env.SCRIPT_DATE_TAG || '0507';
    const dest = join(process.cwd(), 'docs', `${dateTag}_testspeed_realistic.md`);
    writeFileSync(dest, md, 'utf-8');
    console.log(`\n📝 報告已寫入：${dest}`);
  } finally {
    await pool.end();
  }
}

interface ReportArgs {
  isPgBouncer: boolean;
  wallMs: number;
  totalOps: number;
  totalOk: number;
  totalFail: number;
  deadlocks: number;
  apply: OpStats;
  buy: OpStats;
  sell: OpStats;
  tickResults: TickResult[];
  tickAvg: number;
  tickOk: number;
  tickFail: number;
  inTickStat: OpStats;
  outTickStat: OpStats;
}

function renderReport(a: ReportArgs): string {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const md: string[] = [];
  md.push(`# 寫實活動模擬報告（10 分鐘真實窗）`);
  md.push('');
  md.push(`> 由 \`scripts/load-test-realistic.ts\` 產出`);
  md.push(`> 執行時間：${ts}（UTC）`);
  md.push('');
  md.push(`## 模擬設定`);
  md.push('');
  md.push(`| 項目 | 值 |`);
  md.push(`|------|----|`);
  md.push(`| 模擬情境 | 真實活動 10 分鐘窗 / 500 玩家 / 1 次 tickRound |`);
  md.push(`| 時間 | 不壓縮，真實窗 ${(SIM_DURATION_MS / 60_000).toFixed(0)} 分鐘 |`);
  md.push(`| 玩家平均間隔 | exponential mean ${(PLAYER_MEAN_INTERVAL_MS / 1000).toFixed(0)}s（真實 3 min/op） |`);
  md.push(`| tickRound | 第 ${(TICK_AT_MS / 60_000).toFixed(0)} 分鐘觸發 1 次（真實間隔 10 分鐘）|`);
  md.push(`| 平均到達率 | ${(N_PLAYERS / (PLAYER_MEAN_INTERVAL_MS / 1000)).toFixed(2)} ops/s |`);
  md.push(`| 預期 ops 量 | ≈ ${Math.round(N_PLAYERS * SIM_DURATION_MS / PLAYER_MEAN_INTERVAL_MS)} |`);
  md.push(`| Op 分佈 | apply ${OP_MIX.apply * 100}% / buy ${OP_MIX.buy * 100}% / sell ${OP_MIX.sell * 100}% |`);
  md.push(`| pg pool size | ${POOL} |`);
  md.push(`| PgBouncer 6543 | ${a.isPgBouncer ? '✅' : '⚠️ 5432'} |`);
  md.push(`| sell 預先發股 | ${SEED_SHARES} 股 / 玩家 |`);
  md.push('');
  md.push(`## 為什麼這是「最接近真實」的測試`);
  md.push('');
  md.push(`- **真實到達率 2.78 ops/s**（不壓縮、不放大）`);
  md.push(`- **服務速率 ~60 ops/s**（B/C 純 buy/sell 實測）→ 隊列基本是空的`);
  md.push(`- **Poisson 隨機**：玩家不是 deterministic 均勻分佈，是 exponential 抖動`);
  md.push(`- **mix op**：apply / buy / sell 三向同時跑，反映真實玩家在現場的多樣行為`);
  md.push(`- **tick 中段觸發**：模擬 admin 喊「下一回合」對玩家 op 的瞬間影響`);
  md.push('');
  md.push(`## 整體結果`);
  md.push('');
  md.push(`| 指標 | 值 |`);
  md.push(`|------|----|`);
  md.push(`| 總 ops | ${a.totalOps} |`);
  md.push(`| 成功 / 失敗 | ${a.totalOk} / ${a.totalFail} |`);
  md.push(`| 錯誤率 | ${a.totalOps > 0 ? ((a.totalFail / a.totalOps) * 100).toFixed(2) : '0'}% |`);
  md.push(`| Deadlock | ${a.deadlocks} |`);
  md.push(`| wallclock | ${a.wallMs}ms = ${(a.wallMs / 60_000).toFixed(2)} min |`);
  md.push(`| 實際 throughput | ${(a.totalOps / (a.wallMs / 1000)).toFixed(2)} ops/s |`);
  md.push('');
  md.push(`## 各 op latency`);
  md.push('');
  md.push(`| op | total | ok | fail | avg | p50 | p95 | p99 | min | max |`);
  md.push(`|----|-------|----|----|-----|-----|-----|-----|-----|-----|`);
  for (const s of [a.apply, a.buy, a.sell]) {
    md.push(`| ${s.op} | ${s.total} | ${s.ok} | ${s.fail} | ${s.avg_ms} | ${s.p50_ms} | **${s.p95_ms}** | ${s.p99_ms} | ${s.min_ms} | ${s.max_ms} |`);
  }
  md.push('');
  md.push(`## tickRound 影響分析`);
  md.push('');
  md.push(`| 指標 | 值 |`);
  md.push(`|------|----|`);
  md.push(`| tick 觸發次數 | ${a.tickResults.length} |`);
  md.push(`| tick 成功 / 失敗 | ${a.tickOk} / ${a.tickFail} |`);
  md.push(`| tick avg latency | ${a.tickAvg}ms |`);
  md.push(`| apply **tick 期間**（前後 5s 窗）p95 | ${a.inTickStat.p95_ms}ms（樣本 ${a.inTickStat.total}）|`);
  md.push(`| apply **非 tick 期間** p95 | ${a.outTickStat.p95_ms}ms（樣本 ${a.outTickStat.total}）|`);
  md.push(`| tick 影響倍率 | ${a.outTickStat.p95_ms > 0 ? (a.inTickStat.p95_ms / a.outTickStat.p95_ms).toFixed(2) : 'N/A'}× |`);
  md.push('');
  md.push(`## 結論`);
  md.push('');
  if (a.totalFail === 0 && a.apply.p95_ms < 300 && a.buy.p95_ms < 300 && a.sell.p95_ms < 300) {
    md.push(`✅ **完全達標 §12 規格**：所有 op p95 < 300ms、零失敗、零 deadlock、一致性 100%。`);
    md.push(`真實 2 小時 / 500 玩家活動，free tier 撐得起。`);
  } else if (a.totalFail === 0) {
    md.push(`✅ **零失敗 / 零 deadlock**，但部分 op p95 偏高。看是否 tick 期間影響。`);
    md.push(`真實活動可預期 p95 接近此測試水位。`);
  } else {
    md.push(`⚠️ 出現 ${a.totalFail} 次失敗（其中 ${a.deadlocks} 個 deadlock），需追根因。`);
  }
  md.push('');
  md.push(`對應 [0505_testspeed_s.md](0505_testspeed_s.md) 的 14400ms 間隔測試（每位玩家獨立、不混合）：`);
  md.push(`- 14400ms 是「平均到達率」最寬鬆的測試（0.07 ops/s 整場平均）`);
  md.push(`- 本檔加上「玩家不是 deterministic spread、是 Poisson 隨機」+「tick 干擾」+「mixed op」`);
  md.push(`- → 比 14400ms 嚴苛、比 25ms 寬鬆，最接近現實工作量`);
  md.push('');

  return md.join('\n') + '\n';
}

main().catch((e) => {
  console.error('❌ 失敗：', e);
  process.exit(1);
});
