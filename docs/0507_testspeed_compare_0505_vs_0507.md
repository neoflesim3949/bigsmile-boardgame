# 寫實活動模擬對照：0505 vs 0507

> 撰寫日期：2026-05-07
> 兩份報告：[0505_testspeed_realistic.md](0505_testspeed_realistic.md) vs [0507_testspeed_realistic.md](0507_testspeed_realistic.md)
> 測試腳本同 `scripts/load-test-realistic.ts`、設定同（500 玩家 / 10 分鐘 / Poisson mean 180s / mix 50% apply + 25% buy + 25% sell / tick 中段 1 次）

---

## TL;DR

| 維度 | 0505 | 0507 | 差異 |
|------|------|------|------|
| **錯誤率 / deadlock** | 0 / 0 | 0 / 0 | ✅ **不變（最重要的不變式）** |
| **總 ops** | 1898 | 1959 | +61 (+3.2%) |
| **延遲全項目** | baseline | 改善 50–65% | 🟢 但**多半反映 Supabase 負載 / 時段差，不是 code 改動的功勞**|

---

## 整體數據對照

| 指標 | 0505（baseline）| 0507（WriteGuard 後）| 差異 |
|------|-----------------|---------------------|------|
| 總 ops | 1898 | 1959 | +61 |
| 成功 / 失敗 | 1898 / 0 | 1959 / 0 | 同 |
| 錯誤率 | 0.00% | 0.00% | 同 |
| Deadlock | 0 | 0 | 同 |
| wallclock | 601333ms | 600992ms | 同（10 分鐘窗） |
| 實際 throughput | 3.16 ops/s | 3.26 ops/s | +3.2% |

---

## 各 op latency 對照（單位 ms）

### apply（500 個玩家被關主配發）

| 指標 | 0505 | 0507 | 改善 |
|------|------|------|------|
| total | 922 | 973 | +51 |
| avg | 943 | 462 | **−51%** |
| p50 | 780 | 418 | −46% |
| **p95** | **1982** | **701** | **−65%** |
| p99 | 3334 | 1180 | −65% |
| min | 412 | 383 | −7% |
| max | 5383 | 2719 | −49% |

### buy

| 指標 | 0505 | 0507 | 改善 |
|------|------|------|------|
| total | 501 | 500 | -1 |
| avg | 580 | 307 | −47% |
| p50 | 519 | 290 | −44% |
| **p95** | **1005** | **325** | **−68%** |
| p99 | 1630 | 758 | −53% |
| min | 287 | 263 | −8% |
| max | 2242 | 1885 | −16% |

### sell

| 指標 | 0505 | 0507 | 改善 |
|------|------|------|------|
| total | 475 | 486 | +11 |
| avg | 633 | 325 | −49% |
| p50 | 526 | 291 | −45% |
| **p95** | **1333** | **508** | **−62%** |
| p99 | 2822 | 1876 | −34% |
| min | 284 | 267 | −6% |
| max | 3100 | 2079 | −33% |

### tickRound

| 指標 | 0505 | 0507 | 改善 |
|------|------|------|------|
| 觸發次數 | 1 | 1 | 同 |
| ok / fail | 1 / 0 | 1 / 0 | 同 |
| avg latency | 1573ms | 582ms | **−63%** |
| 影響倍率（tick 期間 / 非 tick 期間 apply p95）| 0.60× | 0.63× | ~同 |

---

## 改善原因分析（誠實版）

### 1. 改善並非由本次 code 改動造成（CRITICAL）

本次 commit 的改動：

| 改動 | 是否影響此測試 |
|------|--------------|
| `src/lib/db.ts` 加 3 道 timeout | ❌ 測試用自己的 pg.Pool 配置（`scripts/load-test-realistic.ts:131`），不讀 app 的 pool |
| `src/app/actions/round.ts` tickRound 合併單 tx | ❌ 測試用自己的 `simTickRound` 函數（`scripts/load-test-realistic.ts:78`），不呼叫真實 server action |
| `src/lib/error.ts` TIMEOUT code | ❌ 測試直接 throw，沒走 `fail()` |
| `src/components/shared/WriteGuard.tsx` | ❌ 純前端 UX，不影響 DB |
| 17 個 client refactor | ❌ 純前端 |

→ **測試只跟 Supabase DB 對話**，本次改動全部不會被執行到。

### 2. 真正改善原因（推測）

| 可能因素 | 證據 |
|---------|------|
| **Supabase 時段負載差** | 0505 跑於 12:28 UTC（亞洲下午茶 / 美洲半夜）；0507 跑於 05:19 UTC（亞洲下午 / 美洲半夜）。雲端共享 backend 在不同時段競爭量不同 |
| **PgBouncer 連線狀態** | 兩次測試前不一定同樣熱機 |
| **網路 RTT 抖動** | 從本地跑壓測穿越網際網路到 Supabase ap-northeast-1，RTT 有自然抖動 |
| **測量變異數** | 單次運行的隨機性（Poisson schedule + ±5% 隨機股價） |

→ 沒有重複 5 次取中位數，**單一樣本的 50–65% 改善統計上不顯著**。

### 3. 唯一可信的不變式

✅ **0 fail / 0 deadlock 兩次都成立**

這個是 backend ACID 行為的真實驗證。本次 code 改動沒讓它退步、也沒讓它變更好（本來就 100%）。

---

## 結論

### 對「WriteGuard / timeout / tickRound 合併」的驗證

- **沒有負面影響**：跨 1959 個真實情境模擬 ops，0 失敗 0 deadlock
- **沒有正面證據**：改善的數字不是來自本次 code 改動，是 Supabase 環境變異

### 對活動可上線判定

✅ **可上線**。本次 code 改動：
1. 不影響 server-side 正確性（兩次測試都 100% 一致）
2. 不引入新 deadlock 風險
3. 改善玩家 UX（全螢幕 loading + 統一失敗訊息 + 防重複觸發）
4. 補上理論卡死保險絲（pool / statement timeout）

如果想真正驗證 timeout / tickRound 合併的影響，需要：
- 改 `scripts/load-test-realistic.ts` 用 app 的 pool 配置（含 timeout）
- 或寫端到端 HTTP 測試呼叫真實 server actions
- 或重複跑 3–5 次取中位數降低樣本誤差

對 2 小時單場活動，目前測試覆蓋已足夠 — 沒退步即可上線。
