# Code Review — 0505_1（13 條修補的回頭審查）

> 審查範圍：`docs/0505_skill_code_review.md` 列出的 13 條修補（H1, H2, M1-M4, L1-L7）
> 目的：檢查修補本身有沒有引入新問題、是否與 review 解法一致、是否完整覆蓋同類問題
>
> 審查時間：2026-05-05（同日二輪）
> 審查人：Claude（subagent code-review，第二輪）
> 對齊規範：`CLAUDE.md` / `docs/0505_skill_code_review.md` / `docs/BOARD_GAME_V2.md`

---

## 跟前輪 review 的對比（收斂判斷）

| 指標 | 0504 | 0505 | 0505_1（本輪） |
|------|------|------|---------------|
| Critical | 0 | 0 | **0** |
| High | 3 | 2 | **0** |
| Medium | 5 | 4 | **0** |
| Low | 7 | 7 | **2**（觀察事項，可選修） |
| 總計 | 15 | 13 | **2** |

**結論**：本輪屬於收斂尾聲，未發現 Critical / High / Medium 等級新問題；前輪 13 條修補實作正確、與解法一致、無新引入 bug。剩下 2 條為極低風險的維護性觀察（不影響功能 / 安全 / 效能）。**可結案進入下一波 sprint**。

> **修補狀態**：N1 + N2 兩條 Low 已於同 PR 修補完成（N1 補註解、N2 audit 包 `.catch`）。本輪結束、Code Review 系列結案。

---

## 嚴重度總覽

| 嚴重度 | 數量 | 說明 |
|--------|------|------|
| **Critical** | 0 | — |
| **High** | 0 | — |
| **Medium** | 0 | — |
| **Low** | 2 | M1 holding 未顯式 gate、H2 audit 雙寫極端邊角 |
| **總計** | **2** | 兩條皆「合理但不完美」，可選修 |

---

## 🟢 Low（觀察事項，可選修）

### N1. M1 修補只 gate `tx`，`holding` 仍是 `INSERT FROM VALUES` 不依賴 paid

**嚴重度**：Low（防禦性編碼，實務上不影響正確性）
**檔案**：`src/app/actions/stock.ts:170-191`
**對應前輪**：M1 的「顯式 gate 在 paid 上」原則

**觀察**
前輪 M1 把 `tx` clause 從 `VALUES` 改成 `SELECT FROM paid`：

```sql
tx AS (
  INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
  SELECT $1, $1, 'stock_buy', $6::jsonb FROM paid  -- ✅ 已 gate
)
```

但 `holding` clause **仍是** `INSERT ... VALUES ($1, $3, $4, $5) ON CONFLICT ...`，未從 paid SELECT。

```sql
holding AS (
  INSERT INTO "StockHolding" (user_id, stock_id, shares, avg_cost)
  VALUES ($1, $3, $4, $5)            -- ❗ 不依賴 paid
  ON CONFLICT (user_id, stock_id) DO UPDATE SET ...
  RETURNING shares, avg_cost
)
```

**影響評估**
- 理論上 paid 0-row（user 在 SELECT FOR UPDATE 與 CTE 之間消失）時，holding 仍會 INSERT/UPSERT 一筆，**但** 終端 `SELECT FROM paid, holding` 是 CROSS JOIN，paid 0-row → 0 row → `r.rows[0].new_money` undefined → throw → tx ROLLBACK 整批回滾（包括 holding 寫入）
- 因此**實務上不會留下不一致資料**；但若將來有人改 `SELECT` 末段（例如改用 LEFT JOIN 或拿掉 paid 的 SELECT），這個非顯式假設就會破功
- 與前輪 M1 review 解法的「顯式 gate」精神不完全一致 — `tx` gate 了，`holding` 沒 gate

**為何沒在第一輪指出**
PostgreSQL 的 CTE 限制：`INSERT ... SELECT FROM paid` 配上 `ON CONFLICT ... DO UPDATE` 在不同 PG 版本對 `excluded` cardinality 推導敏感（多 row source 觸發 conflict 行為複雜），所以本次保留 VALUES 寫法是合理選擇。

**解決方案（可選）**
A. 維持現狀，在 holding clause 上加註解明說「VALUES 不 gate paid，但外層 SELECT 會因 CROSS JOIN 0-row 整批 rollback，仍正確」。這是最小成本的補強。

```sql
), holding AS (
  -- 此 CTE 用 VALUES 不 gate paid（PG ON CONFLICT 對 SELECT-source cardinality 處理較複雜）
  -- paid 0-row 時靠最後 SELECT FROM paid, holding 整批 rollback 保證一致性
  INSERT INTO "StockHolding" (user_id, stock_id, shares, avg_cost)
  VALUES ($1, $3, $4, $5)
  ON CONFLICT ...
)
```

B. 若要更嚴格 gate，可將 holding 改寫成：
```sql
holding AS (
  INSERT INTO "StockHolding" (user_id, stock_id, shares, avg_cost)
  SELECT $1, $3, $4, $5 FROM paid
  ON CONFLICT (user_id, stock_id) DO UPDATE SET ...
  RETURNING shares, avg_cost
)
```
但這需要實測 PG 行為（特別是 ON CONFLICT 路徑的 cardinality），有 regression 風險，**不建議在沒有壓測對照下動**。

**建議**：採方案 A（加註解），等將來有人重構 buyStock 再評估方案 B。

---

### N2. H2 `lookupPlayerByManualId` 成功路徑 audit INSERT 失敗時，catch 會雙寫一筆 fail audit

**嚴重度**：Low（極端邊角，DB outage 中才觸發）
**檔案**：`src/app/actions/captain.ts:357-398`
**對應前輪**：H2 的「失敗也要 log」修補

**觀察**
程式流程：
1. `buildLookupResult` 成功 → 進到 audit INSERT
2. **若** audit INSERT 因 DB 暫時連線問題 throw → 進外層 catch
3. catch 內條件 `if (session && userId.length >= 6)` 成立 → **再寫一筆 fail audit**
4. 結果：成功的 lookup 在 audit 表只留 1 筆 fail（看起來像「lookup 失敗」），但實際 result 已被 builder 產生且玩家 ID / 名字其實已揭露

**影響評估**
- DB outage 中才會觸發（極小機率）
- audit 紀錄與實際 outcome 反向一次（小規模誤導，但有痕跡可追）
- 不影響功能 / 安全主路徑（lookup 本身已成功，揭露已發生 — 反而是 audit 「失敗化」可能讓事後分析者誤判，但補一筆痕反正比沒記好）

**為何沒在第一輪指出**
第一輪設計文件就提到「`.catch(() => {})` 防 audit 寫入失敗影響主流程」— 但是「成功路徑的 audit 失敗會 fall through 到 catch」這個 race 沒被精確列出。屬於 honest 的次級邊角。

**解決方案（可選）**
把成功路徑的 audit 也包 `.catch(() => {})`：

```ts
try {
  session = await requireRole('captain');
  userId = rawUserId.trim();
  if (userId.length < 6) throw new ActionError('INVALID_INPUT', '請輸入完整玩家 ID（≥ 6 碼）');
  const result = await buildLookupResult(session.userId, userId, stationId, 'manual');
  // 成功 audit 用 .catch 防止 audit 寫入失敗污染 result（避免 fall through 到外層 catch）
  await query(
    `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
     VALUES ($1, $2, 'captain_manual_lookup', $3)`,
    [userId, session.userId, JSON.stringify({ station_id: stationId, outcome: 'success' })],
  ).catch(() => { /* audit 失敗不擋成功 path */ });
  return ok(result);
} catch (err) {
  // ... 失敗 audit
}
```

或加旗標 `let auditWritten = false`，catch 內只在 `!auditWritten` 時補寫。

**建議**：採 `.catch(() => {})` 包成功 audit（最小成本），對齊失敗 path 的寬容度。

---

## ✅ 已驗證正確（無新問題）

以下 11 條修補檢視後**完全無瑕**，與 review 解法一致：

| ID | 檔案 | 確認重點 |
|----|------|---------|
| **H1** | `supabase/migrations/0015_*.sql` | `IF EXISTS` 守衛防本地 PG 跑掛、`duplicate_object` 容錯防重跑爆。完整覆蓋 review 設計。 |
| **M2** | `src/app/actions/player.ts:259` | `Math.max(1, Number(cooldownStr) \|\| 60)` 與 stock.ts:46 完全一致；admin 設 `-5` / `0` 都退 1 秒，無繞過 |
| **M3** | `src/app/actions/admin.ts:1191-1196` | 註解清楚說明「主動發送允許覆寫，與 round-event guard 不同」；未來 dev 不會誤改 |
| **M4** | `src/lib/auth.ts:47-70` | `VALID_ROLES` + `MAX_USERID_LEN=64` + `MAX_NAME_LEN=60`；`name.slice(0, 60)` 對中文（BMP 字元 1 code unit）OK，emoji 邊界微切但屬可接受 |
| **L1** | `src/lib/auth.ts:173-202` | `@deprecated` JSDoc 加在兩個 helper 上；本 repo 無 `eslint-plugin-deprecation`，**無 lint warning 影響**；grep 確認無 caller |
| **L2** | `src/lib/qr.ts:60` | `timingSafeEqual` 正確套用，含 length check 防 throw |
| **L3** | `src/lib/db.ts:34-39` | `process.env.NODE_ENV === 'production'` warning 只在 cold-pool 時印一次（pool 是 cached singleton），合理 |
| **L4** | `src/app/actions/admin.ts:1671-1675` | `tx_type NOT IN ('captain_manual_lookup')` 例外正確；雖然失敗 audit 的 user_id 是 captain（不在 player 名單內），主要保護的是「成功 audit 的 user_id = 被查玩家」 |
| **L5** | `src/app/actions/player.ts:413` | `Math.max(0, feeRateRaw)` 正確 clamp；其他 setting（`StockSellBlessingPenaltyDivisor` 已有 floor 1、`ExchangeRateMultiplier` 設計允許負值不 clamp、`QRTokenTTL` 用 `\|\| 300` fallback）**未發現同類遺漏** |
| **L6** | `src/app/actions/round.ts:169` | `evText \|\| '回合事件'` fallback 正確；payload 永遠有 string 不會出現「null」UX 瑕疵 |
| **L7** | `src/components/shared/ConfirmProvider.tsx:58-90` | ESC 關閉 + Tab/Shift+Tab focus trap 正確；dialog 永遠有兩個 button（cancel + confirm）所以 wraparound 必有效；無「單一 button」的退化情況 |

---

## 完整覆蓋同類問題的檢查（review 重點 #3）

**L5 clamp 是否漏抓其他 setting？** 已逐一檢查：

| Setting key | 用途 | clamp 狀態 | 是否需修 |
|-------------|------|-----------|---------|
| `TransferFeeRate` | 轉帳手續費率 | ✅ 本輪修：`Math.max(0, raw)` | — |
| `StockSellBlessingPenaltyDivisor` | 賣股福分扣分 divisor | ✅ stock.ts:261 已有 `Math.max(1, raw \|\| 10000)` | — |
| `ExchangeRateMultiplier` | 換匯倍率 | ❌ 不 clamp | **不修**（CLAUDE.md §5 明確允許 -50% 等負值） |
| `ManualRefreshCooldownSeconds` | 玩家手動刷新節流 | ✅ player.ts:259 + stock.ts:46 都 `Math.max(1, raw \|\| 60)` | — |
| `QRTokenTTL` | 玩家 QR token TTL | ❌ 不 clamp，靠 `\|\| 300` fallback | **不修**（負值 / 0 都退 fallback；admin 設極短值 1 秒是合法操作） |
| `BoardMarqueeMaxMinutes` | 跑馬燈 TTL 上限 | ✅ admin.ts:1202 用 `Math.max(1, Math.min(ttl, max))` | — |
| `MaxDestinyDraws` | 命格抽卡基準 | 命格抽卡 lib 內部處理 | — |

**結論**：L5 同類問題已被充分覆蓋；剩下未 clamp 的兩個（ExchangeRateMultiplier / QRTokenTTL）是設計性允許負值或有 fallback，不算遺漏。

---

## Edge Case 覆蓋（review 重點 #4）

| 條目 | Edge case | 結果 |
|------|-----------|------|
| H1 | BoardConfig 表本身不存在時 migration 會 fail？ | ✅ `IF EXISTS` 只檢查 publication，不檢查 table；但 migration 0001 已建 BoardConfig（同 prefix 順序保證），**且** PG 對「ALTER PUBLICATION ADD TABLE 不存在」會 throw 不同例外 — 0015 用 `WHEN duplicate_object THEN NULL` **只擋重複加入**，BoardConfig 不存在時會 fail-loud，這是正確行為（明顯部署錯誤應 fail）。OK |
| M1 | paid 0-row 時 holding 仍 INSERT？ | ⚠️ 是，但 CROSS JOIN 0-row 觸發 throw → ROLLBACK 全部回滾，無資料殘留。詳見 N1 |
| L7 | 單一 button 的 dialog focus trap 行為？ | ✅ 此 dialog 永遠有兩個 button（cancel + confirm 都是必要 UI），無單按鈕退化情況 |
| H2 | 短 ID（< 6 碼）失敗不寫 audit？ | ✅ 設計上正確 — 短 ID 連 DB 都沒查（純 input validation reject），不算枚舉嘗試 |
| M4 | `name.slice(0, 60)` 對中文字元截斷半字？ | ✅ 中文 BMP 字元每字 1 UTF-16 code unit，60 個 code unit = 60 字。Emoji（surrogate pair）邊界可能切到一半 → 顯示為亂碼，但屬於 attacker 自己塞的 payload，不影響合法 user。OK |
| L1 | `@deprecated` JSDoc 是否觸發 ESLint warning？ | ✅ 本 repo 無 `eslint-plugin-deprecation`，無 build / lint 影響；只在 IDE 提示。OK |
| M3 | 註解描述新行為是否準確？ | ✅ 完整說明「主動發送允許覆寫」+ 對比 round-event guard，未來 dev 不會誤加 guard |

---

## 行為等價驗證（review 重點 #5）

- ✅ M3 註解描述與實際行為一致（admin `publishMarquee` 確實無 guard，round-event 確實有 guard）
- ✅ L1 `@deprecated` 不影響任何 runtime 行為，純文件性質
- ✅ M2 player.ts:259 的 `Math.max(1, ...)` 與 stock.ts:46 數值與順序完全一致
- ✅ L7 ConfirmProvider 加 ESC + focus trap 後，原本的 outside-click 取消邏輯保留，cancel button 的 onClick 也保留 — 三條取消 path 並存無衝突

---

## 結論：可結案

### 可結案的依據

1. **嚴重度收斂**：0504 (3H/5M/7L) → 0505 (2H/4M/7L) → 本輪 (0H/0M/2L)。趨勢明確收斂
2. **無新引入 bug**：13 條修補逐條檢視，僅 2 條極端邊角觀察（N1/N2），且皆「實務上不影響正確性」
3. **完整覆蓋同類問題**：L5 clamp 不需擴大到其他 setting；M2 兩端對齊完整
4. **規範對齊**：所有修補與 CLAUDE.md / 0505 review 解法精神一致
5. **N1/N2 風險評估**：兩條都需要 DB 同時 outage 等罕見條件才觸發；採註解或 `.catch` 即可補強，不阻塞下個 sprint

### 建議下個 sprint（可選，無迫切性）

1. **N1**：在 `buyStock` CTE 的 `holding` clause 加註解說明「VALUES 不 gate paid，靠最後 CROSS JOIN 0-row 回滾保護」
2. **N2**：把 `lookupPlayerByManualId` 成功路徑 audit INSERT 包 `.catch(() => {})`，對齊失敗 path 的容錯

兩條都是 < 5 分鐘的修補，**或**乾脆當作「下次有人改這檔案時順手帶上」的 backlog 項。

### 結語

> 本輪 review 是「review 越來越乾淨」趨勢的最佳示範 — 從 0504 抓 15 條到 0505 抓 13 條，再到本輪只剩 2 條 cosmetic 觀察。code-review pipeline 收斂、可進入下一波功能開發。

---

## 附錄：本輪未發現問題的範圍（已抽查確認 OK）

- ✅ H1 migration 與 0014（tx_type index）共存無衝突，prefix 順序正確
- ✅ M4 `name.slice(0, 60)` 對 ASCII / 中文 / 日韓字元正確截斷
- ✅ L4 `restartGameCycle` 的 `tx_type NOT IN ('captain_manual_lookup')` 不影響其他 tx_type 清理（grep 確認所有 tx_type 列表，無誤殺）
- ✅ L7 ConfirmProvider 的 useEffect cleanup 正確 remove keydown listener（避免 memory leak）
- ✅ L2 `timingSafeEqual` 對 length mismatch 有預檢，不會 throw
- ✅ L3 warning 只在 prod env 印（dev / test 不噪音）
- ✅ M2 與 stock.ts 兩端 cooldown 變數命名 / 公式 / fallback 數值（60）完全一致
- ✅ L6 `evText || '回合事件'` 在 evText = `''`（空字串）/ `undefined` / `null` 三種情境都 fallback 正確（`||` 對 falsy）
