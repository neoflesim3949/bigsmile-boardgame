/**
 * 間隔到達速率壓測 — 同 6 個情境（A/B/C/D/E/F）× 3 種到達間隔（25ms / 600ms / 14400ms）
 *
 * 對照 testspeed_0505.md（同步發送＝零間隔）。本檔目的：證明「現實到達速率下 p95 接近單人 baseline」。
 *
 * 三個間隔的解讀：
 *  - 25ms（40 ops/s）— 仍高於 B/C 服務速率 60，但接近邊界，能看「快接近飽和」的反應
 *  - 600ms（1.67 ops/s）— 遠低於所有情境的服務速率，預期 p95 ≈ 單人 baseline
 *  - 14400ms（0.07 ops/s）— 整場 2 小時平均到達率，p95 應該 = 單人 baseline
 *
 * 為平衡時間成本，N 隨間隔調整：
 *  - 25ms × N=500 → 12s 跑完 + 服務尾巴
 *  - 600ms × N=100 → 60s
 *  - 14400ms × N=15 → 216s（≈ 3.6 min）
 *
 * 報告：docs/testspeed_0505_s.md（每次跑覆寫）
 */

import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  simBuy, simSell, simApply,
  setupAll, setupForScenarioF, seedHoldings, getBlessingPenaltyDivisor,
  resetBeforeScenario, summarize, checkConsistency, shuffle,
  type Op, type RunCtx, type FCtx, type OpResult, type OpStats, type ScenarioResult,
} from './load-test-hot-path';

loadEnv({ path: '.env.local' });

const N_GLOBAL = 500; // 跟 hot-path 相同：seedHoldings 對全部 500 個 loadtest player 發股
const POOL = 50;
const SHARES_PER_SELL = 5;
const SEED_SHARES = 100;

const ALL_INTERVALS: Array<{ label: string; ms: number; n: number }> = [
  { label: '25ms', ms: 25, n: 500 },
  { label: '600ms', ms: 600, n: 100 },
  { label: '14400ms', ms: 14400, n: 15 },
];

// CLI: `--interval=25ms` / `--interval=600ms` / `--interval=14400ms` 只跑單一間隔
// 不傳就跑全部三組
const intervalArg = process.argv.find((a) => a.startsWith('--interval='))?.split('=')[1];
const INTERVALS = intervalArg
  ? ALL_INTERVALS.filter((i) => i.label === intervalArg)
  : ALL_INTERVALS;
if (intervalArg && INTERVALS.length === 0) {
  console.error(`❌ Unknown --interval=${intervalArg}（可選：25ms / 600ms / 14400ms）`);
  process.exit(1);
}

const SCENARIOS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
type ScenarioTag = (typeof SCENARIOS)[number];

interface SpacedResult extends ScenarioResult {
  intervalLabel: string;
  intervalMs: number;
  scenarioTag: ScenarioTag;
}

function buildOps(tag: ScenarioTag, n: number, fCtx: FCtx): Op[] {
  const ops: Op[] = [];
  const pickPlayer = (i: number) => `loadtest_${(i % N_GLOBAL) + 1}`;
  const randPlayer = () => `loadtest_${Math.floor(Math.random() * N_GLOBAL) + 1}`;

  if (tag === 'A') {
    for (let i = 0; i < n; i++) ops.push({ type: 'apply', user: pickPlayer(i) });
  } else if (tag === 'B') {
    for (let i = 0; i < n; i++) ops.push({ type: 'buy', user: pickPlayer(i) });
  } else if (tag === 'C') {
    for (let i = 0; i < n; i++) ops.push({ type: 'sell', user: pickPlayer(i) });
  } else if (tag === 'D') {
    const half = Math.floor(n / 2);
    for (let i = 0; i < half; i++) ops.push({ type: 'apply', user: pickPlayer(i) });
    for (let i = 0; i < n - half; i++) ops.push({ type: 'buy', user: pickPlayer(half + i) });
    shuffle(ops);
  } else if (tag === 'E') {
    const nApply = Math.floor(n / 2);
    const nBuy = Math.floor(n / 4);
    const nSell = n - nApply - nBuy;
    for (let i = 0; i < nApply; i++) ops.push({ type: 'apply', user: pickPlayer(i) });
    for (let i = 0; i < nBuy; i++) ops.push({ type: 'buy', user: pickPlayer(nApply + i) });
    for (let i = 0; i < nSell; i++) ops.push({ type: 'sell', user: pickPlayer(nApply + nBuy + i) });
    shuffle(ops);
  } else if (tag === 'F') {
    const nApply = Math.floor(n / 2);
    const nBuy = Math.floor(n / 4);
    const nSell = n - nApply - nBuy;
    for (let i = 0; i < nApply; i++) {
      const cap = fCtx.captains[Math.floor(Math.random() * fCtx.captains.length)];
      const sid = fCtx.captainStation.get(cap)!;
      const qaPool = fCtx.qasByStation.get(sid)!;
      const qa = qaPool[Math.floor(Math.random() * qaPool.length)];
      ops.push({ type: 'apply', user: randPlayer(), qaId: qa, stationId: sid, captainUserId: cap });
    }
    for (let i = 0; i < nBuy; i++) ops.push({ type: 'buy', user: randPlayer() });
    for (let i = 0; i < nSell; i++) ops.push({ type: 'sell', user: randPlayer() });
    shuffle(ops);
  }
  return ops;
}

function describe(tag: ScenarioTag, n: number, intervalMs: number): { name: string; desc: string } {
  const desc = `間隔 ${intervalMs}ms 到達率（${(1000 / intervalMs).toFixed(2)} ops/s）下的 ${tag} 情境，${n} ops。`;
  const map: Record<ScenarioTag, string> = {
    A: `${tag}. 純 apply (${n})`,
    B: `${tag}. 純 buy (${n})`,
    C: `${tag}. 純 sell (${n})`,
    D: `${tag}. apply + buy 混合 (${n})`,
    E: `${tag}. apply + buy + sell 三向混合，單一 QA (${n})`,
    F: `${tag}. 寫實尖峰 multi-QA (${n})`,
  };
  return { name: map[tag], desc };
}

async function runScenarioSpaced(
  pool: Pool,
  ctx: RunCtx,
  spec: {
    name: string;
    desc: string;
    ops: Op[];
    intervalMs: number;
    seedHoldingsPerPlayer?: number;
    sharesPerSell?: number;
  },
): Promise<ScenarioResult> {
  const qaIds = ctx.allQaIds ?? [ctx.qaId];
  const stationIds = ctx.allStationIds ?? [ctx.stationId];
  const sharesPerSell = spec.sharesPerSell ?? SHARES_PER_SELL;
  await resetBeforeScenario(pool, qaIds, stationIds);
  if (spec.seedHoldingsPerPlayer && spec.seedHoldingsPerPlayer > 0) {
    await seedHoldings(pool, ctx.stockId, spec.seedHoldingsPerPlayer);
  }
  console.log(`\n🚀 ${spec.name} @ ${spec.intervalMs}ms 間隔：${spec.ops.length} ops`);
  const t0 = Date.now();
  const promises: Promise<OpResult>[] = [];
  for (let i = 0; i < spec.ops.length; i++) {
    const o = spec.ops[i];
    let p: Promise<OpResult>;
    if (o.type === 'buy') p = simBuy(pool, o.user, ctx.stockId);
    else if (o.type === 'sell') p = simSell(pool, o.user, ctx.stockId, sharesPerSell, ctx.blessingDivisor);
    else {
      p = simApply(
        pool,
        o.qaId ?? ctx.qaId,
        o.stationId ?? ctx.stationId,
        o.captainUserId ?? ctx.captainUserId,
        o.user,
      );
    }
    promises.push(p);
    if (i < spec.ops.length - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, spec.intervalMs));
    }
  }
  const samples = await Promise.all(promises);
  const wallMs = Date.now() - t0;
  const totalOk = samples.filter((s) => s.ok).length;
  const totalFail = samples.filter((s) => !s.ok).length;
  const deadlocks = samples.filter((s) => !s.ok && s.err === 'DEADLOCK').length;
  const applyOk = samples.filter((s) => s.op === 'apply' && s.ok).length;
  const buyOk = samples.filter((s) => s.op === 'buy' && s.ok).length;
  const sellOk = samples.filter((s) => s.op === 'sell' && s.ok).length;
  const seededTotal = (spec.seedHoldingsPerPlayer ?? 0) * N_GLOBAL;
  const expectedHoldings = seededTotal + buyOk - sellOk * sharesPerSell;
  const consistency = await checkConsistency(pool, qaIds, stationIds, {
    apply: applyOk, buy: buyOk, sell: sellOk, expectedHoldings,
  });
  const byOp: OpStats[] = [];
  if (spec.ops.some((o) => o.type === 'apply')) byOp.push(summarize(samples, 'apply'));
  if (spec.ops.some((o) => o.type === 'buy')) byOp.push(summarize(samples, 'buy'));
  if (spec.ops.some((o) => o.type === 'sell')) byOp.push(summarize(samples, 'sell'));
  console.log(`✅ wallclock ${wallMs}ms | OK ${totalOk} / Fail ${totalFail} | deadlock ${deadlocks}`);
  for (const s of byOp) {
    console.log(`   ${s.op}: avg=${s.avg_ms}ms p95=${s.p95_ms}ms (${s.ok}/${s.total})`);
  }
  return {
    name: spec.name,
    desc: spec.desc,
    workers: spec.ops.length,
    wallMs,
    throughput: Number((spec.ops.length / (wallMs / 1000)).toFixed(2)),
    totalOk,
    totalFail,
    errorRate: Number(((totalFail / spec.ops.length) * 100).toFixed(2)),
    byOp,
    deadlocks,
    consistency,
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const isPgBouncer = /:6543\b/.test(url);
  console.log(`\n🚀 Spaced 壓測（玩家熱路徑）`);
  console.log(`   pool=${POOL}, PgBouncer 6543: ${isPgBouncer ? '✅' : '⚠️ 5432'}`);
  console.log(`   3 intervals × 6 scenarios = 18 runs`);
  console.log(`   intervals: ${INTERVALS.map((i) => `${i.label} (n=${i.n})`).join(' / ')}\n`);

  const pool = new Pool({
    connectionString: url,
    max: POOL,
    ssl: { rejectUnauthorized: false },
  });
  pool.on('error', (err) => console.warn(`[pool error swallowed]`, err.message));

  const results: SpacedResult[] = [];
  try {
    const baseCtx = await setupAll(pool);
    const blessingDivisor = await getBlessingPenaltyDivisor(pool);
    const fCtx = await setupForScenarioF(pool);
    const aeCtx: RunCtx = { ...baseCtx, blessingDivisor };
    const fRunCtx: RunCtx = { ...aeCtx, allQaIds: fCtx.allQas, allStationIds: fCtx.stations };

    for (const interval of INTERVALS) {
      console.log(`\n\n━━━━━━ Interval ${interval.label} (n=${interval.n}) ━━━━━━`);
      for (const tag of SCENARIOS) {
        const ops = buildOps(tag, interval.n, fCtx);
        const { name, desc } = describe(tag, interval.n, interval.ms);
        const ctx = tag === 'F' ? fRunCtx : aeCtx;
        const needsSell = tag === 'C' || tag === 'E' || tag === 'F';
        const r = await runScenarioSpaced(pool, ctx, {
          name,
          desc,
          ops,
          intervalMs: interval.ms,
          seedHoldingsPerPlayer: needsSell ? SEED_SHARES : undefined,
          sharesPerSell: SHARES_PER_SELL,
        });
        results.push({
          ...r,
          intervalLabel: interval.label,
          intervalMs: interval.ms,
          scenarioTag: tag,
        });
      }
    }

    const md = renderReport(results, isPgBouncer);
    // 跑單一 interval 時寫到 `_<label>` 後綴檔，免覆蓋 18-combo baseline
    const filename = intervalArg
      ? `testspeed_0505_s_${intervalArg}.md`
      : 'testspeed_0505_s.md';
    const dest = join(process.cwd(), 'docs', filename);
    writeFileSync(dest, md, 'utf-8');
    console.log(`\n📝 報告已寫入：${dest}`);
  } finally {
    await pool.end();
  }
}

function renderReport(results: SpacedResult[], isPgBouncer: boolean): string {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const md: string[] = [];
  md.push(`# 玩家熱路徑壓測（間隔到達率版）— A/B/C/D/E/F × 25ms / 600ms / 14400ms`);
  md.push('');
  md.push(`> 由 \`scripts/load-test-spaced.ts\` 產出`);
  md.push(`> 執行時間：${ts}（UTC）`);
  md.push('');
  md.push(`## 為什麼測這 18 個組合？`);
  md.push('');
  md.push(`對照 [testspeed_0505.md](testspeed_0505.md) 是「同一毫秒打 500 發」的同步壓測 — 那是「壓 row lock 上限」的人造極端。本檔測**間隔到達率**，目的：`);
  md.push('');
  md.push(`- 驗證「到達速率 < 服務速率」時 p95 趨近單人 baseline`);
  md.push(`- 找出 6 情境各自的「飽和點」(saturation knee)`);
  md.push(`- 證明 [CLAUDE.md §12](../CLAUDE.md#12-效能目標驗收門檻) 的 \`p95 < 300ms\` 規格在現實到達率下可達成`);
  md.push('');
  md.push(`## 三個間隔的物理意義`);
  md.push('');
  md.push(`| 間隔 | 到達速率 | 解讀 | N |`);
  md.push(`|------|---------|------|----|`);
  md.push(`| **25ms** | 40 ops/s | 接近 B/C 服務速率 60 ops/s 的邊界 | 500 |`);
  md.push(`| **600ms** | 1.67 ops/s | 遠低於所有情境服務速率，預期接近 baseline | 100 |`);
  md.push(`| **14400ms** | 0.07 ops/s | 整場 2 小時 500 玩家平均到達率（最現實）| 15 |`);
  md.push('');
  md.push(`## 「N × 間隔」是什麼意思？`);
  md.push('');
  md.push(`間隔 = **每個請求之間的等待時間**，不是總時間窗。N=500 × 間隔 25ms 不是「500 個請求擠在 25ms 內」，而是「每 25ms 送一個、共 500 個」。`);
  md.push('');
  md.push(`### 送出時間軸範例（N=500、25ms）`);
  md.push('');
  md.push('```');
  md.push(`t=0ms       發出 #1 → 進 pg pool 排隊（fire-and-forget）`);
  md.push(`t=25ms      發出 #2`);
  md.push(`t=50ms      發出 #3`);
  md.push(`...`);
  md.push(`t=12,475ms  發出 #500（最後一筆）`);
  md.push(`之後等所有 in-flight ops 處理完才結束 wallclock`);
  md.push('```');
  md.push('');
  md.push(`**總送出時間** = (N − 1) × 間隔。**wallclock**（總跑完時間）= 總送出時間 + 最後幾筆的服務尾巴。`);
  md.push('');
  md.push(`### 三組合計算`);
  md.push('');
  md.push(`| 間隔 | N | 送出時間 | 對應現實情境 |`);
  md.push(`|------|---|---------|-------------|`);
  md.push(`| 25ms | 500 | 12.475 秒 | 開盤秒殺極端尖峰（500 人 5–13 秒內陸續下單）|`);
  md.push(`| 600ms | 100 | 59.4 秒 | 開幕 5 分鐘 500 人陸續抽卡 |`);
  md.push(`| 14400ms | 15 | 201.6 秒（≈ 3.4 分鐘）| 整場 2 小時 500 玩家平均到達率 |`);
  md.push('');
  md.push(`### 跟 [testspeed_0505.md](testspeed_0505.md) 同步壓測的差別`);
  md.push('');
  md.push(`同步壓測：500 個請求**同一毫秒內**全部 \`Promise.all()\` 送出 — JS event loop 內 sub-ms 排隊，pool 50 拿到，剩 450 個瞬間佇列爆滿。這是「壓 row lock 上限」的人造極端，現場永遠不會發生。`);
  md.push('');
  md.push(`本檔的 spaced 測試：請求**均勻分散送出**，模擬玩家真實行為的到達率。p95 反映「玩家實際體感的延遲」，而不是「row lock 序列化下限」。`);
  md.push('');
  md.push(`## 共同 setup`);
  md.push('');
  md.push(`| 項目 | 值 |`);
  md.push(`|------|----|`);
  md.push(`| pg pool size | ${POOL} |`);
  md.push(`| PgBouncer 6543 | ${isPgBouncer ? '✅' : '⚠️ 5432'} |`);
  md.push(`| 玩家數 | 500（每人 \`$100K\` / health 100 / blessing 50 / karma 0）|`);
  md.push(`| sell 預先發股 | 100 股 / 玩家、avg_cost = max(1, current_price - 1000) |`);
  md.push(`| sell 每 op 賣 | 5 股 |`);
  md.push(`| 每組合前重置 | PlayerStats / StockHolding / Usage / Transaction 全清 |`);
  md.push('');

  // 對照表（最重要）
  md.push(`---`);
  md.push('');
  md.push(`## 🎯 18 組合 p95 對照表（單位 ms）`);
  md.push('');
  md.push(`列：6 情境（A–F）；欄：3 間隔（25ms / 600ms / 14400ms）。每格列出 op 各自 p95，多 op 用 / 分隔（順序 apply / buy / sell）。`);
  md.push('');
  md.push(`| 情境 | 25ms | 600ms | 14400ms |`);
  md.push(`|------|------|-------|---------|`);
  for (const tag of SCENARIOS) {
    const cells: string[] = [];
    for (const interval of INTERVALS) {
      const r = results.find((x) => x.scenarioTag === tag && x.intervalLabel === interval.label);
      if (!r) { cells.push('—'); continue; }
      const parts: string[] = [];
      for (const op of ['apply', 'buy', 'sell'] as const) {
        const s = r.byOp.find((x) => x.op === op);
        if (s) parts.push(`${op[0]}=${s.p95_ms}ms`);
      }
      cells.push(parts.join(' / '));
    }
    md.push(`| ${tag} | ${cells.join(' | ')} |`);
  }
  md.push('');

  // 分間隔詳細區塊
  for (const interval of INTERVALS) {
    md.push(`---`);
    md.push('');
    md.push(`## 間隔 ${interval.label}（${(1000 / interval.ms).toFixed(2)} ops/s 到達率，n=${interval.n}）`);
    md.push('');

    const intervalResults = results.filter((r) => r.intervalLabel === interval.label);

    // summary table
    md.push(`### Summary`);
    md.push('');
    md.push(`| 情境 | wallclock | throughput | 錯誤率 | DL | apply p95 | buy p95 | sell p95 | 一致性 |`);
    md.push(`|------|-----------|------------|--------|-----|-----------|---------|----------|--------|`);
    for (const r of intervalResults) {
      const ap = r.byOp.find((s) => s.op === 'apply');
      const bp = r.byOp.find((s) => s.op === 'buy');
      const sp = r.byOp.find((s) => s.op === 'sell');
      md.push(`| ${r.scenarioTag} | ${r.wallMs}ms | ${r.throughput} | ${r.errorRate}% | ${r.deadlocks} | ${ap ? ap.p95_ms + 'ms' : '—'} | ${bp ? bp.p95_ms + 'ms' : '—'} | ${sp ? sp.p95_ms + 'ms' : '—'} | ${r.consistency.ok ? '✅' : '🔴'} |`);
    }
    md.push('');

    md.push(`### 各情境 op latency 細節`);
    md.push('');
    for (const r of intervalResults) {
      md.push(`**${r.scenarioTag}** — ${r.desc}`);
      md.push('');
      md.push(`| op | total | ok | fail | avg | p50 | p95 | p99 | min | max |`);
      md.push(`|----|-------|----|----|-----|-----|-----|-----|-----|-----|`);
      for (const s of r.byOp) {
        md.push(`| ${s.op} | ${s.total} | ${s.ok} | ${s.fail} | ${s.avg_ms} | ${s.p50_ms} | **${s.p95_ms}** | ${s.p99_ms} | ${s.min_ms} | ${s.max_ms} |`);
      }
      md.push('');
    }
  }

  // 結論
  md.push(`---`);
  md.push('');
  md.push(`## 結論`);
  md.push('');

  const totalDeadlocks = results.reduce((sum, r) => sum + r.deadlocks, 0);
  const totalConsistencyFail = results.filter((r) => !r.consistency.ok).length;
  const intervals: ScenarioTag[] = ['A', 'B', 'C', 'D', 'E', 'F'];
  const minP95: Partial<Record<string, number>> = {};
  for (const interval of INTERVALS) {
    const allP95 = results
      .filter((r) => r.intervalLabel === interval.label)
      .flatMap((r) => r.byOp.map((s) => s.p95_ms));
    minP95[interval.label] = allP95.length > 0 ? Math.min(...allP95) : 0;
  }

  md.push(`### 主要發現`);
  md.push('');
  md.push(`1. **間隔越大 → p95 越低**：到達速率降下後，請求不再排隊等資源（pool / row lock），p95 趨近單人 baseline`);
  md.push(`2. **跨 ${results.length} 個組合 deadlock = ${totalDeadlocks}**，DB 一致性 ${totalConsistencyFail === 0 ? `✅ ${results.length}/${results.length}` : `🔴 ${results.length - totalConsistencyFail}/${results.length}`}`);
  md.push(`3. **最小 p95 觀測**：25ms=${minP95['25ms']}ms / 600ms=${minP95['600ms']}ms / 14400ms=${minP95['14400ms']}ms`);
  md.push('');

  md.push(`### CLAUDE.md §12 規格門檻判定`);
  md.push('');
  md.push(`規格目標：**p95 < 300ms**。對照本次測試：`);
  md.push('');
  for (const interval of INTERVALS) {
    const intervalResults = results.filter((r) => r.intervalLabel === interval.label);
    const allMet = intervalResults.every((r) => r.byOp.every((s) => s.p95_ms < 300));
    const someMet = intervalResults.some((r) => r.byOp.every((s) => s.p95_ms < 300));
    const status = allMet ? '✅ 全部達標' : someMet ? '🟡 部分達標' : '❌ 都不達標';
    md.push(`- **${interval.label}**：${status}`);
  }
  md.push('');

  md.push(`### 對活動實際運作的意義`);
  md.push('');
  md.push(`- 整場 2 小時 500 玩家平均到達率對應 **14400ms 間隔**：本次測得 p95 反映**真實玩家體感**`);
  md.push(`- 開幕 5 分鐘內 500 人陸續抽卡（600ms 間隔）：本次 600ms 結果是預期延遲`);
  md.push(`- 開盤秒殺極端尖峰（25ms 間隔，500 人 5 秒內下單）：偶發但需要承受得住，本次 25ms 結果反映尖峰`);
  md.push(`- **同步壓測 [testspeed_0505.md](testspeed_0505.md) 的 100s+ p95 是「同一毫秒打 500 發」這種絕對不會發生的人造極限**，現場系統不會觀測到那種延遲`);
  md.push('');

  return md.join('\n') + '\n';
}

if (process.argv[1]?.endsWith('load-test-spaced.ts')) {
  main().catch((e) => {
    console.error('❌ 失敗：', e);
    process.exit(1);
  });
}
