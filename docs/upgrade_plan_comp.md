# Vercel / Supabase 升級評估 — 對「2 小時活動 / 500 玩家」一次性 event

> 撰寫日期：2026-05-05
> 對應實測數據：[testspeed_raw_0505.md](testspeed_raw_0505.md) / [testspeed_0505.md](testspeed_0505.md) / [testspeed_0505_s.md](testspeed_0505_s.md)
> 結論：**Free tier 都不升，省 $25-60**。詳細逐項說明如下。

## TL;DR

| 動作 | 必要性 | 成本 | 改善 |
|------|-------|------|------|
| 升 Vercel Pro | ❌ 不必 | $20+/月 | 0 |
| 升 Supabase Pro | ❌ 不必 | $25/月 | 0（除非你要 backup 保留 7 天）|
| 升 Compute MICRO | 🟡 想的話 | ~$10/月 | 30% burst 改善 |
| 升 Compute SMALL+ | ❌ 不必 | $15+/月 | 對你用不到的極端場景才有差 |
| **不升 + 注意 paused** | ✅ **推薦** | **$0** | 滿足真實工作量 |

---

## 1. Vercel：Hobby 完全夠

| 限制 | Hobby | Pro | 你會用到的量 |
|------|-------|-----|-------------|
| Edge Requests | 1M / 月 | 10M / 月 | 500 玩家 × 100 action ≈ **5 萬** ⚠️ 用 Hobby 1/20 |
| Function duration | 10s | 60s+ | 你的 `maxDuration: 10s` 已 OK |
| Cold start | 可能有 | 快一些 | 對 2 小時連續活動影響小（熱機後就熱了）|

**結論：升 Vercel = 沒差**。一場活動的請求量遠低於 Hobby 上限。

## 2. Supabase Plan vs Compute 要分開看

升 **Pro plan**（$25/月）給你的東西**對這場活動都沒用**：
- 100k MAU（你頂多 500 人）
- 8GB disk（你 0.38 GB，不到 5%）
- 250GB egress（活動撐死幾百 MB）
- Daily backups 7 天（一次性活動，活動結束後手動匯一份就夠）

**真正影響效能的是 Compute size**。但要分清楚兩件不同的事：

### 2a. Pool ceiling（同時連線上限）

| Compute | Direct (5432) | Pooler (6543) |
|---------|--------------|---------------|
| **NANO（Free 現在）** | 60 | **200** |
| MICRO | 90 | 200 |
| SMALL | 90 | **400** |
| MEDIUM | 120 | 400 |
| LARGE | 160 | 800 |
| XL | 240 | 1600 |

升 SMALL 把 pooler ceiling 翻倍到 400，但**這不是你的瓶頸**：

- testspeed 實測 client pool 50/100/200 三個值對 P1/P2 p95 沒差別 — 證明瓶頸不在「拿不到連線」
- 你所有 load-test 的 500 並發 op 沒有 ECHECKOUTTIMEOUT 失敗
- 估算最壞情境：Vercel Hobby 同時 alive ~5-10 instances × pg pool 10 = 50-100 demand，遠低於 NANO 的 200 上限

### 2b. Backend 處理速率（實質效能）

升 compute 真正改善的是「PG backend 能同時跑多少 transaction」與「單 transaction 跑多快」：

| Compute | 月費 | 規格 | 並發 backend（估）| 同步 500 人 P2 p95（估）|
|---------|-----|------|------------------|----------------------|
| **NANO（現在）** | $0 | 0.5GB shared CPU | ~30 | ~7s（實測）|
| MICRO | ~$9.70 | 1GB、2-core ARM | ~50 | ~5s |
| SMALL | ~$14.80 | 2GB、2-core ARM | ~80 | ~3s |
| MEDIUM | ~$59 | 4GB、2-core ARM | ~150+ | ~1s |
| LARGE | ~$109 | 8GB、2-core ARM | 500+ | ≈ baseline 300ms |

**但這只在「同步 500 人按下去同一毫秒」才感覺得到差別**。spaced 測試（真實到達率）已證明 NANO 對 600ms 間隔 p95 已 < 500ms，**規格內**。

### 2c. 什麼情境才會撞到 pool ceiling

| 情境 | 你會遇到嗎？ |
|------|-------------|
| Vercel 同時 spawn ≥ 20 instances（高 traffic 持續服務）| ❌ 一場活動 traffic 不持續 |
| 單一 op 持續 > 30 秒（長 query / 慢交易）| ❌ 你的 op 都 < 1s |
| Realtime WS 客戶端超過 200（看板太多）| ❌ 你最多 3 看板 |
| 多 Vercel project 共享同一 Supabase | ❌ 你只有一個 project |

→ **你的場景不會碰到上限**，所以升 SMALL 拿 400 pooler 對你沒實質意義。

## 3. 真實活動工作量 vs 測試極限

對照 [testspeed_0505_s.md](testspeed_0505_s.md) 的 spaced 測試：

| 場景 | 到達速率 | Free tier 能撐？ |
|------|---------|-----------------|
| 整場 2 小時 500 玩家平均 | 0.07 ops/s | ✅ 100x 超量 |
| 開幕 5 分鐘陸續抽卡 | 1.67 ops/s | ✅ 35x 超量（spaced 測 p95 = 434ms）|
| 開盤秒殺 5 秒 200 人下單 | 40 ops/s | ⚠️ 接近邊界（但 spaced 測 p95 = 300ms 仍達標 §12）|
| **同步壓測 500 人同毫秒** | 5000 ops/s | ❌ 慢（p95 5-8s）但**不會死** |

最後這列才是 [testspeed_raw_0505.md](testspeed_raw_0505.md) 看到的「P1 p95 5.4s」— 而**這個情境永遠不會發生**（人類無法精準同毫秒按下）。

對照 [testspeed_0505.md](testspeed_0505.md) 的 6 情境壓測，唯一現實會發生的尖峰（B 純 buy / C 純 sell / F 寫實尖峰）p95 都在 7-25 秒內處理完，**0 deadlock + 100% 一致性**。

## 4. 推薦做法：Free tier 都不升

### 必做（免費）

1. **活動前一週進 Supabase Dashboard 點一下**：避免被 paused（Free tier 1 週不活動會 pause）
2. **活動當天前一晚 deploy**：讓 Vercel 熱機
3. **Supabase Dashboard → Database → Pause project 旁邊**：確認 Auto-pause 沒被啟用
4. **活動結束後手動匯出一次資料庫快照**：取代 Pro 的 daily backup（一次性需求）

### 如果你心理上想要保險（建議方案）

- **只升 Supabase Compute MICRO**：~$9.70/月（活動結束立即降回 NANO，總成本 < $10）
- 不要升 Pro plan、不要升 Vercel
- 效能改善有限但能提供心理安全感

### 唯一例外

如果你預期玩家會做這種行為，再升 **Compute SMALL** 或更高：
- 開盤瞬間（大會主持人說「現在開放下單！」）500 人在 5 秒內按下 buy
- 重要 NPC 廣播後，玩家集中倒蛋換金錢

但 spaced 壓測證明 25ms 間隔下 free tier 已 p95 ≈ 300ms，**已經達到 §12 規格**，不必升。

## 5. 為什麼 testspeed 的數字看起來嚇人但實際沒事

[testspeed_raw_0505.md](testspeed_raw_0505.md) 是「500 玩家在同一毫秒同時按按鈕」的同步壓測（用 `Promise.all` 一次發 500 個請求）。這對應到：

- **JS event loop 內 sub-ms 排隊** + **PgBouncer free tier ~30 backend 序列化處理**
- p95 = (500 / 30) × 單次處理時間 ≈ 5-8 秒

實際玩家行為**不可能**這樣同步：
- 500 個人手指按下的時間差至少 100ms+ 量級
- 大會主持人喊「開始」到玩家反應的延遲分布在 1-5 秒
- 對應的到達速率最壞 ~100 ops/s（仍低於 free tier 60 ops/s 的 service rate × 短期 burst tolerance）

**spaced 測試**（[testspeed_0505_s.md](testspeed_0505_s.md)）模擬真實到達速率，free tier 在所有現實場景下 p95 都 ≤ 1.7 秒，**已達 §12 規格**。

## 5b. 「PG backend 並發數」的 4 層優化方案

升 compute 是花錢解，但能優化 backend 利用率的招式還有 3 層。完整四層由簡到難：

### Tier 1：花錢買（0 code 改動）

升 Supabase Compute size — 直接給更多 backend slots（同 §2b 的表）。**唯一純錢解**，活動完降回 NANO 仍可用。

### Tier 2：減少單一 transaction 持有連線的時間（中改，免費）

每 op 持連線 ms 越短 → 同樣 backend 數能服務的 ops/s 越多。

**已經做的**：

| 已做 | 效益 |
|------|------|
| ✅ buyStock CTE 合併 3→1 round-trip | 連線時間 -60% |
| ✅ assertNotFrozen 合併 2→1 | 連線時間 -10% |
| ✅ tx 內 getSetting 傳 client（不占第 2 連線）| 不占額外 slot |

**還能做的（沒做）**：

| 待做 | 工程量 | 效益 |
|------|-------|------|
| `drawDestiny` / `sellStock` 末段也合併 CTE（同 buyStock 模式）| ~30 min | 再省 1-2 round-trip |
| `applyQuickAction` 7 步驟合併（最大 win）| ~1 hour | captain 配發單 op 7 → 3 round-trip |
| `revalidatePath` 移到 tx 外（commit 後再呼叫）| ~10 min | 連線釋放快 ~50ms |

### Tier 3：解掉「熱 row 序列化」瓶頸（大改）

A 情境 p95 = 5s 的根因：**500 個 apply 全部在同一個 `QuickAction.global_use_count` UPDATE 上序列化**。即使升 LARGE 也救不到 — **1 個 row 同時只能被 1 個 tx 寫**。

**解法選一**：

#### 3a. 拆 `global_use_count` 到獨立計數表（推薦）

```sql
CREATE TABLE "QuickActionCounter" (
  quickaction_id UUID PRIMARY KEY,
  count BIGINT NOT NULL DEFAULT 0
);
```

- `applyQuickAction` 改：`UPDATE QuickActionCounter SET count = count + 1 WHERE quickaction_id = $1`
- 計數表小 row、無其他欄位混雜 → lock hold time 極短（~1ms）
- 估改善：A 情境 p95 從 5s → ~1s
- **工程量**：~2 hour（migration + applyQuickAction 改寫 + 測試）

#### 3b. 用 advisory lock + 後算 count

```ts
await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [quickactionId])
// 活動結束後 SELECT COUNT(*) FROM Transaction GROUP BY quickaction_id
```

- 配合 `player_max_uses` 限額更精細
- 但 advisory lock 仍是 hot row 序列化，沒根本解

#### 3c. 完全去除計數欄位，改用 INSERT row + 事後 SUM

每筆 apply 寫一筆 `StationUsage` row，count 用 `SUM` 算 — 完全無熱 row 競爭，但限額檢查需改成 `SELECT COUNT(*) ...`。

### Tier 4：架構級優化（規模翻倍才值得）

| 方案 | 適用情境 | 工程量 |
|------|---------|--------|
| **Redis cache for reads**（getMyStats / getStockMarket）| 讀流量爆量 | 1 day（架 Redis + cache invalidation）|
| **Read replica**（Supabase Team plan $599/mo）| 排行榜讀不影響寫入 | 配置即可 |
| **Write queue + 背景批次**（BullMQ 等）| 玩家寫入可接受 eventual consistency | 大改 |
| **拆熱欄位**（PlayerStats 拆 money/blessing 到 partial row）| 玩家轉帳 + 配發 + 買股全在 PlayerStats 撞 | 中大改 |

## 5c. 後遺症分析（Tier 2 與 Tier 3a）

升 compute 沒副作用（純錢解、可逆）。但 Tier 2/3 的 code 改動有後遺症：

### Tier 2.1 — drawDestiny / sellStock 末段合併 🟢 風險低
- 同 buyStock 模式，已驗證
- **唯一注意**：CTE 是「全 commit / 全 rollback」atomic，未來若想做 partial commit 邏輯（例如「Transaction 寫了但 PlayerStats 沒寫」）做不到
- 但目前設計就是 atomic 全有全無，不衝突
- **可做**

### Tier 2.2 — applyQuickAction 7 步驟全合併 🟠 後遺症最多

| 現狀 | 全合併後 |
|------|---------|
| `if (req_money < me.money) throw '金錢不足，需要 N'` | SQL CASE，error 變「INSERT 失敗」 |
| `if (q.player_max_uses && pu.count >= q.player_max_uses) throw 'USAGE_LIMIT'` | 同上，丟失「具體哪個 limit 撞牆」 |
| 玩家看到精確訊息「健康不足，需要 80」 | 只看到「無法執行此快捷模組」 |

**錯誤訊息精度會掉**。違反 CLAUDE.md §6.2「精準錯誤訊息」原則。

→ **改成只合併末 3 段**（UPDATE PlayerStats + UPSERT Usage 兩個 + UPDATE counts + INSERT Transaction）。能省 4 個 round-trip，但保留錯誤訊息精度。

### Tier 2.3 — revalidatePath 移到 tx 外 🟢 極低風險
- Next.js cache invalidation 本來就 best-effort
- 移到 commit 後沒功能差別

### Tier 3a — 拆 global_use_count 獨立計數表

#### 後遺症 1：Schema 改動 🟡 中
要加 migration、改 application code、改後台顯示。**最重要**：migration 必須在「活動沒 captain 操作」期間跑，避免漏計數。

#### 後遺症 2：限額檢查邏輯要改 🟢 低
```ts
// 改前
if (q.global_max_uses !== null && q.global_use_count >= q.global_max_uses) throw ...

// 改後
const cnt = await client.query(`SELECT count FROM "QuickActionCounter" WHERE quickaction_id = $1 FOR UPDATE`, [qaId])
if (q.global_max_uses !== null && cnt.rows[0].count >= q.global_max_uses) throw ...
```
→ 多 1 個 round-trip 的成本，但 counter row 鎖時間極短，整體仍贏。

#### 後遺症 3：admin 後台顯示要改 🟢 低
- `/admin/stations` / `/admin/quickactions` 等頁面從 `QuickAction.global_use_count` 改成 JOIN `QuickActionCounter`
- ~5 處需動

#### 後遺症 4：⚠️ **並非完全解掉序列化**

**這條最重要**：
- 同 QA 的 500 個 apply 還是會在 `QuickActionCounter` row 上序列化（仍是 hot row）
- **真正差別**：
  - 原本鎖 `QuickAction` 主表 row（含 ~10 個欄位、可能被別的 SELECT 卡到）
  - 現在鎖 `QuickActionCounter` row（只 1 個 count 欄位、沒人 SELECT 它做別的事）
  - lock hold time 從 ~10ms 降到 ~1ms
- **本質**：把 contention 從「重 row」搬到「輕 row」，**沒有根本解掉熱 row 序列化**

要徹底解掉序列化，要走 **Tier 3c**：完全去除計數欄位，改用 `INSERT row` + 事後 `SUM` 算 count。但這個改動更大。

#### 後遺症 5：🔴 搞錯遷移時機會嚴重
- 若 migration 中有 captain 在操作 → 新舊兩個 source of truth 不一致 → 計數錯亂
- **必須在 `BoardGameEnabled = false` 時跑 migration**（活動未開始或結束後）
- 活動進行中跑 migration = 災難

### 後遺症總結

| 方案 | 風險 | 適用情境 |
|------|------|---------|
| Tier 2.1 + 2.3 | 🟢 低 | **可做** — 永久受益 |
| Tier 2.2（applyQuickAction 全合併） | 🟠 UX 退步 | **改成只合併末 3 段** |
| Tier 3a（拆 counter 表）| 🟡 中 + ⚠️ 部分解 | **只在預期同 QA 高並發才值得** |
| Tier 3c（INSERT row + SUM）| 🟠 大改 | 規模再翻倍才考慮 |

### 對「2 小時 / 500 人」一場活動的建議優先順序

1. **Tier 1 升 SMALL ~$15**：立即 +50% 效能、活動後降回 NANO，CP 值最高
2. **Tier 2.1+2.3**（drawDestiny/sellStock CTE + revalidate 外移）：~1.5 hour 工程，永久受益、無後遺症
3. **Tier 2.2 改良版**（applyQuickAction 只合併末 3 段）：~1 hour 工程，保留錯誤訊息精度
4. **Tier 3a 拆 counter 表**：**只在預期會發生「主持人喊 → 500 人同時闖同一關」時才做**，且必須在活動未開始期間 migration
5. Tier 3c / Tier 4 都先不要做（規模沒到）

## 6. 最終決策樹

```
你的活動需要更高效能？
├── ❌ 否（spaced 測試證明 free tier 對真實到達速率夠用）
│      → ✅ 用 Free tier、確認沒被 paused
│
└── 🟡 想要心理保險
       → 只升 Compute MICRO（$9.70/月，活動後降回）

你需要超過 1 場活動的長期保留？
├── ❌ 否（一次性 event）
│      → 不需要 Pro
│
└── ✅ 是（會持續使用、需要日備份保留更久）
       → Pro Plan $25/月
```

## 7. 預估總成本

| 方案 | 一場活動成本 |
|------|-------------|
| **不升**（推薦）| **$0** |
| 升 Compute MICRO 一個月 | ~$10 |
| 升 Pro plan 一個月（不必）| $25 |
| 升 Pro + Compute MEDIUM 一個月（過度配置）| $25 + $59 = $84 |
| 升 Vercel Pro（沒用）| +$20/月 |

**省下的錢建議拿去買團隊飲料**。

---

## 附：依據實測數據

- 同步 500 並發極限（free tier）：[testspeed_raw_0505.md](testspeed_raw_0505.md)
- 6 情境 hot-path 壓測（含 multi-QA 寫實尖峰）：[testspeed_0505.md](testspeed_0505.md)
- 18 組合 spaced 到達速率（最接近現實）：[testspeed_0505_s.md](testspeed_0505_s.md)
- baseline vs all-bundle 優化對照：[testspeed_raw_0505_f.md](testspeed_raw_0505_f.md)
- pool size 邊際效益分析：[testspeed.md](testspeed.md)
