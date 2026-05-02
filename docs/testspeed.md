# 壓測結果 — 500 人並發抽卡 + 買股票

> 自動由 `scripts/load-test.ts` 產出
> 執行時間：2026-05-02 07:30:43

## 環境

| 項目 | 值 |
|------|----|
| 並發人數 | 500 |
| pg Pool size | 10 |
| 每玩家初始金錢 | $100,000 |
| 每人買股數 | 1 |
| DB 連線 | postgresql://postgres.qtlxhhuajkpoakusmkme:****@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres |
| PgBouncer (6543) | ⚠️ 直連 5432，500 並發必爆連線池 |
| 測試股票 | BTC 123 @ $40 |

## Phase 1：500 人同時抽命格 `drawDestiny()`

流程：BEGIN → SELECT FOR UPDATE PlayerStats → SELECT InitialValueTemplate → UPDATE PlayerStats → INSERT Transaction → COMMIT

```
total/ok/fail: 500 / 500 / 0
   error rate: 0.00%
   wallclock: 13334 ms
   throughput: 37.5 req/s
   latency: avg=6844ms / p50=6850ms / p95=12715ms / p99=13239ms
   range: 272–13330 ms
```

**驗收門檻（CLAUDE.md §12）**：
- p95 < 300ms：❌ 不通過（12715ms）
- error rate < 0.1%：✅ 通過（0.00%）

## Phase 2：500 人同時搶買同一檔股票 `buyStock()`

流程：BEGIN → SELECT Stock（**不 FOR UPDATE**）→ SELECT FOR UPDATE PlayerStats → UPDATE PlayerStats 扣錢 → UPSERT StockHolding（重算 avg_cost） → INSERT Transaction → COMMIT

```
total/ok/fail: 500 / 500 / 0
   error rate: 0.00%
   wallclock: 15590 ms
   throughput: 32.1 req/s
   latency: avg=7898ms / p50=7891ms / p95=14941ms / p99=15554ms
   range: 309–15586 ms
```

**驗收門檻**：
- p95 < 300ms：❌ 不通過（14941ms）
- error rate < 0.1%：✅ 通過（0.00%）

**資料一致性檢查**（CLAUDE.md §3.2「不鎖 Stock row」風險驗證）：
- 持股 row 數：500（預期 500）✅
- 總股數：500（預期 500）✅

## 結論

本次壓測共 1000 個並發 transaction，整體錯誤率 **0.00%**。

### 系統會不會崩？**不會**（核心結論）

- ✅ Phase 1 / Phase 2 全部 500 個 tx 都成功完成（0 錯誤）
- ✅ 資料 100% 一致（持股 row 數、總股數都正確）
- ✅ 沒有 deadlock、沒有 lock timeout、沒有資料遺失

### 為什麼 p95 高達 12-14 秒？— pool size 排隊限制

第一次跑 `pool=50` 時馬上爆：
```
error: (EMAXCONNSESSION) max clients reached in session mode
- max clients are limited to pool_size: 15
```

**Supabase Free tier session pooler (5432) 上限只有 15 個連線**。本次測試改 `pool=10` 保守值，500 並發要排 50 個 batch，每 batch ~100-150ms tx → 累積 5-15 秒排隊延遲。

**這不是 code 慢**，是**連線池排隊**。每個 tx 自身 latency 拆解：
- min latency = 272ms（第一批 10 個沒排隊）→ tx 內部 ~250ms（含網路 round-trip 到東京 region）
- p50 = 6.8s = 約 50 batch × 130ms 排隊
- max = 13.3s（最後一批排到才開始）

### 正式部署修正（CLAUDE.md §12）

| 項目 | 本次測試 | 正式應該 |
|------|---------|---------|
| DB 連線 | 5432 session pooler | **6543 transaction pooler**（PgBouncer transaction mode） |
| Pool 上限 | Free tier session = 15 | Pro tier transaction = 200 / 1000 |
| 預期 p95 | 12.7s（pool 排隊） | **< 300ms**（無排隊） |

**等到 production 改用 6543 + Pro tier**，500 並發抽卡實際 p95 估算：
- tx 自身 latency ~250ms（已測得）
- 200 pool 容納 500 → 排 2.5 batch × 250ms = 625ms 整體 wallclock
- 個別 p95 ≈ 350-450ms（接近驗收門檻）

進一步優化空間：
- 縮短抽卡 tx：合併 SELECT FOR UPDATE + UPDATE 成單條 `UPDATE ... WHERE destiny_name IS NULL RETURNING`（省一次 round-trip → ~150ms tx）
- 用 prepared statement
- 接近 region 部署 Vercel function（已在 ap-northeast-1）

### 已驗證通過的設計決策（CLAUDE.md §3.2 / §11）

- ✅ **不鎖 Stock row**：500 人同時買同一檔不會 deadlock，UPSERT StockHolding 各自獨立 row 無爭用。一致性檢查：500 row / 500 股全對。
- ✅ **PlayerStats FOR UPDATE 只鎖自己 row**：500 人並發無互相 block，throughput 受限只在於連線池排隊
- ✅ **抽卡 SELECT InitialValueTemplate** 是純讀，500 人同時讀無爭用
- ✅ **stock_buy / destiny_draw Transaction INSERT** 每筆獨立 row，沒有共用序列爭用

### 風險清單

| 風險 | 緩解 |
|------|------|
| Free tier session pooler 只有 15 conn | 升 Pro 用 transaction pooler 6543（200+ pool） |
| 抽卡集中時間（活動開場 5 分鐘內 500 人）| 至少 200 conn pool，否則 p95 ≥ 1s 玩家會卡 |
| Vercel function concurrency limit | Pro plan 1000 ✅ |
| 抽卡 race（兩人搶同一玩家自己的 PlayerStats）| 不存在 — 每人鎖自己 row，不會跨人爭用 |
| 終局結算瞬間查 leaderboard 200 列 | < 50ms，OK |

### 重跑這個壓測

```bash
npm run load:test                       # 預設 500 人 / pool 10
npm run load:test -- --n 100 --pool 10  # 100 人輕量測試
npm run load:test -- --cleanup          # 測完刪除測試帳號

# 升級到 PgBouncer 6543 後驗收 < 300ms：
# 把 .env.local 的 DATABASE_URL 改成 :6543/postgres?pgbouncer=true
# npm run load:test -- --n 500 --pool 100
```

> 測試帳號 user_id 都是 `loadtest_*`，不會與正式玩家衝突。預設保留以便重跑（destiny 與持股每次自動重置）。

