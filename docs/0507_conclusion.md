# 外部 review 4 條批評檢核 + 修補結論

> 撰寫日期：2026-05-07
> 起因：外部 reviewer 對本專案 / 0507 修補 / 壓測結論提出 4 條批評
> 範圍：逐項驗證、給判斷、列修補方案
> 對應前文：[0507_problem.md](0507_problem.md)、[0507_validation.md](0507_validation.md)（含 §6「AI 測試會騙人嗎」）

---

## 摘要

| # | reviewer 批評 | 驗證結果 | 該不該修 |
|---|--------------|---------|---------|
| 1 | tickRound 兩步驟縫隙 → 還款利息算錯 | ❌ **過時**（已合併單 tx）| 不需 |
| 2 | 壓測 pool=50 vs 生產 pool=10「車道不一致」 | 🟡 **核心對、力道沒原本說得那麼大**（DB-side 真實、client-side 不真實；Vercel 多 instance 會補上差距）| **必修** |
| 3 | db.ts 沒檢查 PgBouncer 6543（CLAUDE.md §12 自己違反）| ✅ **批評正確** | **必修**（廉價）|
| 4 | round.ts for-loop with await（§3.3 紅旗自己違反）| ✅ **形式違反** | 可選（N ≤ 10 影響有限）|

→ 4 條中 3 條為真。reviewer 批評力道精準。0505_testspeed.md 結論「對 ≤500 人放心上線」**需修正**，宣稱失真。

---

## §1 風險 4 — tickRound 兩步驟縫隙

### 1.1 reviewer 原文重點

> 系統在「推進回合」這個動作裡分成兩個步驟（先動股價、再算利息）。如果玩家剛好在這兩步中間的縫隙還款，系統會算成「玩家還沒還，繼續扣利息」或反過來。
> 嚴重度：🟡 中等。
> 修補成本：中（半天到一天）。

### 1.2 驗證

[`src/app/actions/round.ts:25-243`](../src/app/actions/round.ts#L25-L243)：

```ts
// ─── 單一 tx：股價 + 回合計數 + 強制平倉 + 業力 + 利息結算 + 重算分數 ───
const result = await withTx(async (client) => {
  // ... 全部寫入在一個 BEGIN/COMMIT 內
});
```

### 1.3 判斷：❌ 過時

[commit 7f84f4b](https://github.com/neoflesim3949/bigsmile-boardgame/commit/7f84f4b) 已將 tickRound 從原本拆兩 tx 合併成 **單一 `withTx`**。合併後 PG 邏輯硬性保證 atomic — 「兩步中間還款」的縫隙物理上不可能存在。

reviewer 看到的是 commit 7f84f4b **之前**的 code 狀態。建議告知對方此 commit 後可重新審視。

---

## §2 風險 2 / 壓測誤導 — pool=50 vs pool=10「車道不一致」

### 2.1 reviewer 原文重點

> 壓測腳本用 `max=50` 的連線池跑出「500 人 OK」的結論。但**正式上線的 app 用 `max=10`，是兩個不同的池**。
> 對外（包括 testspeed_0505.md 自己的結論）寫「對 ≤500 人放心上線」 — **這個宣稱只在壓測腳本的環境成立**。如果主辦方根據這個結論決策，會拿到失真的安全感。

### 2.2 驗證

```
src/lib/db.ts:45                  → max: 10   ← 生產 app（per Vercel instance）
scripts/load-test-realistic.ts:42 → POOL = 50 ← 壓測（單一 Node process）
scripts/load-test-hot-path.ts     → POOL = 50 ← 壓測（單一 Node process）
```

**事實成立**：兩邊 pool 設定不同。但「壓測 4 線道、生產 2 線道」這個比喻 **過度簡化**，需更精細區分。

### 2.3 判斷：✅ 批評核心正確、但力道沒原本說的那麼大

#### 「真實環境」分兩層拆解

| 層 | 0507 realistic 測試 | 實際生產 | 是否相同 |
|---|---|---|---|
| **DB side**（Supabase / PgBouncer / 資料表 / 網路 RTT）| 連 production Supabase | 連 production Supabase | ✅ **完全相同** |
| **Client side**（誰打 DB、怎麼管理連線）| 1 個 Node process、`pool max=50` | Vercel functions × N instances、各自 `pool max=10` | ⚠️ **不同** |

#### 為什麼「車道不一致」過度簡化

**測試端**：1 個 Node process × pool=50 → 隨時最多 **50** 條連線在飛。

**生產端**：N 個 Vercel instance × pool=10 → 隨時最多 **N×10** 條連線在飛。

| 情境 | Vercel instance 數（估）| effective pool |
|------|----------------------|---------------|
| 低 traffic（玩家慢慢點）| 1–2 | 10–20 |
| 高 traffic（500 人同秒按）| 5–10 | 50–100 |

→ **高峰時生產 effective pool 可能接近或超過測試**（pool=50 ≈ 測試值）；
→ **低峰時生產 effective pool 比測試小**（10–20）。

#### 但 reviewer 的核心點仍站得住

- ✅ **生產 effective pool 從未直接被量過**：N 是浮動的，沒人實測 Vercel 多 instance 下的並發行為
- ✅ 測試的「pool=50, 1 client」跟生產的「pool=10, N instances」**不是同一個 client-side 系統**
  - 連線池 contention 行為不同（單一 pool vs 多 pool）
  - Failure mode 不同（單一 process 死 vs 單一 instance 死）
- ✅ 結論「對 500 人 OK」**沒在生產情境直接驗證過**

→ 比喻應該改成：「測試固定 4 線道、生產浮動 2–10 線道（但 Vercel 多 instance 會自動加開線道）」。

#### 我之前的措辭應該修正

我在 [0507_validation.md §3.4](0507_validation.md#34-為什麼這個測試證據力弱誠實聲明) 已寫「測試 pool 跟 app 不同」但沒明確說結論失真；本檔初版也用了 reviewer 的「車道不一致」比喻沒做進一步拆解。**precise 版本**是上方表格 + Vercel 多 instance 的累積行為說明。

### 2.4 真正最直接的驗證方法（如果要 100% 精準）

**HTTP-level 端到端壓測**：
- 不用 pg pool 直連 DB
- 直接 k6 / artillery 對 `https://bigsmile-boardgame.vercel.app/api/xxx` 發 500 並發 HTTP request
- 經過 Vercel function → Vercel 自己 spawn instance → 用真實 pool=10 配置
- 量 latency / 錯誤率 / 5xx rate

這才是「100% 真實環境」測試。工程量 ~1–2 小時（要 build admin token / k6 script）。

不做這個的話，最務實的修補方向見 §2.5。

### 2.5 修補方案

#### B 方案（推薦）：pool max 從 env 讀

```ts
// src/lib/db.ts
const poolMax = Number(process.env.DATABASE_POOL_MAX) || 10;
global.__pgPool = new Pool({
  connectionString: url,
  max: poolMax,
  ...
});
```

然後：
- 本地開發：預設 10
- 生產 Vercel：`DATABASE_POOL_MAX=50`（或合理值）→ **跟壓測值一致**
- 壓測：用同一個 env 變數確保兩邊一致

#### C 方案（搭配 B 必做）：重跑壓測 + 更新結論

改 `load-test-realistic.ts` 的 `POOL` 從 50 改成讀 env（預設 10），跑兩次：
1. POOL=10 模擬「生產原狀」
2. POOL=50 維持原 baseline 對照

然後 0505_testspeed.md 的「對 ≤500 人放心上線」改成：
- 「pool=50 環境下對 ≤500 人放心上線」（事實）
- 或 B 方案實作後：「生產 pool 設為 50 時，對 ≤500 人放心上線」

---

## §3 db.ts 沒檢查 PgBouncer 6543（自己違反 CLAUDE.md §12）

### 3.1 reviewer 原文重點

> 最關鍵的一條。CLAUDE.md §12 自己寫：「500 人時 PgBouncer 6543 為強制要求」。
> 結果 `db.ts` 寫死 `pool: 10`、不讀環境變數、不檢查 6543。

### 3.2 驗證

```ts
// src/lib/db.ts:9-50
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set...');
const isLocal = /\/\/(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);
// ❌ 完全沒檢查 :6543 / pgbouncer=true query string
// 如果有人不小心改 .env 成 5432 直連，code 不會擋
```

### 3.3 判斷：✅ 批評正確

CLAUDE.md §12 確實寫「500 人時 PgBouncer 6543 為強制要求，不能直連 5432」。但 db.ts code 沒做 enforcement check。reviewer 的「自訂規矩自己沒守」**完全正確**。

### 3.4 修補方案

#### A 方案：startup runtime check

```ts
// src/lib/db.ts，getPool() 內
if (!isLocal) {
  const isPgBouncer = url.includes(':6543') || /pgbouncer=true/.test(url);
  if (!isPgBouncer) {
    const msg = '[db.ts] 生產環境必須使用 PgBouncer 6543（CLAUDE.md §12）— 偵測到非 6543 / 非 pgbouncer URL';
    if (process.env.NODE_ENV === 'production') {
      throw new Error(msg);
    }
    console.warn(msg);
  }
}
```

工程量：10 分鐘。風險：0（只是早期 fail-loud）。

---

## §4 round.ts for-loop with await（自己違反 CLAUDE.md §3.3）

### 4.1 reviewer 原文重點

> §3.3 自己寫：「`for (...) { await db.query() }` 紅旗看到就要改」。
> 結果 `round.ts` tickRound 自己就有這個紅旗。
> 這代表他不是不會，而是「沒有時間 / 不想花時間」自查 — 比「不會」更危險。

### 4.2 驗證

```ts
// src/app/actions/round.ts，stocks 迴圈
for (const s of stocks.rows) {
  ...
  await client.query(`UPDATE "Stock" SET current_price = $1 WHERE id = $2`, ...);
  await client.query(`INSERT INTO "StockHistory" (stock_id, price) VALUES ($1, $2)`, ...);
}
```

### 4.3 判斷：✅ 形式違反，但實際影響有限

#### 形式上：違反自訂紅旗

CLAUDE.md §3.3 紅旗清單明確列：
> ❌ `for (const x of list) { await db.query(...) }`

round.ts 的 stocks loop 完全是這個 pattern。reviewer 抓得對。

#### 實際影響：N ≤ 10、不是 N=玩家數

CLAUDE.md §3.3 原文意圖是防止「函式內查詢次數隨資料筆數線性增長」造成 N+1：
- 危險：N=玩家數（500）→ 每加一玩家慢一倍
- 本 case：N=股票檔數（spec 上限 10、CLAUDE.md §1 明文規定）→ 一場活動最多 10 次 round-trip

但 reviewer 的「自訂紅旗自己沒守」**邏輯仍對** — 形式違反就是違反、不能說「我這個 N 比較小所以可以」，否則紅旗就失去威信。

### 4.4 修補方案

#### D 方案：改成單條 CTE

```sql
WITH new_prices AS (
  SELECT s.id,
         CASE WHEN script.change_type = 'fixed' THEN GREATEST(0, script.change_value)
              WHEN script.change_type = 'percent' THEN GREATEST(1, ROUND(s.current_price * (1 + script.change_value::float / 100)))
              ELSE GREATEST(1, ROUND(s.current_price * (1 + (random() * 2 - 1) * 0.05)))
         END AS new_price
  FROM "Stock" s
  LEFT JOIN "StockRoundScript" script ON script.stock_id = s.id AND script.round = $1
),
upd AS (
  UPDATE "Stock" s SET current_price = np.new_price
  FROM new_prices np WHERE s.id = np.id
  RETURNING s.id
)
INSERT INTO "StockHistory" (stock_id, price)
SELECT np.id, np.new_price FROM new_prices np
```

**注意**：原本 random fallback 在 JS 端跑（每股獨立 random），改 CTE 後 random 在 SQL 端、用 `random()` 函數 — 兩種統計分佈一樣（uniform）但具體數列不同。對遊戲性無影響。

工程量：30 分鐘 + 測試。風險：低（覆蓋既有 unit test 範圍）。

---

## §5 整體判斷與修補優先序

### 5.1 對 reviewer 的回應立場

對方 4 條批評中 **2 條完全為真**（§3、§4）、**1 條核心對但力道沒原本說的那麼大**（風險 2）、1 條過時（風險 4）。我的態度：**接受批評、修補形式違反，但 §2 部分需精確化說明**：

- ✅ 「N=10 不算 N+1」這種辯解站不住（CLAUDE.md §3.3 紅旗一視同仁）— §4 修
- ✅ db.ts 沒守 §12（PgBouncer 6543 強制要求）是真的 — §3 修
- 🟡 「壓測 pool=50 vs 生產 pool=10 失真」**部分對**：
  - DB-side 是真實 production（測試對的是真的 Supabase）
  - Client-side 不真實（單 process pool=50 vs Vercel multi-instance × pool=10）
  - Vercel 多 instance 會自動補上差距，但**沒人實測過 effective pool**
  - 結論「對 500 人 OK」確實沒在生產 client-side 配置下直接驗證過 → 仍應修
- ❌ 「壓測有 1959 ops 0 fail」不能完全洗掉 client-side 差異，**但**也不是「結論完全失真」— 是「結論的 confidence interval 比想像中寬」

### 5.2 修補優先序

| 優先 | 動作 | 工程量 | 影響 |
|-----|------|-------|-----|
| 🔴 P0 | A：db.ts 加 PgBouncer 6543 check | 10 min | 解 §3 |
| 🔴 P0 | B：pool max 從 env 讀 | 15 min | 解 §2 + 主因 |
| 🔴 P0 | C：用真實 pool 重跑壓測 + 更新 0505_testspeed 結論 | ~30 min | 把宣稱對齊事實 |
| 🟡 P1 | D：round.ts stocks loop 改 CTE | 30 min | 解 §4（形式正確）|

**P0 全做 ~1 小時**。P1 可後補。

### 5.3 對 0505_testspeed.md / 0507_validation.md 的修正

這兩份報告的「放心上線」結論需要加 caveat：

- **修前**：「對 ≤500 玩家 / 2 小時活動可放心上線」
- **修後**：「**前提：生產 pool 設為與壓測一致的 50（透過 `DATABASE_POOL_MAX` env）**，否則結論不適用」

或：「pool=10 環境下未壓測，正式上線前須補測或用 env 對齊到 pool=50」。

### 5.4 元觀察 — 這次 review 的價值

reviewer 點出的「自訂規矩自己沒守」是**最有價值的批評**。原因：

- AI 寫 code + 寫測試 + 寫文件，整套自洽，但 self-check 容易被 AI 自己的盲點蓋過
- 「自己寫的紅旗自己違反」這種事 AI 跑 lint 不會抓到（規則在 CLAUDE.md，不是 ESLint config）
- **需要人類 reviewer 拿著 CLAUDE.md 對照 code** 才能抓到

這跟 [0507_validation.md §6](0507_validation.md#6-ai-測試會騙人嗎-備註)「AI 測試會騙人嗎」是同一條軸線：AI 寫的東西自洽不等於正確，需要外部視角 cross-check。

---

## §6 行動清單

- [ ] 對外回覆 reviewer：風險 4 已修（指 commit 7f84f4b）、其他 3 條接受批評會修
- [ ] **P0**：實作 A + B + C（共 ~1 小時）
- [ ] **P1**：實作 D（30 分鐘、可選）
- [ ] **更新文件**：0505_testspeed.md / 0507_validation.md 的「可上線」結論加 caveat 或在實作 B 後改成事實
- [ ] **CLAUDE.md §3.3** 增補：「N ≤ 10 的小迴圈仍應改 CTE，否則紅旗失效」（如果 D 實作）

---

## 附：reviewer 批評全文要點存證

為避免日後對照不到原文，摘要 reviewer 提出的 4 點批評：

1. **風險 4（tickRound 兩步驟）**：嚴重度中、目前防護無、修補成本中、建議活動後修
2. **風險 2（400 人同時刷新）**：嚴重度中、目前防護「同時對外服務容量偏低（pool 4 線道改 2 線道）」、壓測 500 OK 但環境不一致
3. **§1 自己訂的規矩自己沒守**：CLAUDE.md §12 PgBouncer 6543 強制要求 vs db.ts 寫死 pool=10 沒檢查；§3.3 for-loop 紅旗 vs round.ts tickRound 自己違反 — 「沒時間 / 不想花時間自查比不會更危險」
4. **§2 壓測數字會給人錯誤信心**：max=50 跟 max=10 是兩個不同的池、testspeed_0505.md 結論「對 ≤500 人放心上線」只在壓測環境成立 — 主辦方據此決策會拿到失真的安全感
