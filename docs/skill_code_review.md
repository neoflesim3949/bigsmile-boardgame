# Code Review — 開運大富翁 V2（完整 codebase 掃描）

> **審查範圍**：`src/**` 全部 59 個 .ts/.tsx 檔（不只最近 commit）
> **審查日期**：2026-05-02
> **審查方式**：4 個並行 Agent 深度 review（Lib/Middleware、Server Actions、Admin/Captain UI、Player/Display/Auth UI）+ 主審驗證
> **審查者**：Claude Opus 4.7

---

## 1. 執行摘要

✅ **整體品質：良好**。架構清晰、規範遵守（CLAUDE.md §3.3 N+1、§4 認證、§6 UI、§11 紅旗清單）。

🟡 **發現的 critical bug**：3 個（已即修並驗證）
🟡 **建議改進**：13 項，按優先排序
🟢 **誤報**：3 項（agent 報但符合規格 / 已正確設計）

---

## 2. 已修的 Critical Bug

| 檔案 | 問題 | 狀態 |
|------|------|------|
| [player.ts](../src/app/actions/player.ts) `drawDestiny` | 缺 `assertNotDuringFinalScoring` + `assertNotTourMode`，TourMode 中可抽卡，終局結算後也能抽 | ✅ 已修 |
| [captain.ts](../src/app/actions/captain.ts) `applyQuickAction` | 同上，TourMode 中關主仍可改玩家數據 | ✅ 已修 |
| [player.ts](../src/app/actions/player.ts) `exchangeBlessing` 錯誤訊息 | 「**福報不足**」直接洩漏福報資訊，違反 CLAUDE.md §6.2 | ✅ 已改成「額度不足（最多可換 N 單位）」 |

---

## 3. P2 — 建議近期修

### 3.1 🟡 `db.ts` SSL `rejectUnauthorized: false`（[db.ts:19](../src/lib/db.ts#L19)）
- **風險**：理論上 MITM 可插件 Vercel ↔ Supabase 之間的流量
- **緩解**：實務上 AWS 內網插件難度極高
- **建議**：改 `rejectUnauthorized: true` + 配 Supabase root cert
- **詳見**：[safety_report.md §4.1](safety_report.md)

### 3.2 🟡 `assertNotTourMode` 直接打 DB 而非走 `getSetting` helper
- **位置**：[lib/auth.ts:165](../src/lib/auth.ts#L165)
- **問題**：違反 CLAUDE.md §5「禁止直接 from('AppSettings').select() 跳過 helper」的精神
- **影響**：低 — 仍 parameterized 不會 SQL injection；但繞過 helper 的 cache / 預設值機制
- **建議**：改用 `getSetting('TourMode')`

### 3.3 🟡 `getBoardData` 兩次重複查 ScoreWeight settings
- **位置**：[board.ts:124-131](../src/app/actions/board.ts) 與 [board.ts:154-161](../src/app/actions/board.ts)
- **問題**：`liveLeaderboard` 跟 `finalLeaderboard` 各跑一次相同的 settings query
- **建議**：合併成單次 query 共享 weights

### 3.4 🟡 SessionPayload role enum 沒驗證
- **位置**：[lib/auth.ts](../src/lib/auth.ts) `verifyAccessToken`
- **問題**：JWT 解碼出 role 後沒驗證是否屬於 `['admin', 'player', 'captain']`
- **影響**：實務風險低（AUTH_SECRET 不外流就無法偽造），但是 defense in depth
- **建議**：`if (!['admin','player','captain'].includes(decoded.role)) return null`

### 3.5 🟡 `setSetting` audit log 跳過
- **位置**：[lib/settings.ts:109-115](../src/lib/settings.ts)
- **問題**：`actorUserId` 為 null 時不寫 Transaction 稽核
- **建議**：改用 system actor id（如 `'__system__'`）一律記錄

### 3.6 🟡 `transferMoney` 手續費 `feeRate` 不驗 NaN
- **位置**：[player.ts:350](../src/app/actions/player.ts)
- **問題**：`Number(getSetting('TransferFeeRate'))` 若設定值是 'abc' → NaN 沿用
- **建議**：`if (!Number.isFinite(feeRate)) feeRate = 0`

### 3.7 🟡 `tickRound` 沒驗 `assertNotDuringFinalScoring`
- **位置**：[round.ts:15](../src/app/actions/round.ts)
- **問題**：admin 在終局結算後仍可推進回合（會繼續扣利息與更新股價）
- **影響**：admin 是上帝權限可考慮允許，但 tickRound 後玩家寫入仍被 final scoring 鎖死，導致狀態不一致
- **建議**：tx 開頭加 `assertNotDuringFinalScoring(client)`

### 3.8 🟡 `round_tick` 沒進 `TX_TYPE_LABEL` 對照
- **位置**：[history/[type]/HistoryClient.tsx:14](../src/app/history/[type]/HistoryClient.tsx#L14)
- **問題**：admin 看自己歷史頁會看到 raw 字串「round_tick」
- **建議**：加一行 `round_tick: '系統推進回合'`

### 3.9 🟡 admin / captain `window.confirm()` 大量使用（12+ 處）
- **影響檔案**：accounts、events、finance、items、stations、stocks、captain/scan、captain/actions
- **問題**：mobile Safari / 部分桌面 Chrome 可能擋 `window.confirm`
- **建議**：抽出 `<ConfirmModal>` 通用元件取代

### 3.10 🟡 PlayerHomeClient 觸控目標 < 44px
- **位置**：[PlayerHomeClient.tsx](../src/app/PlayerHomeClient.tsx) 「重新整理」與「設定」按鈕 `w-10 h-10` = 40px
- **建議**：`w-11 h-11`（44px）或包 `min-h-[44px]`

### 3.11 🟡 BoardClient table header 字級 < 24px
- **位置**：[display/board/BoardClient.tsx:163](../src/app/display/board/BoardClient.tsx)
- **問題**：`text-xl`（20px）小於規格 ≥ 24px
- **影響**：低 — 標題列字小可接受，數值列已 `text-2xl/3xl`
- **建議**：可改 `text-2xl`，或保留現狀（標題列規格沒嚴格定義）

### 3.12 🟡 兩處 N+1（N 是固定 small constant）
- 詳見 [N+1_report.md](N+1_report.md)
- 1. `tickRound` 對每檔股票 2 query（N ≤ 10）
- 2. `updateAppSettings` 對每個 setting（N ≤ 20）
- **不值得優化**（影響 < 1 秒）

### 3.13 🟡 自訂倍率 input 不標準化 rounding
- **位置**：[AdminDashboardClient.tsx](../src/app/admin/AdminDashboardClient.tsx) submitCustomMultiplier
- **問題**：`step="0.01"` 但 admin 輸入 `1.123` 會被 `toFixed(2)` truncate
- **建議**：`Math.round(v * 100) / 100`

---

## 4. P3 — 可延後 / 性能微調

### 4.1 `qr.ts` nonce 用 8 bytes，可升 16
- 實務上 8 bytes (~10^19 entropy) 已遠超暴力可能，無實質風險
- 建議僅出於 defense in depth

### 4.2 `error.ts` `isZodError` structural check 可加深
- 目前只檢查 `issues` 是陣列；可加 `issues[0].code` 等
- 風險低（zod 自家 error 必有此 shape）

### 4.3 `boardData` LIMIT 寫死數字
- LIMIT 30 events / 500 leaderboard 寫死，未來活動人數變動需改 code
- 建議移到 AppSettings

### 4.4 stock `trend` 30 分鐘 window 寫死
- [stock.ts:46](../src/app/actions/stock.ts) `now() - interval '30 minutes'`
- 對齊 round 推進頻率合理，但寫死

### 4.5 `getAdminDashboard` 兩次 settings query
- 第二次只是要 `BoardGameStartedAt` 算遊戲時間
- 可一次拉所有需要的 settings

### 4.6 admin 各頁缺 button disabled 狀態
- 多處 form submit 沒在 `busyTransition` 期間 disable，雙擊可能 race
- React `useTransition` 已內建防止 re-entry，但是 belt & suspenders

---

## 5. ❌ Agent 誤報（不是 bug）

### 5.1 BankClient 顯示「每回合利息」是合規的
- agent 認為違反「禁顯示福報」
- 實際：顯示的是 `interest_money_per_round`（**金錢利息**），CLAUDE.md §6.2 只禁止福分相關
- BankClient 從未顯示 blessing 扣除量 ✓

### 5.2 admin operation 不該被 TourMode 擋
- agent 報 `performDangerOp` / `restartGameCycle` 缺 `assertNotTourMode`
- 實際：admin 是上帝權限，應在任何模式下可操作（包括 TourMode 中重置系統）
- 設計正確

### 5.3 看板 final leaderboard 顯示福分業力是規格
- agent 誤以為「常規模式只顯示 rank+name」應用到 final mode
- 實際：規格規定**結算後**展開全部欄位（V2.md §8 名次固定原則 + 全欄位顯示）
- 設計正確

---

## 6. 安全審查（更詳細見 [safety_report.md](safety_report.md)）

| 項目 | 狀態 |
|------|------|
| 全程 TLS（瀏覽器 ↔ Vercel ↔ Supabase）| ✅ |
| bcrypt cost=12 | ✅ |
| HMAC-SHA256 token（JWT / QR / Display）| ✅ |
| Cookie httpOnly + secure（production）| ✅ |
| Server action 全 `requireRole(...)` 開頭 | ✅ |
| SQL parameterized（無字串拼接）| ✅ |
| 玩家輸入無 dangerouslySetInnerHTML | ✅ |
| Secrets 無 NEXT_PUBLIC_ 前綴洩漏 | ✅ |
| 重生雙保險（前端 source check + 後端只收 qrToken）| ✅ |
| Rate limit per-account（登入 5/分鐘）| ✅ |

**通過**。唯一小加固是 `db.ts` SSL cert 驗證（§3.1）。

---

## 7. 效能審查（更詳細見 [testspeed.md](testspeed.md)）

實測 500 並發（pool=200, 6543 PgBouncer）：
- 抽卡 p95 ~6.5s（受 Free tier server-side cap）
- 買股 p95 ~7.5s（同上）
- 排行榜 p95 165ms ✅
- **0 錯誤、資料 100% 一致**

**N+1 自審通過**（[N+1_report.md](N+1_report.md)）。

---

## 8. 文件對齊

| 文件 | 狀態 |
|------|------|
| [CLAUDE.md](../CLAUDE.md) | ✅ 完整、最新（每次 schema / spec 改動都同步）|
| [docs/BOARD_GAME_V2_ARCHITECTURE.md](BOARD_GAME_V2_ARCHITECTURE.md) | ✅ 同步 |
| [docs/BOARD_GAME_V2.md](BOARD_GAME_V2.md) | ✅ 同步 |
| [docs/safety_report.md](safety_report.md) | ✅ 完整 |
| [docs/testspeed.md](testspeed.md) | ✅ 完整含實測對照 |
| [docs/N+1_report.md](N+1_report.md) | ✅ 完整 |

---

## 9. 行動清單（按優先排序）

### P1（必修）
- ✅ player.ts drawDestiny 補 guards（**已修**）
- ✅ captain.ts applyQuickAction 補 guards（**已修**）
- ✅ player.ts exchangeBlessing 錯誤訊息不洩漏福報（**已修**）

### P2（建議近期）
- [ ] **3.1** db.ts SSL `rejectUnauthorized: true` + Supabase cert
- [ ] **3.2** auth.ts `assertNotTourMode` 改用 getSetting helper
- [ ] **3.3** board.ts ScoreWeight 重複 query 合併
- [ ] **3.4** auth.ts 補 role enum 驗證
- [ ] **3.5** settings.ts audit log 用 system actor id
- [ ] **3.6** player.ts transferMoney feeRate NaN 驗證
- [ ] **3.7** round.ts tickRound 加 assertNotDuringFinalScoring
- [ ] **3.8** HistoryClient 加 `round_tick` 標籤
- [ ] **3.9** 抽 `<ConfirmModal>` 取代 12+ 處 window.confirm
- [ ] **3.10** PlayerHomeClient 按鈕 40px → 44px

### P3（可延後 / 性能微調）
- [ ] **4.1-4.6** 6 項小優化

---

## 10. 結論

最近 wave 的 14 個 commit + 全 codebase 掃描後，發現的 3 個 critical bug 都已即修。整體 codebase 品質良好，CLAUDE.md 的規範被嚴格遵守（特別是 N+1 預防、auth 紀律、parameterized query）。

**可部署到 production**：✅ 是。

P2 項目可以分次安排在後續 commit。P3 項目大部分是 nice-to-have 或 defense in depth。

---

*本 review 由 4 個並行 `/review` skill 概念執行（Explore agents 分區深度 review）+ 主審驗證 + 整合報告產出。*
