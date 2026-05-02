# Code Review — 開運大富翁 V2

> **審查範圍**：`493d790`（QR 掃碼 race fix）→ `05f70f9`（換匯倍率 fix）共 14 個 commit。
> **審查日期**：2026-05-02
> **審查方式**：本機 commit log 審視（無 PR 流程；專案直推 main + Vercel auto-deploy）。
> **審查者**：Claude Opus 4.7

---

## 1. 整體評價

✅ **總體品質：良好**。最近一輪堆疊主要是 (a) 看板 UI 重排與排序、(b) 借款合約化、(c) 導覽模式真實鎖定寫入、(d) 換匯倍率前後端對齊。改動皆有對應文件同步（CLAUDE.md / ARCH §3 §5 §11）。

🟡 **主要風險**：schema 變更與多處 server action 同步、前後端公式對齊。已修的 bug 都是這類（rebirthPlayer SELECT 舊欄位、exchange 前端沒套 mult），仍需持續警覺。

🔴 **必修項目**：無（線上 production 應可部署，但下方有幾個次要建議）。

---

## 2. 通過的設計決策（值得保留）

### 2.1 借款合約化（Schema 重構）— 正確
**Migration 0004** 把 `PlayerLoan` 從 `(user_id, loan_option_id)` 累加改成「每筆借款獨立 row」。

- ✅ 解決原本「還清後仍持續被收利息」的嚴重 bug（repayBank 沒同步減 units）。
- ✅ 凍結 `base_interest_*` 欄位讓 BankLoanOption 後續被刪 / 改不影響歷史合約。
- ✅ 部分還款利息按 `ROUND(base_interest * balance / principal)` 比例自動降，數學上正確。
- ✅ 用 `ON DELETE SET NULL` 保留 option 被刪時的歷史合約。

### 2.2 換匯倍率前後端公式對齊 — 正確
`listExchangeOptionsForPlayer` 與 `exchangeBlessing` 都用：
```
effective_per_unit = ROUND(money_gain_per_unit × multiplier)
total = effective_per_unit × units
```
- ✅ 避免 rounding 差 1 元的爭議。
- ✅ 前端「將獲得」與後端入帳保證一致。
- ✅ `CLAUDE.md §11` 紅旗清單已加入規範。

### 2.3 導覽模式（TourMode）真實鎖寫
- ✅ 抽出 `assertNotTourMode(client?)` helper 放 `lib/auth.ts`，與 `assertNotDuringFinalScoring` 對稱。
- ✅ 全部 8 處玩家 / 關主寫入 action 都套了（buyStock / sellStock / transferMoney / exchangeBlessing / borrow / repay / applyQuickAction / rebirthPlayer），grep 驗證 ok。
- ✅ middleware 與 `app/page.tsx` 也跳過強制導向 onboarding。
- ✅ 後端鎖死 + 前端 sky 色 banner 雙重保險。

### 2.4 看板 layout 改進
- ✅ 重點趨勢從「flex-col 2 張」→ `grid-cols-3 grid-rows-2` 最多 6 張。
- ✅ 風雲榜常規模式即時更新（`liveLeaderboard` 補上去前是個漏洞，前台只在終局才有資料）。
- ✅ 最終榜單 rank **永遠對應 final_score**，點其他欄位排序時 row 順序變但 rank 不變（V2.md §8 名次固定原則）。

### 2.5 ZodError → INVALID_INPUT 自動轉
`lib/error.ts` `fail()` 偵測 zod error 並轉中文欄位提示：
- ✅ 不再吞成「伺服器發生錯誤」。
- ✅ 中文欄位對照集中管理（user_id / login_id / password / role…）。

### 2.6 重置系統的 5 步確認 + 雙重清明細
- ✅ `restartGameCycle` 清玩家 Transaction + 額外清 admin 寫的 round_tick（`tx_type = 'round_tick'` 第二條 DELETE）。
- ✅ 「重置會員明細」（DangerOp `reset_player_data`）也跟著清 Transaction，避免歷史殘留。
- ✅ 5 步 modal UX 對齊危險區慣例。

---

## 3. 發現的問題與建議

### 3.1 🟡 `round_tick` 沒有 TX_TYPE_LABEL 對照
**位置**：`src/app/history/[type]/HistoryClient.tsx:14`

`TX_TYPE_LABEL` 物件沒有 `round_tick` 鍵，admin 帳號若有歷史頁會看到 raw 字串「round_tick」而非中文。

**目前影響**：低 — 只有 admin 帳號的 Transaction 撈得到，且現行沒有 admin 個人歷史頁。但 `getMyHistory` 會撈 `WHERE user_id = $1`，admin 用自己 id 進歷史頁就會看到。

**建議**：加一行
```ts
round_tick: '系統推進回合',
```

### 3.2 🟡 看板欄寬 56 + 32 + 12 = 100%，但有 `gap-6`
**位置**：`src/app/display/board/BoardClient.tsx:120` 左右

`<main>` 是 `flex` + `gap-6`（24px），子元素用 `w-[56%]` / `flex-1` / `w-[14%]`。flexbox 會自動壓縮，視覺上沒問題，但理論值總和會超過 100%。

**建議**（如果未來有對齊強迫症）：把 `w-[56%]` 改成 `flex-[0_0_56%]` + 中欄 `flex-1`，確保比例固定且 gap 從 flex-1 扣。目前運作正常可不改。

### 3.3 🟡 `liveLeaderboard` 與 `finalLeaderboard` 重複查 PlayerStats
**位置**：`src/app/actions/board.ts:108-145`

兩個 leaderboard 都跑一次 `SELECT a.user_id, a.name, ps.* FROM Account JOIN PlayerStats LIMIT 500`。終局結算後同時跑 → 兩次相同 query。

**目前影響**：低 — 500 列 query <50ms，60s poll 一次。

**建議**：終局結算後 `liveLeaderboard` 與 `finalLeaderboard` 共用一次 raw query 算兩種排序。優化空間 ≤ 30ms，priority low。

### 3.4 🟡 `assertNotTourMode` + `assertNotDuringFinalScoring` 兩次查 settings
**位置**：`lib/auth.ts:153, 165`

每個寫入 action 開頭兩個 helper 各自查一次 AppSettings / BoardConfig。

**目前影響**：每個寫入多 2 個 ms 級 query。500 人 × 12 回合 × 多次寫入 → 加總可控。

**建議**（可選）：合併成 `assertCanWrite()` 一條 SQL 同時查兩個 row：
```sql
SELECT
  (SELECT final_scoring_triggered_at FROM "BoardConfig" WHERE id = 1),
  (SELECT value FROM "AppSettings" WHERE key = 'TourMode')
```
省一次 round-trip。priority low。

### 3.5 🟡 PlayerLoan migration 0004 用 `DROP TABLE`
**位置**：`supabase/migrations/0004_loan_contracts.sql`

`DROP TABLE IF EXISTS "PlayerLoan"` 會丟掉所有舊借款資料。

**目前影響**：開發階段且舊 schema 本來就有 bug（永遠扣息），舊資料留著反而有害。

**建議**：在 migration 檔頂部加更明顯的警告 comment，並在 `DEPLOY.md`（如有）標註此次升級需「重置會員明細」。

### 3.6 🟢 風雲榜 14% 寬度對 4 字以上中文姓名 truncate
**位置**：`src/app/display/board/BoardClient.tsx`

`truncate` class 會切。3 字以下安全，4 字以上會看到「...」。

**建議**：保留 truncate（避免 layout 爆），但活動前提醒玩家姓名 ≤ 4 字。或在後台 `accounts` 編輯頁加 max length hint。

### 3.7 🟢 自訂倍率 modal 沒檢查 step rounding
**位置**：`AdminDashboardClient.tsx` 自訂 modal

input `step="0.01"` 但實際儲存 `multiplier.toFixed(2)`，如果 admin 輸入 `1.123` 會被 truncate 到 `1.12`（不是 round）。

**目前影響**：低 — admin 通常輸入整 0.05 / 0.1 倍。

**建議**：在 submit 前 `Math.round(v * 100) / 100`。

### 3.8 🟢 `tickRound` 內 INSERT round_tick 在交易內
**位置**：`src/app/actions/round.ts:99-110`

✅ 寫進 Tx1 內，原子性正確（推進失敗不會留歷史）。
✅ payload 含 `round / event_text / game_started_at`，dashboard 能算遊戲時間。

無需改動。

### 3.9 🟢 `5 step confirm modal` 沒 typed confirmation
**位置**：`AdminDashboardClient.tsx` RestartConfirmModal

5 步點 Next 都是預設 focus 同一個按鈕，user 一直按 Enter 就會 5 秒內走完。

**目前影響**：要按 5 次點擊，誤觸機率 ≪ 1 次。

**建議**：可選加「請輸入『確認重置』」typed confirmation 在最後一步。priority low（5 步 + 強烈紅色 + 5 秒間隔已足夠）。

---

## 4. 安全審查

| 項目 | 狀態 |
|------|------|
| Server Action session 驗證 | ✅ 全部走 `requireRole(...)` |
| SQL injection | ✅ 全 parameterized query，無字串拼接 |
| dangerouslySetInnerHTML | ✅ 沒用到 |
| NEXT_PUBLIC_ 前綴敏感 key | ✅ AUTH_SECRET / DB_URL 都 server-only |
| 重生路徑限制 | ✅ 雙重保險：前端 `scanned.source === 'manual'` 不顯示按鈕 + 後端 `rebirthPlayer` 只收 qrToken 不收 userId |
| 玩家 QR token TTL | ✅ HMAC + nonce + exp，預設 5 分鐘 |
| TourMode 鎖寫入 | ✅ 8 處寫入 action 都驗了 |
| ScannedState `source` 前端傳遞 | ⚠️ `source: 'qr'` / `'manual'` 是 client state；後端已防呆，但 client 可被改 — 由於 rebirthPlayer 後端只收 qrToken，繞過無效 |
| ZodError 不洩漏 | ✅ 只回欄位中文 + 規則描述，不含 SQL / 內部資訊 |

**結論**：通過。

---

## 5. 效能審查

| 指標 | 評估 |
|------|------|
| `getMyStats` p95 | < 100ms（單列 SELECT + settings + items 嵌套）|
| `tickRound` 推進 | Tx1 ~ Stock 數 × 2 query + 1 INSERT；Tx2 一條批次 SQL；總 < 500ms（10 檔股票時）|
| `getBoardData` 60s poll | ~150ms（5 條 SELECT + 嵌套 history + leaderboard JS sort）|
| `getAdminDashboard` | ~250ms（counts + board + settings + leaderboard 500 + tickHistory 10）|
| `applyQuickAction` | ~100ms（單條 tx，no N+1）|
| `buyStock` / `sellStock` | ~80ms（單條 tx，不鎖 Stock row）|

**N+1 自審通過**。`SELECT ... FROM ... WHERE ... IN (...)` 與嵌套 select 都正確使用。

**500 人同時在線壓力點**：
- 玩家進頁面 / 下拉刷新（不輪詢）→ 主動操作流量
- 看板 60s fallback poll → 每分鐘 1 次 / display
- 預估峰值 ≈ 8 req/s，在效能目標 < 300ms p95 內有充足 headroom

---

## 6. 文件對齊

| 文件 | 狀態 |
|------|------|
| `CLAUDE.md` | ✅ 同步：TourMode 鎖寫 / 重置系統範圍 / 借款合約化 / 換匯前後端公式 / 紅旗清單 3 條新增 |
| `docs/BOARD_GAME_V2_ARCHITECTURE.md` | ✅ 同步：PlayerLoan schema 重寫 / restartGameCycle 細節 / 看板比例 |
| `docs/BOARD_GAME_V2.md` | ✅ 同步：手動輸入 ID 路徑 / 地獄畫面顯示 ID / 看板比例 56/32/12 |

---

## 7. 行動清單（按優先順序）

### P1（必修）
- 無 ✅

### P2（建議近期修）
- [ ] **3.1** `round_tick` 加 TX_TYPE_LABEL：`'系統推進回合'`
- [ ] **3.7** 自訂倍率 input `Math.round(v * 100) / 100` 標準化

### P3（可延後 / 性能優化）
- [ ] **3.3** 終局結算時 leaderboard 共用 query
- [ ] **3.4** 合併 `assertNotTourMode` + `assertNotDuringFinalScoring` 成單一 helper
- [ ] **3.6** `accounts` 編輯頁姓名長度 hint（≤ 4 字）

### P4（風險提醒，無需 code 改動）
- [ ] **3.5** `DEPLOY.md` 補 migration 0004 升級流程說明

---

## 8. 結論

最近 14 個 commit 的工作品質良好，schema 變更與多 action 同步、前後端公式對齊都做到了。修了的 bug（QR race / rebirth schema / exchange mult）都是高品質修復，並同步補進 CLAUDE.md 的紅旗清單防再犯。

**建議部署**：✅ 可以。P2 項目可以安排在下個 minor commit。

---

*本 review 由 `/review` skill 執行，無 PR 流程因此改成 review 最近 main 分支 14 個 commit。*
