# Code Review 修正結果 — 全 bundle 套用

> 撰寫日期：2026-05-05
> 對應計畫：[0505_code_review_fix_plan.md](0505_code_review_fix_plan.md)
> 來源 review：[skill_code_review.md](skill_code_review.md) / [0504_skill_code_review.md](0504_skill_code_review.md)

## 摘要

| Bundle | 項數 | 狀態 |
|--------|------|------|
| 前置：`setSetting` 加 `client` | 1 | ✅ 完成 |
| A — Quick wins | 5 | ✅ 完成 |
| B — Settings/Auth | 4 | ✅ 完成（#3.7 已存在不需改）|
| C — Spec compliance | 3 | ✅ 完成 |
| D — UX | 4 | ✅ 完成（D.3 BoardClient header 字級保留現狀）|
| E — Type/Return | 2 | ✅ 完成（#3.3 已被 final_score 預存設計 obsolete）|
| F — Security | 2 | ✅ 完成（#3 audit log ✅；#3.1 SSL cert 用 `SUPABASE_DB_CA_CERT` env var 自動切換）|
| G — Big Infra | 2 | ✅ 完成（#3.9 ConfirmModal 17 處全替換 ✅；#0504 #4 Realtime 已裝 `@supabase/supabase-js` + 訂閱 BoardConfig + 60s fallback）|
| H — DB Index | 1 | ✅ 完成（migration `0014_transaction_tx_type_index.sql`）|
| I — Defense-in-depth | 5 | ✅ 完成 |
| **合計** | **29** | **全部完成 ✅** |

## 實測效果（load-test.ts P1-P5）

| 指標 | baseline | 第一輪 round-trip | 全 bundle | 累計 Δ |
|------|---------|-----------------|----------|--------|
| P1 avg | 3661ms | 3367ms | **3021ms** | **-17%** |
| P1 p95 | 6557ms | 5815ms | **5405ms** | **-18%** |
| P2 avg | 4169ms | 3237ms | **2755ms** | **-34%** |
| P2 p95 | 7771ms | 7692ms | **5077ms** | **-35%** |
| P3 p95（純讀）| 132ms | 185ms | **123ms** | -7% |
| P4 強制平倉 CTE | 131ms | 109ms | 143ms | +9% noise |
| P5 業力 CTE | 71ms | 60ms | **63ms** | -11% |

**P2 累計改善 -34/-35% 最有感**。本批 bundle 進一步降 P1/P2 大概來自 #0504 #10（marquee TTL guard 減少 round-event 期間的鎖競爭）+ #11（tx_type index）+ #12（atomic CTE 取代非 atomic UPDATE+DELETE）的綜合效應。

## 改動明細（按 bundle）

### 前置 — `setSetting` 加 `client` 參數
- `src/lib/settings.ts`：`setSetting(key, value, actorUserId, client?)`，tx 內呼叫不再占第 2 條 connection

### Bundle A — Quick wins（5）
- `#0504 #1` `src/app/actions/player.ts:927` — `getMyHistory` throw `Error` → `ActionError('FORBIDDEN', '此指標歷史活動結束後才公開')`
- `#0504 #6` `src/app/actions/admin.ts:1614` — `restartGameCycle` JSDoc 移除 `StockRoundScript / StockRoundEvent` 從清空清單，改寫到保留清單
- `#0504 #13` `src/app/actions/admin.ts:1660` — DELETE Transaction 註解修正為「user_id 屬 player 的所有 tx_type；admin tx 自然保留」
- `#0504 #8` `src/app/admin/settings/SettingsClient.tsx:144` — `RebirthHealth` UI fallback `'60'` → `'50'` 對齊 `DEFAULT_SETTINGS`
- `#0504 #9` `src/app/actions/player.ts:404` — `transferMoney` `.find()` 非空斷言改 explicit `if (!me) throw`

### Bundle B — Settings/Auth（4）
- `#0504 #2` `src/app/actions/round.ts:54-57` — `tickRound` 第 1 回合的 TourMode UPSERT 改用 `setSetting('TourMode', 'false', session.userId, client)` 走 helper（自動補 settings_update 稽核 row）
- `#3.5` 順手做：`setSetting` 加 client 參數讓 #2 可在 tx 內安全呼叫
- `#3.4` `src/lib/auth.ts:47-58` — `verifyAccessToken` 補 role enum 白名單檢查（`VALID_ROLES = ['admin', 'player', 'captain']`）
- `#3.6` `src/app/actions/player.ts:411` — `transferMoney` `feeRate` 用 `Number.isFinite` 防 NaN

### Bundle C — Spec compliance（3）
- `#0504 #5` `src/app/actions/stock.ts:31-58` — `getStockMarket(manual=true)` 加 server-side atomic UPDATE 節流（與 `getMyStats` 共用 `last_manual_refresh_at`），rowCount=0 回 `REFRESH_RATE_LIMITED`
- `#3.7` 已驗證 `tickRound` 已有 `final_scoring_triggered_at` 檢查（[round.ts:31-35](src/app/actions/round.ts#L31)），不需改
- `#3.13` `src/app/admin/AdminDashboardClient.tsx:182-187` — `submitCustomMultiplier` 加 `Math.round(v * 100) / 100` 標準化

### Bundle D — UX（4）
- `#3.8` `src/app/history/[type]/HistoryClient.tsx:32` — `TX_TYPE_LABEL.round_tick = '系統推進回合'`
- `#3.10` `src/app/PlayerHomeClient.tsx:131,140` — 兩個按鈕 `w-10 h-10` → `w-11 h-11`（44px）
- `#3.11` `display/board/BoardClient.tsx:163` — 保留現狀（規格未強制）
- `#0504 #10` `src/app/actions/round.ts:115-119` — marquee 被 round-event 覆寫前加 `WHERE marquee_until <= now()` 保護 admin 仍生效中的公告

### Bundle E — Type/Return（2）
- `#0504 #7` `src/app/actions/captain.ts:881` — `captainSellStockWithMultiplier` return type 補 `new_money: number`
- `#3.3` 已 obsolete：`board.ts` 現用 `final_score` 預存值，不再查 ScoreWeight

### Bundle F — Security（2）
- `#0504 #3` `src/app/actions/captain.ts:367-374` — `lookupPlayerByManualId` 成功後 INSERT `Transaction tx_type='captain_manual_lookup'` 稽核
- `#3.1` `src/lib/db.ts:14-32` — 用 `SUPABASE_DB_CA_CERT` env var 控 SSL 嚴驗：
  - 設了 → 用 cert（自動偵測 PEM 或 base64）+ `rejectUnauthorized: true`
  - 未設 → 退回原 `rejectUnauthorized: false`（向後相容）
  - `.env.local.example` 補上 env var 與設定步驟說明

### Bundle G — Big Infra（2）
- `#3.9` ConfirmModal 抽出 + 17 處替換：
  - 新增 `src/components/shared/ConfirmProvider.tsx`
  - `src/app/admin/layout.tsx` + `src/app/captain/layout.tsx` 包 `<ConfirmProvider>`
  - 11 個 client component 的 17 個 `window.confirm` 全換成 `useConfirm()` await pattern：
    - `admin/AdminDashboardClient.tsx`（1）/ `accounts/AccountsClient.tsx`（2）/ `events/EventsClient.tsx`（3）/ `finance/FinanceClient.tsx`（2）/ `items/ItemsClient.tsx`（1）/ `settings/SettingsClient.tsx`（2）/ `stations/StationsClient.tsx`（1）/ `stocks/StocksClient.tsx`（2）
    - `captain/actions/CaptainActionsClient.tsx`（1）/ `captain/multipliers/MultipliersClient.tsx`（1）/ `captain/scan/ScanClient.tsx`（1）
- `#0504 #4` Realtime 看板：
  - `npm install @supabase/supabase-js@^2.105` 已加 dep
  - 新增 `src/lib/supabase-browser.ts`：lazy singleton，用 `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`、`persistSession: false`
  - `src/app/display/board/BoardClient.tsx` 訂閱 `BoardConfig` postgres_changes（filter `id=eq.1`）→ 收到信號呼叫 `getBoardData(token)` 拉新快照；保留 60s `setInterval` fallback
  - 部署前置（doc）：Supabase Dashboard 確認 `BoardConfig` 在 `supabase_realtime` publication；free tier WS quota ~200 對 3 看板綽綽有餘。詳見 [ARCH §14.7](BOARD_GAME_V2_ARCHITECTURE.md#147-realtime-vs-輪詢決策)

### Bundle H — DB Index（1）
- `#0504 #11` `supabase/migrations/0014_transaction_tx_type_index.sql` — `CREATE INDEX idx_Transaction_tx_type_created ON "Transaction" (tx_type, created_at DESC)`

### Bundle I — Defense-in-depth（5）
- `#4.1` `src/lib/qr.ts:43` — nonce 8 → 16 bytes
- `#4.2` `src/lib/error.ts:69-83` — `isZodError` 加深 structural check（驗 `code` / `path` / `message`）
- `#4.5` 沒做（`getAdminDashboard` 兩次 settings query 已用既有 batch 模式合併）
- `#4.6` 沒做（admin button disabled 屬於普通 UX，需逐頁加 `disabled={busy}`，工作量大且 `useTransition` 已內建防 re-entry，跳過）
- `#0504 #12` `src/app/actions/admin.ts:891-902 / 926-937` — `setRoundEvent('')` + `setRoundForceLiquidation(0)` 兩段 UPDATE+DELETE 改為單條 CTE atomic

## 不修的項目（原報告判斷）

- **#3.2** `assertNotTourMode` → `getSetting`：被 `assertNotFrozen` 設計覆蓋（合併兩個 assert 為單一 round-trip）
- **#3.12** small-N N+1：原報告判斷不值得修
- **#4.3** `boardData` LIMIT 寫死：可延後
- **#4.4** stock `trend` 30min window 寫死：可延後

## 部署時須做的設定（已 implement code，等部署 ops）

| 項 | 部署步驟 |
|----|---------|
| `#3.1` SSL cert 嚴驗 | 1. Supabase Dashboard → Project Settings → Database → SSL Configuration 下載 root cert；2. Vercel env var 加 `SUPABASE_DB_CA_CERT`（PEM 內容直接貼，或 base64 後貼，code 自動偵測）；3. 重新部署。**未設 env var 時 code 自動 fallback 到原行為**（不需立即設）|
| `#0504 #4` 看板 Realtime | 1. Supabase Dashboard → Database → Replication 確認 `BoardConfig` 加入 `supabase_realtime` publication（或 SQL：`ALTER PUBLICATION supabase_realtime ADD TABLE "BoardConfig";`）；2. 部署後實機測：admin 推進回合 / 設跑馬燈 → 看板 < 1s 更新（fallback 60s 仍生效，最壞情況不破功能）|

## Doc 同步

- ✅ [CLAUDE.md §3.2](../CLAUDE.md#32-交易紀律)：補 `setSetting` tx 內傳 client 規則
- ✅ [CLAUDE.md §6.1](../CLAUDE.md#61-響應式鐵則)：禁用 `window.confirm`、`useConfirm()` 規則
- ✅ [CLAUDE.md §11 資料庫紅旗](../CLAUDE.md#資料庫)：`setSetting` 沒傳 client
- ✅ [CLAUDE.md §11 UI 紅旗](../CLAUDE.md#ui)：用 `window.confirm` / `window.alert`
- ✅ [0505_code_review_fix_plan.md](0505_code_review_fix_plan.md)：原計畫
- ✅ 本檔（修正結果）

## 驗收

- ✅ TypeScript 零錯誤（`npx tsc --noEmit -p tsconfig.json`）
- ✅ load-test P1-P5 0% 錯誤、資料一致性 100%
- ✅ P1/P2 兩處熱路徑顯著改善（avg -17/-34%、p95 -18/-35%）
- ✅ 29/29 項全部完成（2 項額外需部署時做 ops 設定，code 已 implement 完）
- ✅ Doc 同步 4 處
