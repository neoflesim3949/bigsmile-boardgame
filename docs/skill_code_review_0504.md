# Code Review — 0505

> 審查範圍：最近約 15 個 commit 的所有改動（KarmaBand / 股票加乘賣出 / final_score 預存 / FinalScoreModal / 揭曉彈窗 / 看板修補 / Initial* 移除 等）
> 審查時間：2026-05-04
> 審查人：Claude（subagent code-review）
> 對齊規範：`CLAUDE.md` / `docs/BOARD_GAME_V2.md` / `docs/BOARD_GAME_V2_ARCHITECTURE.md`

---

## 嚴重度總覽

| 嚴重度 | 數量 | 說明 |
|--------|------|------|
| **Critical** | 0 | — |
| **High** | 2 | 影響使用者體驗或稽核完整性 |
| **Medium** | 4 | 違反規格 / 效能 / 安全最小權限 |
| **Low** | 7 | 維護性、防禦性編碼、註解漂移 |
| **總計** | **13** | |

---

## 🟠 High

### 1. `getMyHistory` 用 `throw new Error(...)` 而非 `ActionError`

**嚴重度**：High
**檔案**：`src/app/actions/player.ts:933`

**問題**
```ts
throw new Error('FORBIDDEN');
```
`fail()` 只專案處理 `ActionError` 與 `ZodError`；`Error` 一律被歸為 `INTERNAL_ERROR`「伺服器發生錯誤，請稍後再試」並印 `[ActionError unexpected]` 到 server console。

**影響**
- 玩家在 `ShowAllStats=false` 且未終局時點 `/history/blessing` 或 `/history/karma` → 看到「伺服器發生錯誤」而不是權限訊息，誤以為系統壞掉
- server log 充斥假錯誤，污染監控

**解決方案**
```ts
throw new ActionError('FORBIDDEN', '此指標歷史活動結束後才公開');
```

---

### 2. `tickRound` 內 UPSERT `TourMode='false'` 跳過 `setSetting` helper，無 `Transaction` 稽核

**嚴重度**：High
**檔案**：`src/app/actions/round.ts:55-58`

**問題**
```ts
if (newRound === 1) {
  await client.query(
    `INSERT INTO "AppSettings" (key, value, updated_at)
     VALUES ('TourMode', 'false', now())
     ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = now()`,
  );
}
```
直接 SQL 寫 AppSettings，跳過 `setSetting()` helper。CLAUDE.md §5 明確規範：「**禁止**直接 `from('AppSettings').select()` 跳過 helper — helper 統一處理預設值與稽核」。沒寫 `Transaction tx_type='settings_update'` 稽核 row。

**影響**
- 稽核軌跡有缺口 — admin 想知道「TourMode 何時被誰關掉」時，第一回合自動關閉的事件查不到
- 違反 CLAUDE.md §5 設定一致性原則

**解決方案**
A 方案（保留同 tx）：在 UPSERT 後手動補 INSERT：
```ts
await client.query(
  `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
   VALUES ($1, $1, 'settings_update', $2)`,
  [session.userId, JSON.stringify({ key: 'TourMode', value: 'false', auto: 'round-1-tick' })],
);
```
B 方案（refactor）：讓 `setSetting` 接 optional `client: PoolClient`，從 tx 內呼叫。

---

## 🟡 Medium

### 3. `lookupPlayerByManualId` 未驗證玩家與該關卡的關係 — 關主可枚舉任意玩家

**嚴重度**：Medium
**檔案**：`src/app/actions/captain.ts:340-354`、`buildLookupResult @ 237-297`

**問題**
`assertCaptainOfStation` 只驗 captain 是該站關主，**沒驗該玩家跟該站有關係**。配合手動輸入路徑（無 QR 在場證明），關主可以猜玩家 ID（≥ 6 碼）讀取**任意玩家**的四項數值、命格、道具庫存。雖然 ID 可能難猜（如果是 UUID 隨機），但若用 `player_001` ~ `player_500` 這種規律命名就完全暴露。

**影響**
- 隱私／資訊洩漏 — 關主可在站 A 讀取從未到訪站 A 的玩家狀態（含完整 PlayerItem 清單）
- 違反「最小權限」原則
- 規格上 captain 對 `req_item_id` 的判斷只應對「在現場」的玩家，這個路徑繞過了

**解決方案**（三選一）：
- 加 server-side rate limit：每位 captain 每分鐘最多 30 次 manual lookup
- 新增 `Transaction tx_type='captain_manual_lookup'` 稽核 log，事後可追
- 文件層面接受此風險，明確記錄到 CLAUDE.md（捷徑 trade-off）

最小修法（log）：
```ts
await query(
  `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
   VALUES ($1, $2, 'captain_manual_lookup', $3)`,
  [userId, session.userId, JSON.stringify({ station_id: stationId })],
);
```

---

### 4. 看板沒接 Supabase Realtime — 規格 SLO「< 1 秒」被破壞

**嚴重度**：Medium
**檔案**：`src/app/display/board/BoardClient.tsx:40-46`

**問題**
CLAUDE.md §9 / §12 明確規範：「看板用 Realtime 推 + 60 秒 fallback 輪詢（混合）」「看板資料更新延遲 < 1 秒（Realtime 推播）」。實際只有 60-second `setInterval`，沒有 `supabase.channel(...)` 訂閱。

**影響**
- 違反文件 SLO（< 1s → 實際最壞 60s）
- 跑馬燈廣播延遲：admin 點發送 → 觀眾 60 秒後才看到
- 推進回合延遲：admin 喊「下一回合」現場仍看舊股價

**解決方案**
```ts
useEffect(() => {
  const ch = supabase
    .channel(`board:${token}`)
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'BoardConfig', filter: 'id=eq.1' },
        () => getBoardData(token).then(r => r.ok && setData(r.data!)))
    .subscribe();
  return () => { ch.unsubscribe(); };
}, [token]);
```
保留 60s `setInterval` 當 Realtime 漏推 fallback。

---

### 5. `getStockMarket(manual=true)` 沒 server-side 節流

**嚴重度**：Medium
**檔案**：`src/app/actions/stock.ts:31-41`

**問題**
CLAUDE.md §11 紅旗：「玩家 `getMyStats` / `getStockMarket` 的 `manual=true` 路徑沒做 server-side 60 秒節流（只靠前端 disable 按鈕會被繞過）」。`getMyStats` 已正確處理 atomic UPDATE，但 `getStockMarket` 收到 `manual` 參數後只 `void manual; // 股市頁與 / 共用 cooldown 由 getMyStats 端處理`，註解說共用但實際**沒任何節流邏輯**，攻擊者直接呼叫 server action 不需先呼叫 getMyStats，cooldown 不會生效。

**影響**
- 500 人活動中惡意 client 全速 hammer `getStockMarket`，每次跑 4 個 query（Stock JOIN history、PlayerStats、AppSettings、BoardConfig），可能耗盡 PgBouncer 連線池
- 破壞 §1「玩家不輪詢」設計前提

**解決方案**（與 getMyStats 對齊）：
```ts
if (manual) {
  const upd = await query(
    `UPDATE "PlayerStats"
     SET last_manual_refresh_at = now()
     WHERE user_id = $1
       AND (last_manual_refresh_at IS NULL OR now() - last_manual_refresh_at >= make_interval(secs => $2))
     RETURNING user_id`,
    [session.userId, cooldown],
  );
  if ((upd.rowCount ?? 0) === 0) {
    throw new ActionError('REFRESH_RATE_LIMITED', `刷新冷卻中（${cooldown} 秒一次）`);
  }
}
```
共用 `last_manual_refresh_at` 兩頁互鎖（與 getMyStats 一致）。

---

### 6. `restartGameCycle` 註解與實作不一致 — `StockRoundScript / StockRoundEvent`

**嚴重度**：Medium
**檔案**：`src/app/actions/admin.ts:1614`（JSDoc）vs `1650`（實作）

**問題**
JSDoc `@1614` 在「核重置 / 清空」清單列了 `StockRoundScript / StockRoundEvent（股市回合腳本）`；但實作（`@1650`）和 CLAUDE.md §5 工具列「重置系統」段都規範**保留**這兩個表（「admin 預先設定的回合腳本不該被刪」）。code 是正確的，doc 漂移。

**影響**
- 維護性 — 未來 dev 讀 docstring 會以為 reset 會清，可能設計依賴此假設的功能
- CLAUDE.md 是 single source of truth，docstring 跟它矛盾很危險

**解決方案**
將 `admin.ts:1612-1614` 的 JSDoc 修正：把 `StockRoundScript / StockRoundEvent` 從「清空」清單刪除，移到「保留」清單。

---

## 🟢 Low

### 7. `captainSellStockWithMultiplier` 回傳物件多了 `new_money` 但 type 未列

**嚴重度**：Low
**檔案**：`src/app/actions/captain.ts:874-1051`

**問題**
declared return type（`876-884`）列了 `shares_sold / proceeds / bonus / total_money_gain / profit / blessing_penalty / remaining_shares`，實際 return（`1041-1050`）多回 `new_money: newR.rows[0].money`。TS 在物件字面值會 narrow type 但不阻止額外欄位，這個 `new_money` 對 client 是「不可見」的（type-checker 看不到）。

**影響**
- ScanClient 不能讀 `r.data!.new_money` 做 optimistic update
- 目前繞道呼叫 `fetchHoldings` 重抓全部，多一次 round-trip

**解決方案**
return type 補上 `new_money: number` 欄位。

---

### 8. SettingsClient 的 RebirthHealth 預設值與 `lib/settings.ts` 不一致

**嚴重度**：Low
**檔案**：`src/lib/settings.ts:52`（`'50'`） vs `src/app/admin/settings/SettingsClient.tsx:144`（fallback `'60'`）

**問題**
`DEFAULT_SETTINGS.RebirthHealth = '50'`；UI 在 setting key 不存在時的 fallback 寫 `'60'`。Server 端 `rebirthPlayer` 讀 `Number(sm.get('RebirthHealth') ?? 50)` → 50。新環境部署時 UI 顯示 60 但實際重生健康是 50。

**影響**
- 困惑 — admin 看到 60 但實際生效 50；要按過儲存才會一致
- 同樣 audit 建議檢查所有 `Rebirth*` / `RoundIntervalMinutes` / `BankInterestBlessingAmount` 預設值

**解決方案**
統一兩處的預設值（建議都用 `DEFAULT_SETTINGS` 的值，亦即 `?? '50'`）。

---

### 9. `transferMoney` 對 `.find()` 結果用 `!` 非空斷言

**嚴重度**：Low
**檔案**：`src/app/actions/player.ts:407`

**問題**
```ts
const me = stats.rows.find((r) => r.user_id === session.userId)!;
```
`!` 不安全 — 前面只驗了 `stats.rows.length === 2`，沒證明其中一個就是 session.user_id。

**影響**
理論性 — 實務上 `WHERE user_id = ANY(...)` 查的就是含自己的兩個 ID。但若日後改 query，`me` 可能 undefined → `assertPlayerAlive(me)` 拋 TypeError 而非 `NOT_FOUND`。

**解決方案**
```ts
const me = stats.rows.find((r) => r.user_id === session.userId);
if (!me) throw new ActionError('NOT_FOUND', '玩家資料不完整');
assertPlayerAlive(me);
```

---

### 10. 跑馬燈被 round-event 蓋掉時不檢查現有 TTL

**嚴重度**：Low
**檔案**：`src/app/actions/round.ts:115-124`

**問題**
回合事件有 `event_text` 時，`tickRound` **無條件覆寫** `BoardConfig.marquee_text` + `marquee_until = now() + 5 min`。如果 admin 之前 publishMarquee 設了個多小時的重要公告，碰到 round event 就被秒殺。

**影響**
- UX 意外 — admin 重要訊息被 5 分鐘自動到期的事件蓋掉
- 不算資料遺失（仍在 Transaction），但可見的 regression

**解決方案**
A 方案：跳過覆寫如果現有 `marquee_until` 還沒到：
```sql
UPDATE "BoardConfig"
SET marquee_text = $1, marquee_until = now() + interval '5 minutes', ...
WHERE id = 1 AND (marquee_until IS NULL OR marquee_until <= now());
```
B 方案：在 BoardConfig 加獨立 `event_marquee_text` 欄位，看板 UI 兩個跑馬燈交替顯示。

---

### 11. `Transaction` 表缺 `tx_type` 索引 — 高頻 query 全表掃描

**嚴重度**：Low
**檔案**：`src/app/actions/round.ts:178-221` + `src/app/actions/admin.ts:1666`

**問題**
500 人 × 12 round 一場活動下來會寫進 Transaction：
- karma_band_effect ~333/round × 12 ≈ 4000
- bank_interest 每筆未還貸款一筆 / round
- forced_liquidation 每股一筆
- stock_buy / stock_sell / quick_action / transfer 玩家自發

合計可達 20-30k rows / 場。`getDashboardData` 內 `WHERE tx_type = 'round_tick' ORDER BY created_at DESC LIMIT 10` 沒 `tx_type` 索引 → 走 `(user_id, created_at)` 索引 + 二次 filter，效能在大表會劣化。

**影響**
admin 重新整理 dashboard 在後期變慢；`restartGameCycle` 的清理 SQL 也慢。

**解決方案**
加 migration：
```sql
CREATE INDEX IF NOT EXISTS idx_transaction_tx_type_created
  ON "Transaction" (tx_type, created_at DESC);
```
covers dashboard tickHistory query + 各種按 tx_type 過濾的後台明細查詢。

---

### 12. `setRoundForceLiquidation(0)` + `setRoundEvent('')` 兩段非 atomic

**嚴重度**：Low
**檔案**：`src/app/actions/admin.ts:921-949`、`886-915`

**問題**
admin 把 `force_liquidation_ratio` 改回 0，會 `UPDATE` 後再 `DELETE WHERE event_text = '' AND force_liquidation_ratio = 0`。兩個 statement 中間，另一個 admin 同時 `setRoundEvent(round, 'foo')` → 第二個 DELETE 不刪（因為 event_text != ''）→ 留下 ratio=0 + text='foo' 的 row。Edge case，admin 操作頻率極低。

**影響**
資料一致性微小漂移；不影響 gameplay（ratio=0 無效果）。

**解決方案**
用 `withTx` 包兩個 statement，或合併成一條 CTE。

---

### 13. `restartGameCycle` 註解描述刪除 logic 與實作不符

**嚴重度**：Low
**檔案**：`src/app/actions/admin.ts:1660-1666`

**問題**
註解 `@1660` 說「保留 admin 操作日誌（actor='admin' 且 tx_type IN (...)）」並列出 3 個 tx_type；實作（`@1661-1664`）按 `user_id` 屬 player 角色刪所有 Transaction。這是**比註解寬**的刪除（含玩家所有 tx_type），但結果剛好等於「保留 admin 操作」（admin 的 user_id 不會在 player 名單內）。code 對，但註解誤導。

**影響**
維護性 — 將來新增 admin 端 tx_type 時，dev 可能誤以為要去調整 carve-out logic。

**解決方案**
更新註解：「刪除 user_id 屬 player 的所有 Transaction（含所有 tx_type）；admin 操作的 Transaction 因 user_id 是 admin 而被自然保留」。

---

## 修正優先順序建議

1. **下個 PR**（有實際 user-facing 影響）：
   - #1 `getMyHistory` throw ActionError（500 變成正確權限訊息）
   - #2 `tickRound` 補 settings_update 稽核（保住稽核軌跡）
2. **規劃 sprint**（規格漂移 / 安全強化）：
   - #3 manual lookup 加 log 或 rate limit
   - #4 看板接 Realtime 達標 SLO
   - #5 `getStockMarket` 補節流
   - #6 註解修正（同 commit 順手）
3. **有空時或重構時**：#7-#13 維護性與防禦性編碼

## 測試補強建議

- **Negative auth tests**：`lookupPlayerByManualId` 對非站玩家也回 200，加防禦測試
- **Refresh throttle**：`getStockMarket(true)` 連續呼叫第二次應收 `REFRESH_RATE_LIMITED`
- **History permission test**：`/history/blessing` 在 `ShowAllStats=false` 且未終局時應收 `FORBIDDEN` 而非 `INTERNAL_ERROR`

---

> 本次 review 不涵蓋 lint / format / test coverage，僅針對 logic / spec compliance / security / performance 邊角。
