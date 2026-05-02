# 壓測結果 — 500 人並發抽卡 + 買股票

> 自動由 `scripts/load-test.ts` 產出
> 執行時間：2026-05-02 07:51:37

## 環境

| 項目 | 值 |
|------|----|
| 並發人數 | 500 |
| pg Pool size | 200 |
| 每玩家初始金錢 | $100,000 |
| 每人買股數 | 1 |
| DB 連線 | postgresql://postgres.qtlxhhuajkpoakusmkme:****@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true |
| PgBouncer (6543) | ✅ |
| 測試股票 | BTC 123 @ $40 |

## Phase 1：500 人同時抽命格 `drawDestiny()`

流程：BEGIN → SELECT FOR UPDATE PlayerStats → SELECT InitialValueTemplate → UPDATE PlayerStats → INSERT Transaction → COMMIT

```
total/ok/fail: 500 / 500 / 0
   error rate: 0.00%
   wallclock: 6983 ms
   throughput: 71.6 req/s
   latency: avg=3657ms / p50=3645ms / p95=6566ms / p99=6794ms
   range: 294–6979 ms
```

**驗收門檻（CLAUDE.md §12）**：
- p95 < 300ms：❌ 不通過（6566ms）
- error rate < 0.1%：✅ 通過（0.00%）

## Phase 2：500 人同時搶買同一檔股票 `buyStock()`

流程：BEGIN → SELECT Stock（**不 FOR UPDATE**）→ SELECT FOR UPDATE PlayerStats → UPDATE PlayerStats 扣錢 → UPSERT StockHolding（重算 avg_cost） → INSERT Transaction → COMMIT

```
total/ok/fail: 500 / 500 / 0
   error rate: 0.00%
   wallclock: 8015 ms
   throughput: 62.4 req/s
   latency: avg=4068ms / p50=4071ms / p95=7563ms / p99=7808ms
   range: 284–8012 ms
```

**驗收門檻**：
- p95 < 300ms：❌ 不通過（7563ms）
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
   wallclock: 620 ms
   throughput: 403.2 req/s
   latency: avg=86ms / p50=75ms / p95=169ms / p99=191ms
   range: 42–368 ms
```

**驗收門檻**：
- p95 < 300ms：✅ 通過（169ms）
- error rate < 0.1%：✅ 通過（0.00%）

## 結論

本次壓測共 1250 個並發 transaction，整體錯誤率 0.00%。

- 系統會不會崩：**不會**（0 錯誤）
- p95 < 300ms：部分未通過 ❌
- error rate < 0.1%：全部通過 ✅

### 已驗證通過的設計決策

- **不鎖 Stock row**（CLAUDE.md §3.2）：500 人同時買同一檔不會 deadlock，UPSERT StockHolding 各自獨立 row 沒爭用
- **PlayerStats FOR UPDATE 只鎖自己 row**：500 人並發無互相 block
- **抽卡 `SELECT InitialValueTemplate WHERE is_active`** 是純讀查詢，500 人同時讀無爭用

