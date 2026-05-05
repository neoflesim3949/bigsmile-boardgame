# N+1 問題稽核報告 — 開運大富翁 V2

## 稽核時間軸

| 日期 | 觸發 | 結果 |
|------|------|------|
| **2026-05-02** | 全 codebase 首輪稽核 | 2 處 small-N N+1（`tickRound` 對股票、`updateAppSettings` 對 setting），都判定不值得修 |
| **2026-05-05** | round-trip 優化波 + 29 項 review fixes + 13 條 review fixes 後重稽核 | **無新增 N+1**。原 2 處 small-N 仍在（同樣不值得修） |

**結論**：**沒有真正會炸的 N+1**。所有列表撈取都用 JOIN / 嵌套 / 批次 SQL。少數技術上是 N+1 但 N 是固定 small constant（≤ 20），可忽略。

---

## 1. 稽核方法

依 CLAUDE.md §3.3 紅旗清單 grep：
- ❌ `for (const x of list) { await db.query(...) }` 對 DB call
- ❌ `Promise.all(list.map(x => db.query(...)))` 沒改批次或嵌套
- ❌ 取列表後再對每筆呼叫 `.select()` / `pool.query()`

實際執行的 grep：
```bash
grep -rn "for (const\|for (let" src/app/actions  # for loops
grep -rn "Promise.all" src/app/actions          # parallel queries
grep -rn ".rows.map\|.rows.find" src/app/actions # row iteration
grep -rn "jsonb_agg\|LATERAL\|WHERE.*ANY" src/app/actions # 正確批次模式
```

---

## 2. 🟢 沒有 N+1（已驗證）

所有列表撈取都正確使用嵌套 / 批次 / JOIN：

| 場景 | 做法 | 位置 |
|------|------|------|
| 看板撈 stocks + 60 筆歷史 | `jsonb_agg` 嵌套子查詢，一次拿 | [board.ts:84](../src/app/actions/board.ts) |
| 玩家股市撈商品 + 自己持股 | `LEFT JOIN StockHolding` 單條 | [stock.ts:42](../src/app/actions/stock.ts) |
| 轉帳鎖兩玩家 row | `WHERE user_id = ANY($1)` 一次 | [player.ts:336](../src/app/actions/player.ts) |
| applyQuickAction 撈快捷 + 關卡 + Item | `JOIN + LEFT JOIN` 單條 | [captain.ts:349](../src/app/actions/captain.ts) |
| **tickRound 利息結算（最多 500 借款合約）** | **CTE 批次**：`per_loan → agg → UPDATE PS → INSERT TX` 全在一條 SQL | [round.ts:104](../src/app/actions/round.ts) |
| 排行榜 500 玩家分數 | 單條 SELECT + JS sort（避開 PG cast 問題）| [admin.ts:1256](../src/app/actions/admin.ts) / [board.ts:120](../src/app/actions/board.ts) |
| 玩家歷史明細 | 單條 SELECT LIMIT 200 | [player.ts:752](../src/app/actions/player.ts) |
| 玩家活躍合約清單 | 單條 SELECT WHERE balance > 0 | [player.ts](../src/app/actions/player.ts)（listMyActiveLoans）|
| listMyQuickActions 含關卡名 + 道具名 | JOIN Station + Item 單條 | [captain.ts:78](../src/app/actions/captain.ts) |
| listExchangeOptionsForPlayer | CROSS JOIN PlayerStats 單條 | [player.ts:431](../src/app/actions/player.ts) |
| listBankLoanOptionsForPlayer | CROSS JOIN PlayerStats 單條 | [player.ts:535](../src/app/actions/player.ts) |
| getMyStats（settings + stats + items）| 3 條 SELECT，N=固定 3 不是 N+1 | [player.ts:228](../src/app/actions/player.ts) |
| restartGameCycle 核重置 | 9 條固定 DELETE / UPDATE，N=固定 | [admin.ts:1400](../src/app/actions/admin.ts) |

### 為什麼這幾個高風險場景沒事

1. **看板 sparkline（500 玩家 / 多檔股票）**：`jsonb_agg` 嵌套讓 PostgreSQL 在 server 端組陣列，client 拿到一坨 JSON。**不是 N+1**。
2. **tickRound 結算 500 借款利息**：原本最容易寫成「for each player → query interest → UPDATE PS」，但程式用 CTE：
   ```sql
   WITH per_loan AS (...),
        agg AS (SELECT user_id, SUM(...)),
        updated_ps AS (UPDATE ... FROM agg ...)
   INSERT INTO Transaction SELECT ... FROM per_loan JOIN updated_ps;
   ```
   **單條 SQL 完成 500 row 的計算 + UPDATE + INSERT 紀錄**。
3. **排行榜 500 玩家計分**：用 `SELECT 500 row → JS map + sort + slice 10`。1 條 query。
4. **轉帳兩玩家 FOR UPDATE**：`WHERE user_id = ANY($1::text[]) ORDER BY user_id ASC FOR UPDATE` — 一次拿兩個 row 並按字典序加鎖避免 deadlock。

---

## 3. ⚠️ 嚴格說是 N+1 但影響微小

兩處 `for...of` + `await query`，N 都是**固定 small constant**：

### 3.1 `tickRound` 對每檔股票 2 query

```ts
// src/app/actions/round.ts:60
for (const s of stocks.rows) {
  // ...計算 newPrice
  await client.query(`UPDATE "Stock" SET current_price = $1 WHERE id = $2`, [newPrice, s.id]);
  await client.query(`INSERT INTO "StockHistory" (stock_id, price) VALUES ($1, $2)`, [s.id, newPrice]);
}
```

| 評估項 | 值 |
|--------|---|
| N 上限 | **≤ 10**（CLAUDE.md §1 規格「股市 ≤ 10 檔」）|
| 觸發頻率 | 每 10 分鐘 1 次（admin 按「下一回合」） |
| 額外 round-trip | 20 次 × ~10ms = ~200ms |
| tickRound 整體耗時 | ~500ms |
| 實際瓶頸？ | **不是**，主要時間在 PgBouncer 排隊 |

**可優化方案**（N 若變大才值得）：
```sql
-- 批次 UPDATE 用 unnest 拆陣列
UPDATE "Stock" s
SET current_price = u.price
FROM unnest($1::uuid[], $2::int[]) AS u(id, price)
WHERE s.id = u.id;

-- 批次 INSERT
INSERT INTO "StockHistory" (stock_id, price)
SELECT * FROM unnest($1::uuid[], $2::int[]);
```

**Verdict**：技術上是 N+1，**N ≤ 10 不值得優化**。

### 3.2 `updateAppSettings` 對每個 setting 跑 `setSetting`

```ts
// src/app/actions/admin.ts:33
for (const [k, v] of entries) {
  await setSetting(k, String(v ?? ''), session.userId);
}
```

| 評估項 | 值 |
|--------|---|
| N 上限 | ≤ 20（settings keys 固定數量） |
| 觸發頻率 | admin 偶爾儲存設定 |
| 額外 round-trip | ~40 query（UPSERT + Transaction 稽核） |
| 實際影響 | < 1 秒 |

**Verdict**：技術上是 N+1，**N ≤ 20 不值得優化**。每筆都要寫 Transaction 稽核日誌，批次反而失去 atomic per-key 性質。

---

## 4. 🟢 純 JS reshape 不算 N+1

`admin.ts:707/712` 的 for loop 是把 SQL 結果 reshape 成 Map 結構，**沒有額外 query**：

```ts
// admin.ts listStockScripts
const cells: Record<string, StockScriptCell> = {};
for (const c of cellsR.rows) {
  cells[`${c.round}_${c.stock_id}`] = c;
}
```

純 JS 處理 SELECT 結果。✅ 不是 N+1。

---

## 5. 為什麼專案 N+1 風險低

### CLAUDE.md §3.3 規範被嚴格遵守

> **準則**：函式內的 DB 查詢次數應與資料筆數**無關**，只與「查詢類型數」有關。

從程式碼看：
- ✅ 沒有 `Promise.all(map(...query...))` pattern
- ✅ `for...of + await query` 只在 2 處，N 都是固定 small constant
- ✅ 所有列表 actions 都是單條 SELECT 或 JOIN

### 高風險場景的處理模式（都正確）

| 場景 | 用法 | 範例 |
|------|------|------|
| 一般讀取（首選） | Supabase 嵌套 / pg JOIN | `LEFT JOIN h.stock_id = s.id` |
| pg 交易內部 | 批次 IN | `WHERE id = ANY($1)` |
| 複雜聚合（sparkline、排行榜）| jsonb_agg / CTE | `jsonb_agg(...)`、CTE 多步 UPDATE+INSERT |

---

## 6. 行動清單

| 項目 | 優先 | 估時 | 收益 |
|------|------|------|------|
| **無必修** | — | — | — |
| tickRound 股票 loop 改批次 unnest | P4 | 30 分鐘 | ~200ms / 推進，N ≤ 10 收益微小 |
| updateAppSettings 改批次 UPSERT | P4 | 20 分鐘 | < 1 秒 / admin 偶爾 |

**整體 N+1 健康狀況**：✅ **健康**。

---

## 7. 維護建議

新增 server action 時自審流程（從 CLAUDE.md §3.3 §10.4）：

1. 寫完每個 action，回頭數 DB query 實際會跑幾次
2. 若答案依賴「列表筆數」→ 是 N+1，改批次
3. dev mode 加 query counter 警告：
   ```ts
   if (queryCount > 5) console.warn(`[N+1?] ${actionName} ran ${queryCount} queries`)
   ```
4. **第二輪 review**：「以 N+1 視角審視，列出每個 DB 查詢實際會跑的次數」（避免同輪寫 + 審）

---

*本報告由手動 grep + 程式分析產出，未發現需要立即修復的 N+1 問題。*
