# 壓測結果 — 500 人並發抽卡 + 買股票

> 自動由 `scripts/load-test.ts` 產出
> 執行時間：2026-05-06 03:32:17

## 環境

| 項目 | 值 |
|------|----|
| 並發人數 | 500 |
| pg Pool size | 100 |
| 每玩家初始金錢 | $100,000 |
| 每人買股數 | 1 |
| DB 連線 | postgresql://postgres.qtlxhhuajkpoakusmkme:****@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true |
| PgBouncer (6543) | ✅ |
| 測試股票 | 1995 刺激1995 @ $80 |

## Phase 1：500 人同時抽命格 `drawDestiny()`

流程：BEGIN → SELECT FOR UPDATE PlayerStats → SELECT InitialValueTemplate → UPDATE PlayerStats → INSERT Transaction → COMMIT

```
total/ok/fail: 500 / 500 / 0
   error rate: 0.00%
   wallclock: 6604 ms
   throughput: 75.7 req/s
   latency: avg=3523ms / p50=3542ms / p95=6249ms / p99=6441ms
   range: 361–6601 ms
```

**驗收門檻（CLAUDE.md §12）**：
- p95 < 300ms：❌ 不通過（6249ms）
- error rate < 0.1%：✅ 通過（0.00%）

## Phase 2：500 人同時搶買同一檔股票 `buyStock()`

流程：BEGIN → SELECT Stock（**不 FOR UPDATE**）→ SELECT FOR UPDATE PlayerStats → UPDATE PlayerStats 扣錢 → UPSERT StockHolding（重算 avg_cost） → INSERT Transaction → COMMIT

```
total/ok/fail: 500 / 500 / 0
   error rate: 0.00%
   wallclock: 6235 ms
   throughput: 80.2 req/s
   latency: avg=3191ms / p50=3214ms / p95=5876ms / p99=6078ms
   range: 217–6231 ms
```

**驗收門檻**：
- p95 < 300ms：❌ 不通過（5876ms）
- error rate < 0.1%：✅ 通過（0.00%）

**資料一致性檢查**（CLAUDE.md §3.2「不鎖 Stock row」風險驗證）：
- 持股 row 數：500（預期 500）✅
- 總股數：500（預期 500）✅

## Phase 3：每回合分數計算 — 50 client × 5 round 並發排行榜查詢

**模擬情境**：1–3 個看板 + admin + 玩家多分頁同時 poll 排行榜（每回合結束後）。每個 client 連續查 5 次模擬 5 個回合。

**流程**：每次查詢 = SELECT 500 row JOIN（Account + PlayerStats）+ JS 端 weighted 計分 + sort + slice top 10

```
total/ok/fail: 250 / 250 / 0
   error rate: 0.00%
   wallclock: 609 ms
   throughput: 410.5 req/s
   latency: avg=76ms / p50=57ms / p95=137ms / p99=239ms
   range: 40–366 ms
```

**驗收門檻**：
- p95 < 300ms：✅ 通過（137ms）
- error rate < 0.1%：✅ 通過（0.00%）

## Phase 4：強制平倉 — 500 玩家 × 3 檔股票（1500 筆持股）一次平倉 50%

**模擬情境**：主持人在 `/admin/stocks` 設定本回合「強制平倉比例 = 50%」，按下「推進下一回合」時，`tickRound` Tx1 內以**單條 CTE** 一次完成：
1. 篩選所有 `StockHolding`，計算每筆 `shares_sold = FLOOR(shares × ratio / 100)`
2. `shares_sold == shares_before` 的 row → DELETE
3. `shares_sold < shares_before` 的 row → UPDATE（扣股數）
4. INSERT `forced_liquidation` Transaction 明細（每筆 1 row）

**這是單一 round-trip**，沒有 N+1，沒有 `Promise.all` 平行查詢，純粹是 PG 規劃器在伺服器端一次跑完。

```
total/ok/fail: 1 / 1 / 0
   error rate: 0.00%
   wallclock: 165 ms
   throughput: 6.1 req/s
   latency: avg=165ms / p50=165ms / p95=165ms / p99=165ms
   range: 165–165 ms
```

**寫入結果**：
- 平倉前持股 row 數：1500
- 平倉後剩餘持股 row 數：1500（DELETE: 0，UPDATE: 1500）
- 寫入 `forced_liquidation` Transaction：1500 筆
- 一致性：✅ 每筆持股都有對應明細
- 半倉模式驗證：ratio=50% → 應全 UPDATE（除非 shares × ratio < 100） → ✅

**驗收門檻**：
- p95 < 300ms：✅ 通過（165ms）
- error rate < 0.1%：✅ 通過（0.00%）

## Phase 5：業力影響 — 500 玩家依當下 karma 取對應 KarmaBand 套四項 delta

**模擬情境**：每 10 分鐘主持人按「推進下一回合」，`tickRound` Tx1 內以**單條 CTE** 對所有「health > 0 AND blessing > 0」玩家：
1. LATERAL JOIN `KarmaBand` 找對應 band（重疊以 `sort_order` 小者優先 LIMIT 1）
2. 跳過全 0 delta 的 band（如「平凡」「微濁」）
3. UPDATE `PlayerStats`（health cap [0, 100]、money / blessing floor 0、karma 不限）
4. INSERT `karma_band_effect` Transaction（band_label + 4 項 delta）

**玩家分佈**（測試前鋪設，平均分到 6 個預設 band）：

| Band | karma 範例 | 玩家數 | money | health | blessing | karma | 是否寫 Transaction |
|------|-----------|-------|-------|--------|----------|-------|----|
| 光明 | -300 | 84 | 0 | 0 | +10 | 0 | ✅ |
| 平凡 | -100 | 84 | 0 | 0 | 0 | 0 | ❌（全 0 跳過）|
| 微濁 |   50 | 83 | 0 | 0 | 0 | 0 | ❌（全 0 跳過）|
| 渙散 |  150 | 83 | -10000 | 0 | -3 | 0 | ✅ |
| 迷失 |  250 | 83 | -2000 | 0 | -2 | 0 | ✅ |
| 墮落 |  400 | 83 | 0 | -2 | -2 | 0 | ✅ |

**預期 Transaction 寫入**：333 筆（光明 / 渙散 / 迷失 / 墮落 共 4 個 band 的玩家）

```
total/ok/fail: 1 / 1 / 0
   error rate: 0.00%
   wallclock: 69 ms
   throughput: 14.5 req/s
   latency: avg=69ms / p50=69ms / p95=69ms / p99=69ms
   range: 69–69 ms
```

**寫入結果**：
- 寫入 `karma_band_effect` Transaction：333 筆
- 一致性：✅ 等於預期 333
- 平凡 / 微濁 玩家被正確跳過：✅

**驗收門檻**：
- p95 < 300ms：✅ 通過（69ms）
- error rate < 0.1%：✅ 通過（0.00%）

## 結論

本次壓測共 1252 個並發 transaction，整體錯誤率 0.00%。

- 系統會不會崩：**不會**（0 錯誤）
- p95 < 300ms：部分未通過 ❌
- error rate < 0.1%：全部通過 ✅

### 已驗證通過的設計決策

- **不鎖 Stock row**（CLAUDE.md §3.2）：500 人同時買同一檔不會 deadlock，UPSERT StockHolding 各自獨立 row 沒爭用
- **PlayerStats FOR UPDATE 只鎖自己 row**：500 人並發無互相 block
- **抽卡 `SELECT InitialValueTemplate WHERE is_active`** 是純讀查詢，500 人同時讀無爭用

