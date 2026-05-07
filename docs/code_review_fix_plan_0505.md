# Code Review 修正計畫 — 整合 skill_code_review.md / skill_code_review_0504.md

> 撰寫日期：2026-05-05
> 來源：[skill_code_review.md](skill_code_review.md)（2026-05-02、19 條） + [skill_code_review_0504.md](skill_code_review_0504.md)（2026-05-04、13 條）
> 目的：把兩份報告的剩餘項統整、去重、按 bundle 編組、估時、列執行順序

## 摘要

| 來源 | 原列項 | 已修 | 仍存在 / 須驗證 |
|------|-------|------|-------------------|
| skill_code_review.md | 19（3 Critical + 13 P2 + 6 P3 - **3 已修**） | 3（drawDestiny / applyQuickAction guards / exchangeBlessing 訊息）| **16** |
| skill_code_review_0504.md | 13（2 High + 4 Medium + 7 Low） | 0 | **13** |
| **合計** | 32 | 3 | **29** |

**同主題去重後實際工作量約 25-27 項**（部分跨兩份重疊）。

## 跟近期 round-trip 優化（[perf_round_trip_0505.md](perf_round_trip_0505.md)）的關係

- ✅ **#3.5 `setSetting` audit log**：與重構後 `setSetting` 的 client 版本可順手一起加（refactor #1 在 lib/settings 加了 client 參數，setSetting 同款 add）
- ⚠️ **#3.2 `assertNotTourMode` 改用 `getSetting`**：`assertNotFrozen` 已合併兩個 assert，**這條建議被新設計取代**，但 `assertNotFrozen` 內部仍直接 SQL 查 AppSettings + BoardConfig（為了 1 round-trip 合併）。**標記為「已被新設計覆蓋，不修」**
- ⚠️ **#0504 #2 `tickRound` UPSERT TourMode 跳過 `setSetting`**：建議方案 B「讓 setSetting 接 optional client」現在可行了（perf opt 已啟動同模式），可做

## 各項當前狀態

### 來自 [skill_code_review.md](skill_code_review.md)

| ID | 內容 | 嚴重度 | 狀態 |
|----|------|-------|------|
| 3.1 | `db.ts` SSL `rejectUnauthorized: false` | 🟡 P2 | 待修 |
| 3.2 | `assertNotTourMode` 直接打 DB | 🟡 P2 | ⚠️ **被 assertNotFrozen 取代，不再修** |
| 3.3 | `getBoardData` 兩次重複查 ScoreWeight | 🟡 P2 | 待修 |
| 3.4 | `SessionPayload` role enum 沒驗證 | 🟡 P2 | 待修 |
| 3.5 | `setSetting` audit log 跳過 | 🟡 P2 | 待修（順手加 setSetting 接 client）|
| 3.6 | `transferMoney` `feeRate` 不驗 NaN | 🟡 P2 | 待修 |
| 3.7 | `tickRound` 沒驗 `assertNotDuringFinalScoring` | 🟡 P2 | **須驗證**（CLAUDE.md §11 紅旗清單已列，可能已修）|
| 3.8 | `round_tick` 沒進 `TX_TYPE_LABEL` | 🟡 P2 | 待修 |
| 3.9 | `window.confirm` 大量使用（12+ 處）| 🟡 P2 | 待修（大工程）|
| 3.10 | PlayerHomeClient 觸控目標 < 44px | 🟡 P2 | 待修 |
| 3.11 | BoardClient header 字級 < 24px | 🟡 P2 | 邊際，可延後 |
| 3.12 | 兩處 N+1（small constant N）| 🟡 P2 | 原報告判斷不值得修 |
| 3.13 | 自訂倍率 input rounding | 🟡 P2 | 待修 |
| 4.1 | `qr.ts` nonce 8 bytes | 🟢 P3 | 防禦性，可延後 |
| 4.2 | `error.ts` `isZodError` check | 🟢 P3 | 防禦性，可延後 |
| 4.3 | `boardData` LIMIT 寫死 | 🟢 P3 | 可延後 |
| 4.4 | stock `trend` 30min window 寫死 | 🟢 P3 | 可延後 |
| 4.5 | `getAdminDashboard` 兩次 settings | 🟢 P3 | 與 perf opt 同模式可順手 |
| 4.6 | admin button 缺 disabled | 🟢 P3 | 可延後 |

### 來自 [skill_code_review_0504.md](skill_code_review_0504.md)

| ID | 內容 | 嚴重度 | 狀態 |
|----|------|-------|------|
| 1 | `getMyHistory` throw `Error` 而非 `ActionError` | 🟠 High | 待修 |
| 2 | `tickRound` UPSERT TourMode 跳過 `setSetting` | 🟠 High | 待修（refactor 後 setSetting 可接 client）|
| 3 | `lookupPlayerByManualId` 玩家枚舉風險 | 🟡 Medium | 待修（建議加 log）|
| 4 | 看板沒接 Supabase Realtime — SLO 破壞 | 🟡 Medium | 待修（infra 大改）|
| 5 | `getStockMarket(manual=true)` 沒 server-side 節流 | 🟡 Medium | 待修 |
| 6 | `restartGameCycle` JSDoc 與實作不一致 | 🟡 Medium | doc fix |
| 7 | `captainSellStockWithMultiplier` return type 缺 `new_money` | 🟢 Low | 待修 |
| 8 | `RebirthHealth` UI fallback 不一致 | 🟢 Low | 待修 |
| 9 | `transferMoney` `.find()` 用 `!` 非空斷言 | 🟢 Low | 待修 |
| 10 | 跑馬燈被 round-event 無條件覆寫 | 🟢 Low | 待修 |
| 11 | `Transaction.tx_type` 缺索引 | 🟢 Low | 待修（migration）|
| 12 | `setRoundForceLiquidation(0) + setRoundEvent('')` 兩段非 atomic | 🟢 Low | 邊際，可延後 |
| 13 | `restartGameCycle` 註解描述刪除 logic 與實作不符 | 🟢 Low | doc fix |

## 7 個 Bundle 分組（按主題與風險）

### 🟢 Bundle A — Quick Wins（5 項，估時 1.5 小時，無 schema 改動）
1. **#0504 #1** `getMyHistory` throw `ActionError`（[player.ts:933](../src/app/actions/player.ts#L933)）— 5 行 diff
2. **#0504 #6** `restartGameCycle` JSDoc 修正（[admin.ts:1612-1614](../src/app/actions/admin.ts)）— doc 改正
3. **#0504 #13** `restartGameCycle` 註解 carve-out 註釋更新（[admin.ts:1660](../src/app/actions/admin.ts)）— 註解更新
4. **#0504 #8** `RebirthHealth` UI fallback 對齊 `DEFAULT_SETTINGS`（[SettingsClient.tsx:144](../src/app/admin/settings/SettingsClient.tsx#L144)）— 1 行
5. **#0504 #9** `transferMoney` `.find()` 非空斷言改 explicit 檢查（[player.ts:407](../src/app/actions/player.ts#L407)）— 4 行

### 🟢 Bundle B — Settings/Auth Hardening（4 項，估時 2 小時，依賴 perf opt 的 setSetting client refactor）
1. **#0504 #2** `tickRound` 改用 `setSetting('TourMode', 'false', client)`（[round.ts:55-58](../src/app/actions/round.ts)）— 補 setSetting 接 optional client
2. **#3.5** `setSetting` audit log 用 system actor id（[settings.ts:109-115](../src/lib/settings.ts)）— 跟 #2 一起做
3. **#3.4** `verifyAccessToken` 補 role enum 驗證（[auth.ts](../src/lib/auth.ts)）— 5 行
4. **#3.6** `transferMoney` `feeRate` 驗 NaN（[player.ts:411](../src/app/actions/player.ts#L411)）— 2 行

### 🟢 Bundle C — Spec Compliance（3 項，估時 2 小時）
1. **#0504 #5** `getStockMarket(manual=true)` 加 server-side 節流（[stock.ts:31-41](../src/app/actions/stock.ts)）— 跟 `getMyStats` 同模式 atomic UPDATE
2. **#3.7** `tickRound` 補 `assertNotDuringFinalScoring`（[round.ts:15](../src/app/actions/round.ts)）— 須先驗證是否已修；CLAUDE.md §11 紅旗已列
3. **#3.13** 自訂倍率 input rounding 用 `Math.round(v * 100) / 100`（[AdminDashboardClient.tsx](../src/app/admin/AdminDashboardClient.tsx)）— 2 行

### 🟡 Bundle D — UX/Display（4 項，估時 3 小時）
1. **#3.8** `round_tick` 加進 `TX_TYPE_LABEL`（[HistoryClient.tsx:14](../src/app/history/[type]/HistoryClient.tsx#L14)）— 1 行
2. **#3.10** PlayerHomeClient 按鈕 40px → 44px（[PlayerHomeClient.tsx](../src/app/PlayerHomeClient.tsx)）— class 換
3. **#3.11** BoardClient header 字級 → `text-2xl`（[BoardClient.tsx:163](../src/app/display/board/BoardClient.tsx)）— class 換（可選）
4. **#0504 #10** 跑馬燈被 round-event 覆寫前檢查現有 TTL（[round.ts:115-124](../src/app/actions/round.ts)）— SQL 加 WHERE 子句

### 🟡 Bundle E — Type/Return Surface（2 項，估時 1 小時）
1. **#0504 #7** `captainSellStockWithMultiplier` return type 補 `new_money: number`（[captain.ts:874-1051](../src/app/actions/captain.ts)）— type interface
2. **#3.3** `getBoardData` ScoreWeight 重複 query 合併（[board.ts:124-131 / 154-161](../src/app/actions/board.ts)）— 用既有 `getSettings([...])`

### 🟠 Bundle F — Security & Audit（2 項，估時 2.5 小時）
1. **#0504 #3** `lookupPlayerByManualId` 加 audit log（[captain.ts:340-354](../src/app/actions/captain.ts)）— INSERT Transaction
2. **#3.1** `db.ts` SSL `rejectUnauthorized: true` + 配 Supabase root cert（[db.ts:19](../src/lib/db.ts#L19)）— 需要拿 cert + 驗證部署

### 🟠 Bundle G — Big Infra（2 項，估時 4-6 小時）
1. **#0504 #4** 看板接 Supabase Realtime（[BoardClient.tsx:40-46](../src/app/display/board/BoardClient.tsx)）— 須測 Supabase Realtime quota、實機看板雙寫驗證
2. **#3.9** 抽 `<ConfirmModal>` 通用元件取代 12+ 處 `window.confirm`（admin/captain 各頁）— 大量 mechanical refactor

### 🟢 Bundle H — DB Perf（1 項，估時 0.5 小時）
1. **#0504 #11** `Transaction.tx_type + created_at` 複合索引（migration）— 加 SQL migration 檔

### 🟢 Bundle I — Defense-in-Depth（5 項，估時 1 小時，可延後）
1. **#4.1** `qr.ts` nonce 8 → 16 bytes
2. **#4.2** `error.ts` `isZodError` structural check 加深
3. **#4.5** `getAdminDashboard` 兩次 settings query 合併（用 perf opt 的 batch getSettings）
4. **#4.6** admin button disabled 狀態
5. **#0504 #12** `setRoundForceLiquidation + setRoundEvent` 包 tx 或合 CTE

### 不修
- **#3.2** `assertNotTourMode` → `getSetting`：已被 `assertNotFrozen` 設計覆蓋
- **#3.12** 兩處 small-N N+1：原報告判斷不值得修（影響 < 1s）
- **#4.3 / #4.4** 寫死 LIMIT / window：原報告判斷可延後

## 推薦執行順序（4 階段）

### Stage 1：本批 PR（quick win，約半天）
- **Bundle A**（5 項，1.5h）+ **Bundle B**（4 項，2h）= **9 項，3.5h**
- 全是 logic / settings / auth 小修，零 schema 改動
- 風險低、收益直接（高嚴重度先解）

### Stage 2：下批 PR（規格符合，約半天）
- **Bundle C**（3 項，2h）+ **Bundle D**（4 項，3h）+ **Bundle E**（2 項，1h）+ **Bundle H**（1 項，0.5h）= **10 項，6.5h**
- spec 對齊、UX 微調、DB 索引

### Stage 3：第三批 PR（安全強化，約半天）
- **Bundle F**（2 項，2.5h）= **2 項，2.5h**
- 須驗 cert 部署、audit log 對齊

### Stage 4：第四批 PR（infra 大改，約 1 天）
- **Bundle G**（2 項，4-6h）+ **Bundle I**（5 項，1h，可順手）= **7 項，5-7h**
- Realtime 與 ConfirmModal 是大工程
- Realtime 影響 Supabase quota，**需先評估 free tier WS 連線數限制**

## Doc 同步

每階段結束跟 [memory feedback_md_sync.md](../../../.claude/projects/-Users-neo-Desktop-Bigsmile-Journey--BIGSMILE-BOARDGAME/memory/feedback_md_sync.md) 規則同步：

| 改動 | 影響 doc |
|------|---------|
| Bundle B（setSetting 加 client）| CLAUDE.md §3.2（補規則）、ARCH §14.5（更新範例）|
| Bundle C（tickRound assertNotFinalScoring）| 不需改（CLAUDE.md §11 已列為紅旗）|
| Bundle D（marquee TTL 規則）| ARCH 看板段（如有專屬章節）|
| Bundle F（rebirth audit log + SSL）| safety_report.md |
| Bundle G（Realtime）| ARCH §14.7（Realtime vs 輪詢決策）— 標記改成「已實作」|
| Bundle H（tx_type index）| ARCH §14.3（索引清單）|

## 測試計畫

| Bundle | 測試 |
|--------|------|
| A | TS check + smoke：history blessing 在 ShowAllStats=false 應收 FORBIDDEN（不是 INTERNAL_ERROR）|
| B | TS check + 跑 tickRound 第 1 回合驗 Transaction 有 settings_update 稽核 |
| C | smoke：getStockMarket 連續 manual=true 應收 REFRESH_RATE_LIMITED；admin 終局結算後 tickRound 應收 FORBIDDEN |
| D | smoke：history 頁看到「系統推進回合」中文 label；按鈕 ≥ 44px |
| E | TS check：scan 頁可讀 r.data.new_money（optimistic update）|
| F | smoke：lookupPlayerByManualId 寫入 captain_manual_lookup tx；prod cert 連線確認可 SSL 嚴驗 |
| G | smoke：admin 跑馬燈 → 看板 < 1s 出現；ConfirmModal 取代後所有 destructive op 仍要 3 次確認 |
| H | migration apply + EXPLAIN ANALYZE 看 dashboard 查詢用上新索引 |
| I | TS check 即可（純 defense） |

## 風險與注意

### Bundle B 順序
依賴 perf opt 的 `setSetting` 加 optional client。**先補 settings.ts setSetting client 參數**，再做 #0504 #2 / #3.5。

### Bundle G Realtime
- 看板 quota：Supabase free tier WS 限制 ~200 並發；3 台看板 OK，但若 admin 加開 monitor 頁需評估
- 60s fallback 必保留：Realtime 有掉訊風險，CLAUDE.md §9 是「混合」設計
- 看板必測：admin 推進回合 → 看板 < 1s 顯示新股價

### Bundle F SSL cert
- Supabase 提供 root cert：[supabase docs / connection strings]
- 部署環境需配發 cert（Vercel env var or fs path）
- **回退預案**：若 prod 出 SSL 驗證失敗，先 revert 到 `rejectUnauthorized: false`，補 cert 後再上

### Bundle G ConfirmModal
- 取代 12+ 處 `window.confirm` 是大量 mechanical 改動，建議單獨 commit
- 必測：admin 各 destructive op（重置會員 / 刪股票 / 終局結算）三次確認流程

## 不在本計畫範圍

- 已被新設計取代的項目（#3.2）
- 原報告自評不值得修的項目（#3.12 / #4.3 / #4.4）
- 純為 defense in depth 沒實際 bug 的項目可選擇性做（#4.1 / #4.2）

---

> 共 25-27 項可修。Stage 1+2 約 1 天可完成大部分（17 項，含全 High 與多數 Medium）。Stage 3+4 視 Realtime 與 cert 評估後再排。
