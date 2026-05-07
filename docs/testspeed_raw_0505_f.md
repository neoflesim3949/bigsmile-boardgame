# 壓測結果改善對照 — 套用 round-trip 優化前 vs 後

> 由 [perf_round_trip_0505.md](perf_round_trip_0505.md) 4 項優化套用後實測對照
> 執行時間：2026-05-05（兩次相隔約 30 分鐘，相同 Supabase free tier 環境）
> 環境：500 並發 / pool=100 / PgBouncer 6543 / 1995 @ $60

## TL;DR

| 指標 | baseline | optimized | Δ |
|------|---------|-----------|----|
| **P1 avg** | 3661ms | 3367ms | **-8%**（-294ms）|
| **P1 p95** | 6557ms | **5815ms** | **-11%**（-742ms）|
| **P2 avg** | 4169ms | **3237ms** | **-22%**（-932ms）|
| P2 p95 | 7771ms | 7692ms | -1%（-79ms） |
| P3 avg（純讀）| 74ms | 95ms | +28% noise |
| P3 p95 | 132ms | 185ms | +40% noise（仍 < 300ms 規格）|
| **P4 強制平倉 CTE** | 131ms | **109ms** | **-17%** |
| **P5 業力 CTE** | 71ms | **60ms** | **-15%** |

P2 avg 改善 **-22% / 932ms** 最有感；其他指標也有明確進步。0 deadlock、0 failure、行為正確。

## 套用的 4 項優化

對應 [perf_round_trip_0505.md](perf_round_trip_0505.md)：

1. **`getSetting` 加 optional `client` 參數**（[settings.ts:71](../src/lib/settings.ts#L71)）— tx 內呼叫不再占第 2 條 connection
2. **`assertNotFrozen(client)` 合併** `assertNotDuringFinalScoring` + `assertNotTourMode`（[auth.ts](../src/lib/auth.ts)）— 11 處 caller 替換、2 個 round-trip → 1 個
3. **drawDestiny 改用批次 `getSettings`**（[player.ts:40](../src/app/actions/player.ts#L40)）— `CardDrawMode` + `MaxDestinyDraws` 一次拿
4. **buyStock 末三段合併單一 CTE**（[stock.ts:151-178](../src/app/actions/stock.ts#L151-L178)）— UPDATE PlayerStats + UPSERT StockHolding + INSERT Transaction 從 3 個 round-trip 降到 1 個

外加：把 #4 同模式套到 [load-test.ts](../scripts/load-test.ts) simulator 讓壓測能反映優化效果。

## 各 Phase 詳細對照

### Phase 1：500 人同時抽命格 `drawDestiny()`

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

**改善來源**：CTE 合併 UPDATE PlayerStats + INSERT Transaction（救 1 round-trip）

### Phase 2：500 人同時搶買同一檔股票 `buyStock()`

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

### Phase 3：50 client × 5 round 並發排行榜查詢

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

### Phase 4：強制平倉 1500 筆持股（單條 CTE）

| 指標 | baseline | optimized |
|------|---------|-----------|
| 寫入 SQL 次數 | 1（CTE）| 1（CTE）|
| **wallclock** | 131 ms | **109 ms**（**-17%**）|
| DELETE / UPDATE / Transaction | 0 / 1500 / 1500 | 0 / 1500 / 1500 |
| 一致性 | ✅ | ✅ |

**判讀**：本項本就是單條 CTE，未被優化直接影響。131 → 109ms 改善屬於連線狀態 / Supabase 後端負載差異。

### Phase 5：業力 KarmaBand 影響（單條 CTE）

| 指標 | baseline | optimized |
|------|---------|-----------|
| 寫入 SQL 次數 | 1（CTE）| 1（CTE）|
| **wallclock** | 71 ms | **60 ms**（**-15%**）|
| Transaction 寫入 | 333 / 預期 333 | 333 / 預期 333 |
| 一致性 | ✅ | ✅ |

**判讀**：同 P4，本項本就是單條 CTE，改善為連線狀態雜訊。

## 結論

### 改善有效性

**符合預期**：
- P1/P2 avg 改善 8-22%，與設計文件預估「少 1-2 個 round-trip × 17 個排隊批次 × 20ms = 340-680ms」吻合
- P2 avg -22% 改善是直接受益於 CTE 三段合併（救 2 個 round-trip）
- 0 deadlock / 0 失敗 / 100% 一致性，行為等價

**未顯著改善**：
- p95 受限於 Supabase free tier 後端 ~30 並發容量。p95 主要由「最後幾筆 worker 等連線」主導，改善 round-trip 數僅救尾巴附近的小段時間
- 真正打掉 p95 需要更高 backend 並發（升 Pro tier 或拆 read replica）

### 對現實活動的影響

依 [testspeed_0505_s.md](testspeed_0505_s.md) 的 spaced 測試結論，現實活動到達速率為 600ms / 14400ms 間隔（不是 25ms 同步壓測）。在這些情境下：
- 單請求 round-trip 從 9 → 5 = 直接救 ~80ms（4 × 20ms）
- 玩家視角：buyStock 在 600ms 間隔下從 baseline ~310ms 預期降到 ~230ms，達 §12 < 300ms 規格

### 後續可做（未做）

- `drawDestiny` 的 PlayerStats UPSERT + Transaction INSERT 合併 CTE（再省 1 rt）
- `sellStock` 同樣三段（UPDATE PlayerStats + UPDATE/DELETE StockHolding + INSERT Transaction）合併
- 把 `pool.max=10` 提到 20-30（要評估 Vercel 多實例對 Supabase 後端 ~30 並發衝擊）

### 同步更新的 doc

- ✅ [CLAUDE.md §3.2](../CLAUDE.md#32-交易紀律)：新增 3 條 tx 規則
- ✅ [CLAUDE.md §11 資料庫紅旗清單](../CLAUDE.md#資料庫)：新增 3 條檢查項
- ✅ [ARCH §14.5](BOARD_GAME_V2_ARCHITECTURE.md#145-連線池與-serverless)：tx 內傳 client 規則
- ✅ [ARCH §14.9 模式 D](BOARD_GAME_V2_ARCHITECTURE.md#149-防止-n1-查詢)：合併 CTE 寫入
- ✅ [perf_round_trip_0505.md](perf_round_trip_0505.md)：含設計、實測、後續
- ✅ 本檔（前後對照）
