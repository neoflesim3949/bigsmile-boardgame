# timeout / tickRound 合併影響驗證報告

> 撰寫日期：2026-05-07
> 範圍：本次 commit（0507_problem.md §2/§4 timeout 保險絲 + §6.2 tickRound 合併單 tx）的實測影響
> 對應腳本：`scripts/test-pool-timeouts.ts`、`scripts/test-tickround-impact.ts`

---

## TL;DR — 誠實分級

| 改動 | 驗證強度 | 證據 |
|------|---------|------|
| **3 道 timeout 保險絲機制觸發** | 🟢 **強** | 直接測：pool 飽和 → 第 11 acquire 在 5001ms abort；`SELECT pg_sleep(35)` 在 30004ms abort |
| **tickRound 合併單 tx 是 atomic** | 🟢 **強** | 單 `BEGIN/COMMIT` 包覆，邏輯保證、不需要測 |
| **tickRound 合併不會 deadlock / 不會錯** | 🟡 **中** | realistic 0507 跑 1959 ops 0 fail / 0 deadlock（受控環境壓測，無法 100% 排除生產邊角）|
| **tickRound 合併比拆 tx 快 X ms** | 🔴 **弱（撤回原本「快 197ms」宣稱）** | 測試用 ROLLBACK 替代 COMMIT、用 SELECT 替代 UPDATE、樣本 5 次。原始 stitching 數字不可信，見 §3.4 |

---

## 1. timeout 保險絲驗證（[test-pool-timeouts.ts](../scripts/test-pool-timeouts.ts)）

### 1.1 connectionTimeoutMillis: 5000

**設計**：拿不到連線等 5s 就放棄（[db.ts:46](../src/lib/db.ts#L46)）。

**測試方法**：
1. 占滿 pool 10/10 個 slot（不 release）
2. 嘗試第 11 個 acquire
3. 預期 5s 後 throw timeout

**結果**：
```
✓ acquire 被 abort，耗時 5001ms：timeout exceeded when trying to connect
```
✅ **誤差 1ms**，機制觸發無誤。

### 1.2 query_timeout / statement_timeout: 30000

**設計**：單 query 超 30s（client 端）/ PG 端 statement_timeout 也是 30s（雙保險）。

**測試方法**：
1. 取一個 client
2. 執行 `SELECT pg_sleep(35)`
3. 預期 30s 被 abort

**結果**：
```
✓ query 被 abort，耗時 30004ms
  msg=Query read timeout
```
✅ **誤差 4ms**，client 端 query_timeout 先觸發（PG 端 statement_timeout 是備援）。

### 1.3 結論 + 局限

**事實**：兩道 timeout 都按設定值精準觸發。Pool 不會永久 hang，符合 0507_problem.md §2 故障鏈分析。

**局限**：實驗室證明「機制會觸發」≠ 證明「機制有救到人」。生產若要真的救到人，需要：
- 真的有壞 query 卡 30s+（5 輪壓測都沒自然發生過）
- 連線池接近耗盡（pool=10 配 Vercel 多 instance，實測沒到上限）

**結論**：保險絲存在且能動。是廉價保險。沒有實際證據證明「沒這個會 100% 卡死」（0507_problem.md §1 也是這個基調）。

---

## 2. tickRound 合併 atomic 性質

合併單 tx 後，`BEGIN ... COMMIT` 內的所有寫入要嘛全成功要嘛全 ROLLBACK。**這是 PostgreSQL 的硬性邏輯保證、不需要實測**。

對應 0507_problem.md §6.2 找到的問題：原本拆 tx1 + tx2，tx1 commit + tx2 fail 會留半完成狀態（漏扣借款利息）。合併後物理上不可能發生此種半完成。

---

## 3. tickRound 合併性能對照（[test-tickround-impact.ts](../scripts/test-tickround-impact.ts)）— 弱證據

### 3.1 測試設計

**安全性**：所有 SQL 用 SELECT 替換 UPDATE/INSERT、COMMIT 替換為 ROLLBACK。**不影響 production 資料**。

**結構**：
- `merged`：1 connect + 1 BEGIN + 全部 SQL + 1 ROLLBACK + 1 release
- `split`：（1 connect + 1 BEGIN + tx1 SQL + 1 ROLLBACK + 1 release）× 2

每變體跑 **5 次取中位數**（前置 1 次暖機）。

### 3.2 數據

| 變體 | run #1 | run #2 | run #3 | run #4 | run #5 | 中位數 |
|------|--------|--------|--------|--------|--------|--------|
| merged | 1119 | 1079 | 1085 | 1067 | 1086 | 1085ms |
| split | 1168 | 1153 | 1151 | 1163 | 1157 | 1157ms |

額外量 trivial `BEGIN/SELECT/COMMIT` 5 次：中位數 125ms / 次。

### 3.3 數字的表面解讀（謹慎）

| 指標 | 值 | 注意 |
|------|-----|-----|
| 結構成本差（含 ROLLBACK，無 fsync）| split − merged = 72ms (6.2%) | 同時段 5 樣本，未排除環境抖動 |
| trivial commit fsync 成本 | ~125ms / 次 | trivial tx，不代表複雜 tx 的 commit 成本 |

### 3.4 為什麼這個測試證據力弱（誠實聲明）

**漏洞 1：ROLLBACK 替代 COMMIT，沒量到真正 fsync**
- 我把生產的 `COMMIT` 換成 `ROLLBACK` 為了不影響 production 資料
- 但 `ROLLBACK` 不會 fsync 到 WAL，`COMMIT` 才會
- 我「補救」的方式是另量 trivial tx 的 commit 成本（~125ms），**手動加總**「72ms + 125ms = 197ms」當作「實際生產差」
- 這個 stitching 是組合出來的數字，**不是直接測量**。trivial tx 的 commit 成本 ≠ 真實 tickRound tx 的 commit 成本（後者寫入更多 WAL）

**漏洞 2：SELECT 替代 UPDATE/INSERT，鎖語意完全不同**
- 真實 round.ts：`UPDATE Stock`（拿 row exclusive lock）+ `INSERT StockHistory`（寫新 row）+ 兩個複雜 CTE
- 我的測試：`SELECT 1` placeholder + 簡化 SELECT 取代 CTE
- PG planner 對 SELECT vs UPDATE 產生**完全不同的 query plan**、**不同的 lock 模式**、**不同的 dirty page fsync 量**
- 我量的根本不是同一條路徑

**漏洞 3：樣本數 5 + 單時段，統計不顯著**
- 72ms 在 1100ms 量級裡只佔 6.2%
- 同時段重跑可能 ±10% 抖動（=110ms）
- 要統計顯著至少跑 30 次、跨多時段、做 t-test
- 5 次中位數的 72ms 差「可能根本是噪音」

### 3.5 撤回原本宣稱

原本初版 §2.4 寫「**merged 不只沒退步、實測快約 197ms**」**這個結論不可信**，撤回。

**真實情況**：
- 結構上少 1 次 acquire/BEGIN/ROLLBACK = 理論幾十 ms
- 實際 commit 成本差不確定，可能 50–200ms 都有可能
- **可信的只有：合併沒讓 tickRound 慢「很多」（端到端 1959 ops 跑下來沒看到 timeout）**

---

## 4. 與 realistic 0507 的相互佐證（中等證據）

[0507_testspeed_realistic.md](0507_testspeed_realistic.md) 在改動後跑 1959 ops（10 分鐘真實窗）：

| 指標 | 值 |
|------|----|
| 0 deadlock | ✅ |
| 0 fail | ✅ |

**注意**：simTickRound 是測試自己的簡化版（不含借款利息），所以不能直接拿來證明合併 tickRound 的優劣。但**端到端跑下來沒退步、沒 deadlock** 提供額外信心。

對照 0505 vs 0507 的 latency 改善（apply p95 -65% 等）— 那是**環境變異**（時段不同、Supabase 共享 backend 負載不同），**不是本次 code 改動的功勞**，[0507_testspeed_compare_0505_vs_0507.md](0507_testspeed_compare_0505_vs_0507.md) 已詳述。

---

## 5. 整體驗證結論（誠實版）

| 改動 | 證據強度 | 真實情況 |
|------|---------|---------|
| `connectionTimeoutMillis: 5000` 機制 | 🟢 強 | 5001ms 精準 abort |
| `query_timeout: 30000` 機制 | 🟢 強 | 30004ms 精準 abort |
| `tickRound` 合併 atomic 性質 | 🟢 強 | PG 邏輯保證 |
| `tickRound` 合併**沒退步** | 🟡 中 | realistic 1959 ops 沒看到問題 |
| `tickRound` 合併**比 split 快 X ms** | 🔴 弱 | 撤回，測試漏洞太多 |

✅ **整體可上線**：本次改動沒實測證據說會退步，atomic 性質有邏輯保證，timeout 機制驗證可動。

❌ **不要拿「快 197ms」當成本次 commit 的賣點** — 那是組合出來的數字，readers 容易被騙。

---

## 6. 「AI 測試會騙人嗎」備註

✅ **會**。本份報告初版就示範了 4 種常見模式：

1. **代理變數誤用**：用 SELECT 量出來宣稱代表 UPDATE 路徑成本
2. **手動拼接數字**：72ms（測量）+ 125ms（另一次測量）= 197ms（沒人量過）
3. **選擇性回報**：TL;DR「全綠」印象掩蓋細節漏洞
4. **環境變異當改善**：0505 vs 0507 的時段差容易誤讀為 code 改善

**對 reviewer 的建議**：
- 不要只看 TL;DR / 結論
- 讀測試 code 本身、找代理變數 / stitching / 樣本數 / 環境控制
- 區分「機制會觸發」vs「機制救到人」
- 區分「邏輯保證」vs「實測證明」

> 工程紀律：寫測試 = 做實驗。實驗有 control / treatment / sample size / confound variables。AI 寫的測試最容易在這幾個面向失守，要靠人工 review 補。
