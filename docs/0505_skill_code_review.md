# Code Review — 0505（round-trip 優化波）

> 審查範圍：`docs/0505_perf_round_trip.md` 設計後的實作改動
> - `src/lib/settings.ts` / `src/lib/auth.ts` / `src/lib/qr.ts` / `src/lib/db.ts` / `src/lib/error.ts` / `src/lib/score.ts` / `src/lib/supabase-browser.ts`
> - `src/app/actions/{stock,player,captain,round,admin}.ts`
> - `src/components/shared/ConfirmProvider.tsx` + 11 client component 的 `useConfirm` 替換
> - `src/app/display/board/BoardClient.tsx`（Realtime + 60s fallback）
> - `supabase/migrations/0014_transaction_tx_type_index.sql`
> - `scripts/load-test.ts` simulator 同步合併 CTE
>
> 審查時間：2026-05-05
> 審查人：Claude（subagent code-review）
> 對齊規範：`CLAUDE.md` / `docs/BOARD_GAME_V2.md` / `docs/BOARD_GAME_V2_ARCHITECTURE.md`
> 0504 review 已修補的議題不再列入；本次審查專注新引入的 round-trip 優化與配套變動。

---

## 嚴重度總覽

| 嚴重度 | 數量 | 說明 | 狀態 |
|--------|------|------|------|
| **Critical** | 0 | — | — |
| **High** | 2 | 部署相依 + 無稽核失敗的安全暴露 | ✅ 全修 |
| **Medium** | 4 | 規格漂移、CTE 邊界 / 一致性風險、設定健壯性 | ✅ 全修 |
| **Low** | 7 | 維護性、防禦性編碼、效能微調 | ✅ 全修 |
| **總計** | **13** | | **✅ 13/13 完成** |

> **修補狀態**：本批 review 13 條全部修補完成（同一 PR），TypeScript 零錯誤、load-test P1-P5 0% 錯誤、0 deadlock、一致性 100%。下方各條最末附「✅ 已修」標籤與 commit/file pointer。

---

## 🟠 High

### H1. BoardConfig 未加入 `supabase_realtime` publication — Realtime 預設不會收到任何推播

**嚴重度**：High
**檔案**：`src/app/display/board/BoardClient.tsx:53-66`、`supabase/migrations/0014_*` 沒有對應 SQL
**規範對照**：CLAUDE.md §9 / §12（< 1 秒看板更新 SLO）；ARCH §14.7

**問題**
新增 `BoardClient` 訂閱 `BoardConfig` `postgres_changes`，但 repo 沒有 migration 把 `BoardConfig` 加到 `supabase_realtime` publication。Supabase 預設只把使用者透過 Dashboard / SQL 明確 ADD TABLE 的表進 publication；新環境部署後 Realtime 訂閱會「成功」但永遠收不到事件，60 秒 fallback 變成唯一更新路徑。SLO < 1s 等於只在 staging 手動加過 publication 的環境才達標。

```ts
// BoardClient.tsx:55-62
const ch = supabase
  .channel(`board-${token.slice(0, 8)}`)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'BoardConfig', filter: 'id=eq.1' },
      reload)
  .subscribe();
```

`docs/BOARD_GAME_V2_ARCHITECTURE.md:1340-1341` 雖有手動步驟說明，但未經 migration 落地容易在 DR / 新環境遺漏。

**影響**
- 新環境部署後看板更新延遲 0–60s，違反 < 1s SLO
- 跑馬燈廣播 / 推進回合在現場觀眾體感「卡卡的」
- DR / 測試環境拉起後狀態不一致（依賴人為記得執行 ALTER PUBLICATION）

**解決方案**
新增 migration `0015_board_realtime_publication.sql`：

```sql
-- 看板靠 BoardConfig postgres_changes 推播，必須加入 supabase_realtime publication
-- 用 DO $$ BEGIN ... EXCEPTION 包，可重複執行（已加入則 skip）
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "BoardConfig";
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- BoardConfig 是單列表（id=1），REPLICA IDENTITY DEFAULT 即足
-- 若 free tier 無 PK 限制可改 FULL（這裡 PK = id 已在 0001 init）
```

**注意**：本地 Postgres（無 Supabase Realtime extension）跑此 migration 會因 publication 不存在而失敗 — 用 `IF EXISTS` 包：

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE "BoardConfig";
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
```

---

### H2. `lookupPlayerByManualId` audit 只記成功路徑，失敗 / 枚舉攻擊不留痕

**嚴重度**：High（安全暴露）
**檔案**：`src/app/actions/captain.ts:357-379`
**規範對照**：0504 review #3 + CLAUDE.md §11 紅旗「最小權限 / 稽核」

**問題**
0504 review #3 指出 `lookupPlayerByManualId` 可被惡意關主枚舉任意玩家。本次新增了 audit log（371-374 行），但**只在 `buildLookupResult` 成功後才寫**（程式註解明說「失敗已在 buildLookupResult 內 throw，不會走到這」）。攻擊腳本若批次嘗試 ID 並只觀察「找到 / 找不到」的回應 status 來推測有效 ID 區段，**所有失敗嘗試完全不留稽核**，事後無法追責。

```ts
// captain.ts:367-376（簡化）
const result = await buildLookupResult(...);  // 失敗會 throw
// 失敗根本走不到下面
await query(`INSERT INTO "Transaction" ... 'captain_manual_lookup' ...`, ...);
return ok(result);
```

**影響**
- 安全稽核盲點 — 對「枚舉攻擊」幾乎沒檢測能力
- 違反「失敗也應留痕」的 secure-by-default 原則（見 OWASP Logging Cheat Sheet）
- code review 0504 #3 的修法初衷是「事後可追」，目前只能追到成功 hit，違反設計意圖

**解決方案**
把 audit 改寫為「先寫一筆 attempt log，再驗證查詢」— 用同一個 try / catch 包：

```ts
export async function lookupPlayerByManualId(rawUserId: string, stationId: string) {
  let session: SessionPayload | null = null;
  let userId = '';
  try {
    session = await requireRole('captain');
    userId = rawUserId.trim();
    if (userId.length < 6) throw new ActionError('INVALID_INPUT', '請輸入完整玩家 ID（≥ 6 碼）');
    const result = await buildLookupResult(session.userId, userId, stationId, 'manual');
    await query(
      `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
       VALUES ($1, $2, 'captain_manual_lookup', $3)`,
      [userId, session.userId,
       JSON.stringify({ station_id: stationId, outcome: 'success' })],
    );
    return ok(result);
  } catch (err) {
    // 失敗也留痕（actor_user_id 為 captain；user_id 用 captain 自己防 FK 失敗）
    if (session && userId.length >= 6) {
      await query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $1, 'captain_manual_lookup', $2)`,
        [session.userId,
         JSON.stringify({
           station_id: stationId,
           target_user_id: userId,
           outcome: 'fail',
           code: err instanceof ActionError ? err.code : 'INTERNAL',
         })],
      ).catch(() => { /* 不擋主流程錯誤 */ });
    }
    return fail(err);
  }
}
```

附加：`restartGameCycle` 目前清掉所有 player user_id 對應的 Transaction（含此 manual_lookup audit）。為跨場次保留稽核，建議在 `DELETE FROM "Transaction" WHERE user_id IN (player...)` 加 `AND tx_type NOT IN ('captain_manual_lookup')` 例外（見 L4）。

---

## 🟡 Medium

### M1. `buyStock` CTE 對 `paid` 0-row 沒守衛 — 理論上會寫 Transaction 但無扣款

**嚴重度**：Medium
**檔案**：`src/app/actions/stock.ts:169-197`
**規範對照**：CLAUDE.md §3.2「交易紀律」、ARCH §14.9

**問題**
合併後的 CTE：

```sql
WITH paid AS ( UPDATE PlayerStats ... RETURNING money ),
     holding AS ( INSERT/UPSERT StockHolding ... RETURNING shares, avg_cost ),
     tx AS ( INSERT INTO Transaction VALUES (...) )  -- 注意：用 VALUES，不是 SELECT FROM paid
SELECT paid.money AS new_money, holding.shares, holding.avg_cost FROM paid, holding
```

`tx` 是 **VALUES 字面量**，**不依賴 paid / holding 是否有列**。當理論上 `paid` 與 `holding` 因任何原因產生 0 row（如 user_id 在 SELECT FOR UPDATE 與 CTE 之間被 admin restartGameCycle 清掉），CTE 內的 Transaction 仍會 INSERT 一筆，但實際 PlayerStats 沒扣錢、StockHolding 沒變動。

雖然外層 try / catch 會因 `r.rows[0].new_money` undefined 拋 TypeError → ROLLBACK 回滾整 tx（含 Transaction 那筆），所以實務上**不會出錯**。但這是**非顯式正確性**，依賴 PG tx 隔離才不出問題。

`scripts/load-test.ts:264-265` 的 simulator 用 `INSERT INTO Transaction ... SELECT FROM paid` 反而是更穩的寫法 — 顯式 gate 在 paid 上。

**影響**
- 可讀性 / 防禦性差 — 看 SQL 看不出「這筆 tx 是依賴 paid 必有列才正確」
- 將來如果改成多 row（例如批次買入）就會出 bug
- 與 simulator 寫法不一致 — review 時不易判斷哪個對

**解決方案**
把 `tx` CTE 也改成 SELECT FROM paid：

```sql
), tx AS (
  INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
  SELECT $1, $1, 'stock_buy', $6::jsonb FROM paid
)
```

這樣 `paid` 0-row 時 Transaction 也不會被寫，邏輯清晰且與 simulator 對齊。

---

### M2. `getMyStats` 的 cooldown 未 floor，admin 設成負值會關閉節流

**嚴重度**：Medium
**檔案**：`src/app/actions/player.ts:257-258` vs `src/app/actions/stock.ts:46`
**規範對照**：CLAUDE.md §11 紅旗「`getMyStats` / `getStockMarket` 的 manual=true 路徑沒做 server-side 60 秒節流」

**問題**
兩支 manual cooldown 互相不一致：

```ts
// stock.ts:46 — 有 floor 1 防呆
const cooldown = Math.max(1, Number(cooldownStr) || 60);

// player.ts:258 — 無 floor 防呆
const cooldown = Number(cooldownStr) || 60;
```

`Number('0') || 60 === 60`（0 是 falsy）— 所以 admin 設 `'0'` 兩邊都退到 60。但若設 `'-5'`：
- stock.ts → `Math.max(1, -5)` = 1（1 秒節流，幾乎還是有用）
- player.ts → `-5` → `make_interval(secs => -5)` → 條件 `now() - last >= -5 sec` 永遠成立 → **節流完全失效**

惡意 admin（或誤輸入）能透過 settings UI 把 player.ts 路徑變成可被 hammer。

**影響**
- 攻擊面窗 — admin 設值錯誤造成 PlayerStats 路徑被無限刷
- 玩家頁與股市頁節流行為不一致，違反「兩頁共用 cooldown」精神

**解決方案**
player.ts:258 對齊：

```ts
const cooldown = Math.max(1, Number(cooldownStr) || 60);
```

並考慮在 `setSetting` 對 `ManualRefreshCooldownSeconds` 做 server-side validation（≥ 1）。

---

### M3. 跑馬燈 marquee 守衛只對 round-event 一支生效，`publishMarquee` 仍會無條件覆寫

**嚴重度**：Medium
**檔案**：`src/app/actions/round.ts:115-122` vs `src/app/actions/admin.ts` `publishMarquee`
**規範對照**：0504 review #10 修補設計

**問題**
0504 review #10 修法只把 `tickRound` 的 round-event 覆寫加 `WHERE marquee_until <= now()` guard，**但 admin `publishMarquee` 仍直接 UPDATE 不檢查**。場景：
1. admin 上一場跑馬燈快到期前下一場 admin 又設了 5 分鐘廣告
2. 第二位 admin 在第一位廣告生效中按發送 → 直接覆寫無提示
3. 即使是同一位 admin 想「延長」舊廣告，目前 UI 也是覆寫式

實際上規格是把守衛「不被 round-event 自動秒殺」當主要訴求，admin 主動操作仍允許覆寫 — **但程式註解只 mention round-event 修補，沒說 admin 路徑刻意不擋**。

**影響**
- 修法不對稱，文件 / code 同步性差
- 將來 dev 看到 `publishMarquee` 沒守衛可能誤以為是 bug 加上同樣 guard，誤把「admin 主動發送」也擋掉

**解決方案**
A. 在 `publishMarquee` 加 inline 註解說明「主動操作允許覆寫」（最小成本）：
```ts
// 主動發送：允許覆寫舊廣告（含未到期者）— 與 tickRound round-event 自動覆寫不同
await query(`UPDATE "BoardConfig" SET marquee_text = $1, ...`)
```

B. 把 round-event 的 guard 抽成一個 helper `replaceMarqueeIfFree(client, text, ttl)`，命名清楚地反映意圖。

---

### M4. `verifyAccessToken` 的 role 白名單不擋 `name` 過長 — 信任 JWT name 欄

**嚴重度**：Medium
**檔案**：`src/lib/auth.ts:49-59`
**規範對照**：CLAUDE.md §4.1 / §4.5

**問題**
新增的白名單：

```ts
if (!VALID_ROLES.includes(decoded.role)) return null;
return { userId: decoded.userId, role: decoded.role, name: decoded.name ?? '' };
```

- `decoded.userId`：未驗 length / 字元集
- `decoded.name`：未驗 length（fallback 空字串可，但 1MB JSON 也會 pass）

若 AUTH_SECRET 不慎外洩 + 攻擊者偽造 JWT 時：
- 大量寫到 Transaction.payload 的 `actor_user_id`（無 FK 限制）
- 顯示在 admin dashboard 可能撐爆 UI

但因為簽名失敗 = `jwt.verify` throw，所以實際攻擊面只在 secret 真的外洩時。**不過**「Defense in depth」的精神是即使 secret 外洩也限制傷害。

**影響**
- Defense in depth 不完整 — JWT secret 外洩時可塞超長 name 干擾 UI / log
- code review #3 「role 白名單」做了，但 name / userId 同等需要 sanity check

**解決方案**
```ts
if (!VALID_ROLES.includes(decoded.role)) return null;
if (typeof decoded.userId !== 'string' || decoded.userId.length > 64) return null;
const name = typeof decoded.name === 'string' ? decoded.name.slice(0, 60) : '';
return { userId: decoded.userId, role: decoded.role, name };
```

或在 `lib/error.ts` 加一個 `Role` 與 `userId` 的 zod schema，同時 verify。

---

## 🟢 Low

### L1. `assertNotFrozen` 沒在 lib/auth.ts export 中說明「保留兩個原 helper 的 use case」

**嚴重度**：Low
**檔案**：`src/lib/auth.ts:172-209`

**問題**
原本 0504 design doc 說「保留 `assertNotDuringFinalScoring` / `assertNotTourMode`，因其他地方可能單獨用」。grep 結果**現有 codebase 內已無任何 caller 在用單獨版本**（PlayerHomeClient.tsx 的提及只在註解）— 兩個 helper 形同 dead code。但又不能直接刪，因為 spec 預留「將來 admin 場景可能單用」。

```ts
export async function assertNotDuringFinalScoring(client?: PoolClient): Promise<void> { ... }
export async function assertNotTourMode(client?: PoolClient): Promise<void> { ... }
export async function assertNotFrozen(client?: PoolClient): Promise<void> { ... }
```

**影響**
- 維護性 — 三個近似 helper 放在一起容易誤用（e.g., 新 dev 可能用兩個分開的 assert 就以為對了，但 round-trip 多了）
- ESLint `no-unused-exports` 等 lint 規則可能誤殺

**解決方案**
在 `assertNotDuringFinalScoring` / `assertNotTourMode` 上加 JSDoc 警告：

```ts
/**
 * @deprecated 玩家寫入 action 一律改用 assertNotFrozen（少 1 個 round-trip）。
 * 此 helper 保留供「僅檢查單一條件」的 admin / debug 場景；新 caller 請優先用 assertNotFrozen。
 */
export async function assertNotDuringFinalScoring(client?: PoolClient) { ... }
```

---

### L2. `qr.ts` `verifyQrToken` 用 `!==` 比較 HMAC，非 constant-time

**嚴重度**：Low（學術風險）
**檔案**：`src/lib/qr.ts:57`

**問題**
```ts
if (sign(payloadB64) !== sig) return null;
```

非 constant-time。理論上能用 timing attack 漸近發現有效 signature。實務上 5 分鐘 TTL + 32+ 字 secret + 網路抖動掩蓋 timing → 不可行。但既然 nonce 已加長到 16 bytes，這個邊角值得順手修。

**解決方案**
```ts
import { timingSafeEqual } from 'node:crypto';
// ...
const expected = sign(payloadB64);
const a = Buffer.from(expected);
const b = Buffer.from(sig);
if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
```

---

### L3. `db.ts` SSL fallback 沒 log warning — 部署時看不出 cert 是否生效

**嚴重度**：Low
**檔案**：`src/lib/db.ts:33-35`

**問題**
若 `SUPABASE_DB_CA_CERT` 沒設，靜默 fallback 到 `rejectUnauthorized: false`。生產環境如果 ops 忘記設 env，沒有任何告警。

```ts
} else {
  sslOpts = { rejectUnauthorized: false };
}
```

**影響**
- 部署 misconfig 不容易檢測
- 違反「fail loud」原則

**解決方案**
```ts
} else {
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[db.ts] SUPABASE_DB_CA_CERT 未設定 — SSL 走 rejectUnauthorized:false。' +
      '生產環境建議設定 cert 啟用嚴驗（見 db.ts JSDoc）'
    );
  }
  sslOpts = { rejectUnauthorized: false };
}
```

---

### L4. `restartGameCycle` 把 `captain_manual_lookup` audit 一併刪除

**嚴重度**：Low
**檔案**：`src/app/actions/admin.ts:1664-1668`

**問題**
新增 `captain_manual_lookup` 的 user_id 欄是「被查的玩家」(L373 `[userId, session.userId, ...]`)。restartGameCycle 的 cleanup `DELETE FROM Transaction WHERE user_id IN (player accounts)` 連同 audit 一併清掉，跨場次無法回溯之前場次的可疑查詢。

**影響**
- 場次重啟後安全稽核軌跡被截短
- 如要事後分析「上一場 captain X 是否枚舉異常頻率」會缺資料

**解決方案**
保留 audit 例外：

```sql
DELETE FROM "Transaction"
WHERE user_id IN (SELECT user_id FROM "Account" WHERE role = 'player')
  AND tx_type NOT IN ('captain_manual_lookup');
```

或把 audit 的 user_id 改寫為 captain 自己（actor 視角），這樣自然不會被 player cleanup 掃到。**注意**：改 user_id 會牽動歷史 query 的權屬語意，需評估。

---

### L5. `transferMoney` 對負手續費未 clamp

**嚴重度**：Low
**檔案**：`src/app/actions/player.ts:411-412`

**問題**
```ts
const feeRateRaw = Number(feeStr);
const feeRate = Number.isFinite(feeRateRaw) ? feeRateRaw : 0;
const fee = Math.floor(data.amount * feeRate);
```

只防 NaN / Infinity，不防負值。admin 若把 `TransferFeeRate` 設成 `-0.1`，玩家轉 1000 元 → fee = -100 → totalDebit = 900 → 玩家收益 100。雖然刻意能想 use case（補貼），但機制上沒設計明說。

**影響**
- 設定誤觸可能造成意外經濟影響
- 缺乏「最小防呆」

**解決方案**
```ts
const feeRate = Number.isFinite(feeRateRaw) ? Math.max(0, feeRateRaw) : 0;
```

如要保留負值補貼能力，至少在 admin UI 加明顯紅字提示。

---

### L6. `tickRound` round-event 守衛條件邏輯 — `evText` undefined 時 `evText || null` 兩種狀態無法區分

**嚴重度**：Low
**檔案**：`src/app/actions/round.ts:106-112`

**問題**
```ts
const ev = await client.query<{...}>(
  `SELECT event_text, force_liquidation_ratio FROM "StockRoundEvent" WHERE round = $1`,
  [newRound],
);
const evText = ev.rows[0]?.event_text?.trim();
const forceLiqRatio = ev.rows[0]?.force_liquidation_ratio ?? 0;
```

兩種「無事件」情境最終都讓 `evText === undefined` 與 `forceLiqRatio === 0`：
- `StockRoundEvent` 沒這個 round 的 row（沒設過）
- 有 row 但 event_text 是空字串

兩者語意一樣，不影響 gameplay。但 forced_liquidation 的 payload 寫 `'event_text', $3::text` 帶 `evText || null`（line 167），對於「有 row 但 event_text 空字串」的情況也會傳 null，玩家明細看「因『null』股票被強制售出」（如果前端不防 null）。

**影響**
- 玩家明細顯示「因 null 強制售出」UX 微小瑕疵（前端可防）

**解決方案**
- 後端：若 forceLiqRatio > 0 但無 event_text，改傳 `'回合事件'` 一類 fallback 字串
- 前端：渲染明細時 fallback 顯示「回合事件」

---

### L7. ConfirmProvider 不支援 keyboard ESC 取消 / Tab focus trap

**嚴重度**：Low（無障礙）
**檔案**：`src/components/shared/ConfirmProvider.tsx`

**問題**
新增的 ConfirmProvider 只處理 outside-click 取消（`if (e.target === e.currentTarget) close(false)`），沒有：
- ESC 按鍵關閉（無障礙基本要求）
- Focus trap（Tab 會跳出 modal 焦點到背景）
- 第一次出現時自動 focus 對話內容（autoFocus 在 confirm button，但 a11y 有時希望 dialog 本身先 focus）

**影響**
- a11y 評分低，鍵盤使用者 UX 差
- 違反 WCAG 2.1 Modal Pattern

**解決方案**
```tsx
useEffect(() => {
  if (!opts) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close(false);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [opts]);
```

Focus trap 可用 `react-focus-lock` 或自寫 simple 版（兩端 sentinel 元素）。

---

## 修正優先順序建議

1. **下個 PR**（部署 / 安全相關）：
   - **H1** 加 publication migration（< 1s SLO 達標的硬條件）
   - **H2** manual lookup 失敗也記 audit（補 0504 #3 的修法漏洞）
   - **M2** player.ts cooldown 加 `Math.max(1, ...)` floor
2. **規劃 sprint**（一致性 / 防禦性）：
   - **M1** buyStock CTE 把 `tx` gate 在 paid 上（與 simulator 對齊）
   - **M3** publishMarquee 補註解 / 抽 helper（語意對稱）
   - **M4** verifyAccessToken 加 userId / name 長度白名單
3. **有空時 / 重構**：L1–L7 維護性與 a11y

---

## 修補實作清單（同 PR 完成、2026-05-05）

| ID | 嚴重度 | 修補內容 | 檔案 |
|----|-------|---------|------|
| H1 | High | 新增 migration `0015_board_realtime_publication.sql`（含 IF EXISTS + duplicate_object 守衛） | `supabase/migrations/0015_board_realtime_publication.sql` |
| H2 | High | `lookupPlayerByManualId` 改 try/catch 雙寫 audit；失敗用 captain 自身 user_id 防 FK | `src/app/actions/captain.ts:357-394` |
| M1 | Medium | `buyStock` CTE 的 `tx` clause 從 `VALUES` 改 `SELECT FROM paid` | `src/app/actions/stock.ts:184-188` |
| M2 | Medium | `getMyStats` cooldown 加 `Math.max(1, ...)` floor | `src/app/actions/player.ts:258` |
| M3 | Medium | `publishMarquee` 上方補註解，明確「主動發送允許覆寫」與 round-event guard 不同 | `src/app/actions/admin.ts:1191-1197` |
| M4 | Medium | `verifyAccessToken` 加 `userId.length ≤ 64` + `name.slice(0, 60)` sanity check | `src/lib/auth.ts:47-72` |
| L1 | Low | `assertNotDuringFinalScoring` / `assertNotTourMode` 加 `@deprecated` JSDoc | `src/lib/auth.ts:173, 187` |
| L2 | Low | `qr.ts` HMAC 比較改 `timingSafeEqual` | `src/lib/qr.ts:60-62` |
| L3 | Low | `db.ts` SSL fallback 加 production warning | `src/lib/db.ts:33-39` |
| L4 | Low | `restartGameCycle` Transaction cleanup 加 `AND tx_type NOT IN ('captain_manual_lookup')` 例外 | `src/app/actions/admin.ts:1664-1668` |
| L5 | Low | `transferMoney` `feeRate` 加 `Math.max(0, ...)` clamp | `src/app/actions/player.ts:413` |
| L6 | Low | `forced_liquidation` event_text fallback `'回合事件'` 取代 null | `src/app/actions/round.ts:170` |
| L7 | Low | `ConfirmProvider` 加 ESC 關閉 + Tab focus trap（cancel ↔ confirm wraparound） | `src/components/shared/ConfirmProvider.tsx` |

### 驗證

- ✅ `npx tsc --noEmit -p tsconfig.json` — 0 錯誤
- ✅ `npx tsx scripts/load-test.ts` — P1-P5 全 0% 錯誤、0 deadlock、一致性 100%
  - P1 avg 3229ms / p95 5670ms / P2 avg 2890ms / p95 5342ms / P3 p95 132ms / P4 106ms / P5 58ms（與「全 bundle」水位 noise 範圍內，無 regression）

### Doc 同步

- ✅ ARCH §14.7：Realtime publication 設定改寫為「migration 自動處理」
- ✅ 本檔（嚴重度總覽 + 各條附狀態 + 本段實作清單）

## 測試補強建議

### 自動化（建議加）
1. **Negative tests**：
   - `verifyAccessToken` 對 `role: 'banana'` 應 return null（白名單）
   - `verifyAccessToken` 對 100KB `name` 應截斷或拒絕（如採 M4）
   - `getMyStats(manual=true)` `ManualRefreshCooldownSeconds = '-5'` 應**不**繞過節流
2. **CTE 邊界**：
   - 模擬 `buyStock` 的 PlayerStats UPDATE 0-row（user 突然消失）→ 確認不留下孤立 Transaction
3. **Realtime 部署檢查**：
   - 加 npm script `npm run check:realtime` 跑 SQL `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime'`，CI 警告 BoardConfig 不在內

### 手動 smoke test
1. 新環境部署後立即驗看板 Realtime（非 fallback）能 < 1s 收到 admin 推進回合的更新
2. 關主後台用錯誤 ID 連續輸入 10 次，確認 audit log 有 10 筆 `outcome: fail` 紀錄
3. ConfirmProvider modal 開啟時按 ESC 應關閉（搭配 L7 修法）

---

## 附錄：未發現問題的範圍（已抽查確認 OK）

- `assertNotFrozen` 對 BoardConfig / AppSettings 雙缺失 row 的 graceful 處理 ✅
- `setSetting(..., client)` 同 tx 內傳遞 + 自動寫稽核 ✅
- `getSettings([...], client)` 對非 active key 的 default fallback ✅
- ConfirmModal 11 個 callsite 全部使用 `async () => { if (!(await confirm(...))) return; ... }` 正確 await pattern ✅
- migration 0014 索引方向（`tx_type, created_at DESC`）對 dashboard tickHistory `ORDER BY created_at DESC LIMIT 10` query 是最佳化 ✅
- `setRoundEvent('')` / `setRoundForceLiquidation(0)` 兩段 atomic CTE 等價於原本 UPDATE + 條件 DELETE ✅
- `recomputePlayerScore` / `recomputeAllPlayerScores` 在 `tickRound` Tx2 結尾 / `triggerFinalScoring` / `rebirthPlayer` 都有觸發 ✅

---

> 本次 review 不涵蓋 lint / format / test coverage / 功能驗收測試，僅針對 round-trip 優化波次的 logic / spec compliance / security / performance 邊角。
