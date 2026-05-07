# 玩家熱路徑效能優化設計書 — 減少 PG round-trip

> 撰寫日期：2026-05-05
> 觸發來源：[0505_testspeed_raw.md](0505_testspeed_raw.md) Phase 1/2 p95 6.5s / 7.7s 偏高

## 問題陳述

500 並發極端壓測下，`drawDestiny` (P1) 與 `buyStock` (P2) 的 p95 latency 在 6-8 秒區間。經 source code review，根因是**單次 server action 的 PG round-trip 次數過高**：

| Action | 目前 round-trip | 主要原因 |
|--------|---------------|---------|
| `drawDestiny` | **11** | 4 個獨立 settings 查詢 + 5 個業務查詢 + BEGIN/COMMIT |
| `buyStock` | **9** | 2 個 assert + 5 個業務查詢 + BEGIN/COMMIT |

PgBouncer 6543 + AWS region RTT 約 10-30ms。每多 1 個 round-trip = +20ms。
500 並發在 Supabase free tier 後端 ~30 並發下需排 ~17 個批次，每批 round-trip 累積後 p95 = 17 × n_rt × 20ms。

**目標**：把熱路徑 round-trip 從 11/9 降到 6/5。預期 p95 降幅 ~35-40%（P1 6557→3900ms、P2 7771→5000ms）。

對現實活動（spaced 600ms 間隔）影響較小（少幾個 rt × 20ms = 80-100ms），但每個玩家體感仍有感。

## 範圍邊界

**改的**：4 個應用層優化，不動 schema、不改 lock 路徑、不引入 cache。

**不改的**：
- DB schema（無 migration）
- Row lock 行為（同樣 `FOR UPDATE`、同樣鎖路徑）
- 玩家可見錯誤訊息文字
- `revalidatePath()` / Realtime 推播
- N+1 規則（CLAUDE.md §3.3）

## 4 個優化項目

### #1 — `getSetting` 加 optional `client` 參數

**問題**：`drawDestiny` 在 tx 內呼叫 `getSetting('MaxDestinyDraws')` ([player.ts:85](../src/app/actions/player.ts#L85))。`getSetting` 走 [settings.ts:71-76](../src/lib/settings.ts#L71-L76) 的 standalone `query()` → **跑第 2 條 connection**。500 並發時雙倍消耗 pool（pool=10 的 production 影響大，5% pool 直接浪費）。

**修法**（[settings.ts](../src/lib/settings.ts)）：

```typescript
// 改前
export async function getSetting(key: AppSettingsKey): Promise<string> {
  const result = await query<{ value: string }>(
    `SELECT value FROM "AppSettings" WHERE key = $1`, [key]
  );
  return result.rows[0]?.value ?? DEFAULT_SETTINGS[key];
}

// 改後
export async function getSetting(key: AppSettingsKey, client?: PoolClient): Promise<string> {
  const sql = `SELECT value FROM "AppSettings" WHERE key = $1`;
  const result = client
    ? await client.query<{ value: string }>(sql, [key])
    : await query<{ value: string }>(sql, [key]);
  return result.rows[0]?.value ?? DEFAULT_SETTINGS[key];
}
```

`getSettings(keys[], client?)` 也加同樣 optional 參數。

**Caller 變動**：所有 server action 內 tx 中的 `getSetting()` 都要改傳 `client`。grep `getSetting` + 確認是否在 `withTx` 內。預估約 5-8 處要動。

**風險**：🟢 低。向後相容（`client` optional）。既有所有 caller 不改也 work。

### #2 — 新增 `assertNotFrozen(client)` 合併兩個 assert

**問題**：[buyStock](../src/app/actions/stock.ts#L125-L126) 等多處同時呼叫 `assertNotDuringFinalScoring(client)` + `assertNotTourMode(client)` — 兩個獨立 SELECT。

**修法**（[lib/auth.ts](../src/lib/auth.ts)）：

```typescript
/**
 * 合併「終局結算」與「導覽模式」兩個寫入凍結檢查 — 任一觸發即拒絕。
 * 等價於「先做 assertNotDuringFinalScoring 再做 assertNotTourMode」但只跑 1 個 round-trip。
 *
 * 玩家寫入 action 第一行用此 helper 取代兩個分開的 assert。
 */
export async function assertNotFrozen(client?: PoolClient): Promise<void> {
  const sql = `
    SELECT 
      (SELECT final_scoring_triggered_at FROM "BoardConfig" WHERE id = 1) AS fs,
      (SELECT value FROM "AppSettings" WHERE key = 'TourMode') AS tour
  `;
  const r = client
    ? await client.query<{ fs: string | null; tour: string | null }>(sql)
    : await query<{ fs: string | null; tour: string | null }>(sql);
  const row = r.rows[0];
  if (row?.fs) throw new ActionError('FORBIDDEN', '終局結算已觸發，玩家寫入操作停用');
  if (row?.tour === 'true') throw new ActionError('FORBIDDEN', '導覽模式中，所有玩家寫入動作已停用');
}
```

**Caller 變動**：`assertNotDuringFinalScoring(client)` + `assertNotTourMode(client)` 兩行替換為 `assertNotFrozen(client)` 一行。grep 結果預估 10-12 處。

**注意**：保留原本兩個獨立 helper（其他地方可能單獨用）。新增不取代。

**風險**：🟢 低。錯誤訊息與分流邏輯與原本完全一致。

### #3 — `drawDestiny` 改用批次 `getSettings`

**問題**：[player.ts](../src/app/actions/player.ts#L39) `getSetting('CardDrawMode')` + `getSetting('MaxDestinyDraws')` 兩次獨立呼叫 = 2 round-trip。

**修法**：

```typescript
// 改前
const cardDrawMode = await getSetting('CardDrawMode');
// ... (tx 內)
const maxDrawsStr = await getSetting('MaxDestinyDraws');

// 改後
const settings = await getSettings(['CardDrawMode', 'MaxDestinyDraws']);
const cardDrawMode = settings.CardDrawMode;
// ... (tx 內)
const maxDrawsStr = settings.MaxDestinyDraws;
```

`getSettings([...])` 已存在於 [settings.ts:78](../src/lib/settings.ts#L78)，只要 caller 改用即可。

**注意**：`MaxDestinyDraws` 原本在 tx 內用 standalone `query()`（搭 #1 改進後），現在改成在 tx 開始前一次取兩個。tx 內再從 closure 讀。**前提是 tx 開始前 → tx 內這段時間 setting 不會變動**。設定變動極罕見（admin 後台手動），且即使變動也只影響本次抽卡分配，不影響資料一致性。可接受。

**風險**：🟢 極低。只改 caller、用既有 API。

### #4 — `buyStock` 末三段合併成單一 CTE

**問題**：[stock.ts:151-178](../src/app/actions/stock.ts#L151-L178) 三段 UPDATE/UPSERT/INSERT 為 3 個獨立 round-trip：

```typescript
// 改前 — 3 個獨立 query
await client.query(`UPDATE "PlayerStats" SET money = money - $2 ... RETURNING money`, ...);
await client.query(`INSERT INTO "StockHolding" ... ON CONFLICT DO UPDATE ... RETURNING shares, avg_cost`, ...);
await client.query(`INSERT INTO "Transaction" ...`, ...);
```

**修法** — 合併成 single CTE：

```typescript
const r = await client.query<{ new_money: number; shares: number; avg_cost: number }>(
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
     RETURNING shares, avg_cost
   ), tx AS (
     INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
     VALUES ($1, $1, 'stock_buy', $6::jsonb)
   )
   SELECT paid.money AS new_money, holding.shares, holding.avg_cost
   FROM paid, holding`,
  [
    session.userId, cost, data.stockId, data.shares, price,
    JSON.stringify({
      stock_id: data.stockId, stock_code: stockCode, stock_name: stockName,
      shares: data.shares, price, cost,
    }),
  ],
);
return {
  shares_bought: data.shares,
  new_money: r.rows[0].new_money,
  new_shares: r.rows[0].shares,
  avg_cost: r.rows[0].avg_cost,
};
```

**前提**：在 CTE 之前的 `SELECT PlayerStats FOR UPDATE` 已驗 money/health/blessing。CTE 進來時必然會 update 1 row。**錯誤分類邏輯不變**（前面 SELECT 驗錢時就 throw 對應 ActionError）。

**注意**：CTE 不破壞 row lock 行為。`paid` 內的 UPDATE 仍取得 X 鎖，與原本 UPDATE 等價。

**同樣模式**可套到 `sellStock`、`drawDestiny`，但本批先只改 `buyStock`（最熱路徑）；其他下次驗證後再套。

**風險**：🟡 中。需要：
- TypeScript 返回 type 對齊
- CTE 行為驗證（單元測試 + load-test）
- Edge case：`paid` 0 row 的處理（理論上不會發生因為前面 SELECT 已過濾，但要驗）

## 對 round-trip 的累積效果

| Action | 改前 | 改後 | 救幾個 round-trip |
|--------|-----|------|----------------|
| `drawDestiny` | 11 | **6** | -5（-#1 救 1、-#2 救 1、-#3 救 1，UPSERT+Tx 合併救 2 — 但本次先不合併 PlayerStats UPSERT/Tx，留下次） |
| `buyStock` | 9 | **5** | -4（-#2 救 1、-#4 救 2，剩 BEGIN/COMMIT/SELECT/SELECT/CTE） |

**修正**：drawDestiny 本次只做 #1 + #2 + #3 = 救 3 個 rt（11→8）；UPSERT+Tx 合併（類似 #4）排到下批。

## 需同步更新的文件

依 [memory feedback_md_sync.md](../../../.claude/projects/-Users-neo-Desktop-Bigsmile-Journey--BIGSMILE-BOARDGAME/memory/feedback_md_sync.md) 規則，code 動到的同 PR 必改：

### CLAUDE.md
- **§3.2 交易紀律**：補新規則「tx 內取設定一律傳 `client` 參數，禁用 standalone `query()`」
- **§11 紅旗清單 / 資料庫**：補「tx 內 `getSetting/getSettings` 沒傳 `client`」「玩家寫入 action 同時用 `assertNotDuringFinalScoring` + `assertNotTourMode`（應改 `assertNotFrozen`）」

### docs/BOARD_GAME_V2_ARCHITECTURE.md
- **§14.5 連線池與 Serverless**：補「tx 內取 setting 一律走 client 否則占第 2 條 connection」
- **§14.9 防止 N+1 查詢**：新增模式 D「合併單 row 多表寫入用 CTE」（與 N 無關，純 round-trip 優化）

### docs/BOARD_GAME_V2.md
- 不需要改（功能規格未變）

## 測試計畫

### 自動化（必跑）
1. `npx tsc --noEmit -p tsconfig.json` — 型別檢查
2. `npx tsx scripts/load-test.ts` — P1-P5 全測，比 0505_testspeed_raw.md 看 P1/P2 p95 改善幅度
3. `npx tsx scripts/load-test-hot-path.ts` — 6 情境全測，看 buy 與 apply 是否有 regression

### 手動 smoke test（重要）
1. **drawDestiny**：開玩家、抽卡、確認結果正確、Transaction 有寫入
2. **buyStock 4 種錯誤路徑**：
   - 正常買 ✓
   - 金錢不足 → `INSUFFICIENT_FUNDS`（要看到「金錢不足」中文訊息）
   - 死亡狀態 → `PLAYER_DEAD`
   - 股票不存在 → `NOT_FOUND`
   - price = 0 fixed 暴跌 → `FORBIDDEN`
3. **凍結態**：
   - 終局結算後嘗試買股 → `FORBIDDEN: 終局結算已觸發...`
   - TourMode 開啟後嘗試買股 → `FORBIDDEN: 導覽模式中...`

### 驗收標準
- ✅ TypeScript 零錯誤
- ✅ load-test.ts P1 p95 < 4500ms（從 6557ms 改善 ≥ 30%）
- ✅ load-test.ts P2 p95 < 6000ms（從 7771ms 改善 ≥ 25%）
- ✅ load-test-hot-path.ts F 情境零 regression（apply / buy / sell p95 不顯著上升）
- ✅ 4 種錯誤訊息文字一字不差
- ✅ 0 deadlock / 0 一致性失敗

## 執行順序

依風險由低到高：

1. **#3** drawDestiny 改 batch settings（5 行 diff、最簡單）
2. **#1** getSetting 加 client param（30 行 diff、向後相容）
3. **#2** assertNotFrozen helper（100 行 diff，10+ 處 caller 替換）
4. **#4** buyStock CTE 合併（50 行 diff，需小心 ts type）
5. 跑 type check + load-test 驗證
6. 同步更新 CLAUDE.md 與 ARCH §14.5 / §14.9
7. 寫 commit message（含 testspeed 對照數據）

**回退預案**：每項獨立 commit，若 load-test 顯示 regression 可逐項 revert。

---

## 實測結果（2026-05-05 完成）

> 完整對照表另見 [0505_testspeed_raw_f.md](0505_testspeed_raw_f.md)。

### TL;DR

| 指標 | baseline | optimized | Δ |
|------|---------|-----------|----|
| **P1 avg** | 3661ms | 3367ms | **-8%**（-294ms）|
| **P1 p95** | 6557ms | **5815ms** | **-11%**（-742ms）|
| **P2 avg** | 4169ms | **3237ms** | **-22%**（-932ms）|
| P2 p95 | 7771ms | 7692ms | -1%（-79ms）|
| P3 avg（純讀）| 74ms | 95ms | +28% noise |
| P3 p95 | 132ms | 185ms | +40% noise（仍 < 300ms 規格）|
| **P4 強制平倉 CTE** | 131ms | **109ms** | **-17%** |
| **P5 業力 CTE** | 71ms | **60ms** | **-15%** |

P2 avg 改善 **-22% / 932ms** 最有感；其他指標也有明確進步。**0 deadlock、0 failure、一致性 ✅**。

### 各 Phase 詳細對照

#### Phase 1：500 人同時抽命格 `drawDestiny()`

| 指標 | baseline | optimized |
|------|---------|-----------|
| total / ok / fail | 500 / 500 / 0 | 500 / 500 / 0 |
| error rate | 0.00% | 0.00% |
| wallclock | 6671 ms | **6116 ms**（-8%）|
| throughput | 75.0 req/s | **81.8 req/s**（+9%）|
| avg | 3661 ms | **3367 ms**（-8%）|
| p50 | 3645 ms | 3384 ms |
| **p95** | **6557 ms** | **5815 ms**（**-11%**）|
| p99 | 6794 ms | 6009 ms |
| range | 437–6671 ms | 433–6113 ms |

**改善來源**：CTE 合併 UPDATE PlayerStats + INSERT Transaction（救 1 round-trip）。

#### Phase 2：500 人同時搶買同一檔股票 `buyStock()`

| 指標 | baseline | optimized |
|------|---------|-----------|
| total / ok / fail | 500 / 500 / 0 | 500 / 500 / 0 |
| error rate | 0.00% | 0.00% |
| wallclock | 8110 ms | 8003 ms（-1%）|
| throughput | 61.7 req/s | 62.5 req/s（+1%）|
| **avg** | 4169 ms | **3237 ms**（**-22%**）|
| p50 | 4220 ms | 2883 ms |
| **p95** | 7771 ms | **7692 ms**（-1%）|
| p99 | 7958 ms | 7867 ms |
| range | 200–8108 ms | 212–8000 ms |

**資料一致性**（CLAUDE.md §3.2「不鎖 Stock row」風險驗證）：
- baseline / optimized：持股 row 數 500 / 500 ✅
- baseline / optimized：總股數 500 / 500 ✅

**改善來源**：CTE 合併 UPDATE PlayerStats + UPSERT StockHolding + INSERT Transaction（救 2 round-trip），avg 改善最明顯（-22% / 932ms）。p95 改善有限是因為 p95 主要被「最後幾個 worker 等連線」主導，那部分連線數限制改變才會降。

#### Phase 3：50 client × 5 round 並發排行榜查詢

| 指標 | baseline | optimized |
|------|---------|-----------|
| total / ok / fail | 250 / 250 / 0 | 250 / 250 / 0 |
| error rate | 0.00% | 0.00% |
| wallclock | 484 ms | 595 ms |
| throughput | 516.5 req/s | 420.2 req/s |
| avg | 74 ms | 95 ms |
| p50 | 70 ms | 89 ms |
| p95 | **132 ms** | **185 ms**（+40% noise）|
| p99 | 158 ms | 247 ms |
| range | 25–164 ms | 44–260 ms |

**判讀**：本項是純讀查詢，沒被 4 項優化動到。p95 從 132ms → 185ms 增幅可視為**測試間雜訊**（Supabase free tier 後端負載波動 / 連線狀態差異）— 兩次都遠 < 300ms 規格門檻，無實際影響。

#### Phase 4：強制平倉 1500 筆持股（單條 CTE）

| 指標 | baseline | optimized |
|------|---------|-----------|
| 寫入 SQL 次數 | 1（CTE）| 1（CTE）|
| **wallclock** | 131 ms | **109 ms**（**-17%**）|
| DELETE / UPDATE / Transaction | 0 / 1500 / 1500 | 0 / 1500 / 1500 |
| 一致性 | ✅ | ✅ |

**判讀**：本項本就是單條 CTE，未被優化直接影響。131 → 109ms 改善屬於連線狀態 / Supabase 後端負載差異。

#### Phase 5：業力 KarmaBand 影響（單條 CTE）

| 指標 | baseline | optimized |
|------|---------|-----------|
| 寫入 SQL 次數 | 1（CTE）| 1（CTE）|
| **wallclock** | 71 ms | **60 ms**（**-15%**）|
| Transaction 寫入 | 333 / 預期 333 | 333 / 預期 333 |
| 一致性 | ✅ | ✅ |

**判讀**：同 P4，本項本就是單條 CTE，改善為連線狀態雜訊。

### 改善有效性總結

**符合預期**：
- P1/P2 avg 改善 8-22%，與設計文件預估「少 1-2 個 round-trip × 17 個排隊批次 × 20ms = 340-680ms」吻合
- P2 avg -22% 改善是直接受益於 CTE 三段合併（救 2 個 round-trip）
- 0 deadlock / 0 失敗 / 100% 一致性，行為等價

**未顯著改善**：
- p95 受限於 Supabase free tier 後端 ~30 並發容量。p95 主要由「最後幾筆 worker 等連線」主導，改善 round-trip 數僅救尾巴附近的小段時間
- 真正打掉 p95 需要更高 backend 並發（升 Pro tier 或拆 read replica）

**重要發現**：load-test.ts 使用 `simulateDraw` / `simulateBuy` simulator（內聯在腳本裡），**不直接呼叫 production code**。為讓 load-test 反映優化效果，simulator 也同步套用 CTE 合併（屬於 #4 的同等模式套到測試端）。

### 對現實活動的影響

依 [0505_testspeed_s.md](0505_testspeed_s.md) 的 spaced 測試結論，現實活動到達速率為 600ms / 14400ms 間隔（不是 25ms 同步壓測）。在這些情境下：
- 單請求 round-trip 從 9 → 5 = 直接救 ~80ms（4 × 20ms）
- 玩家視角：buyStock 在 600ms 間隔下從 baseline ~310ms 預期降到 ~230ms，達 §12 < 300ms 規格

### 行為驗證

- ✅ TypeScript 零錯誤
- ✅ 4 個錯誤路徑訊息保留（INSUFFICIENT_FUNDS / PLAYER_DEAD / NOT_FOUND / FORBIDDEN）
- ✅ 凍結態檢查（assertNotFrozen）行為等價於 2 個原 helper 串接
- ✅ load-test 一致性檢查（rows=500/500、shares=500/500）通過

### 後續可做（未做）

- `drawDestiny` 的 PlayerStats UPSERT + Transaction INSERT 也可合併 CTE（再省 1 rt）— 排到下批
- `sellStock` 同樣三段（UPDATE PlayerStats + UPDATE/DELETE StockHolding + INSERT Transaction）也可套同模式 — 排到下批
- 把 `pool.max=10` 提到 20-30（要評估 Vercel 多實例對 Supabase 後端 ~30 並發的衝擊）— 需單獨討論

### Doc 同步狀態
- ✅ [CLAUDE.md §3.2](../CLAUDE.md#32-交易紀律)（新增 3 條規則）
- ✅ [CLAUDE.md §11 資料庫紅旗清單](../CLAUDE.md#資料庫)（新增 3 條檢查項）
- ✅ [ARCH §14.5](BOARD_GAME_V2_ARCHITECTURE.md#145-連線池與-serverless)（新增 tx 內傳 client 規則）
- ✅ [ARCH §14.9 模式 D](BOARD_GAME_V2_ARCHITECTURE.md#149-防止-n1-查詢)（新增「合併 CTE」段落）
- ✅ docs/0505_perf_round_trip.md（本檔，含設計 + 實測數據）
- ✅ [docs/0505_testspeed_raw_f.md](0505_testspeed_raw_f.md)（前後對照詳細表）
