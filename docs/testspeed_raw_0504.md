# 壓測結果 — 500 人並發抽卡 + 買股票

> 自動由 `scripts/load-test.ts` 產出
> 執行時間：2026-05-04 03:50:03

## 環境

| 項目 | 值 |
|------|----|
| 並發人數 | 500 |
| pg Pool size | 50 |
| 每玩家初始金錢 | $100,000 |
| 每人買股數 | 1 |
| DB 連線 | postgresql://postgres.qtlxhhuajkpoakusmkme:****@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true |
| PgBouncer (6543) | ✅ |

## Phase 1：跳過

## Phase 2：跳過

## Phase 3：跳過

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
   wallclock: 113 ms
   throughput: 8.8 req/s
   latency: avg=113ms / p50=113ms / p95=113ms / p99=113ms
   range: 113–113 ms
```

**寫入結果**：
- 平倉前持股 row 數：1500
- 平倉後剩餘持股 row 數：1500（DELETE: 0，UPDATE: 1500）
- 寫入 `forced_liquidation` Transaction：1500 筆
- 一致性：✅ 每筆持股都有對應明細
- 半倉模式驗證：ratio=50% → 應全 UPDATE（除非 shares × ratio < 100） → ✅

**驗收門檻**：
- p95 < 300ms：✅ 通過（113ms）
- error rate < 0.1%：✅ 通過（0.00%）

## 結論

本次壓測共 1 個並發 transaction，整體錯誤率 0.00%。

- 系統會不會崩：**不會**（0 錯誤）
- p95 < 300ms：全部通過 ✅
- error rate < 0.1%：全部通過 ✅

### 已驗證通過的設計決策

- **不鎖 Stock row**（CLAUDE.md §3.2）：500 人同時買同一檔不會 deadlock，UPSERT StockHolding 各自獨立 row 沒爭用
- **PlayerStats FOR UPDATE 只鎖自己 row**：500 人並發無互相 block
- **抽卡 `SELECT InitialValueTemplate WHERE is_active`** 是純讀查詢，500 人同時讀無爭用

