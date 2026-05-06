# CLAUDE.md — 開運大富翁專案 AI 協作規範

> 本檔提供給 Claude Code（或其他 AI 協作工具）**每次開工前必讀**的規則與慣例。
> 詳細功能規格見 `docs/BOARD_GAME_V2.md`；系統架構、資料模型、設計取捨見 `docs/BOARD_GAME_V2_ARCHITECTURE.md`。

---

## 1. 項目簡介

**開運大富翁** 是一個**獨立部署**的活動型小遊戲系統，自帶帳號、權限與資料庫，不依賴任何外部遊戲系統。

- 核心參數：金錢、健康、福分、業力
- 角色：**三分互斥** — 大會管理員 / 玩家 / 關主（關主**不參與遊戲本身**，純發放分數的工具人）；活動看板靠 display token 唯讀，不算 Account 角色
- 主要頁面：管理後台（桌面優先）、關主後台 / 掃碼（手機）、玩家首頁、股市、活動看板
- 特殊功能:**重生鍵** — 特定關卡的關主可對玩家執行「重生」：**全部歸零重來** — 四項參數重設為重生初始值、清空所有持股、清空銀行借款（含 `loan_updated_at`）、**清空所有道具**。**前置防呆**：玩家必須**主動**在地獄畫面把 QR 拿給關主掃（**手動輸入 ID 路徑不會出現重生鍵**，前後端雙重驗證），且後端 pg tx 內即時驗證 `health ≤ 0 || blessing ≤ 0`，未死亡的玩家不能被任意重置
- **地獄畫面在終局結算後不鎖**：條件改為 `is_dead && !tour_mode && !final_scoring_at`。遊戲結束後即使玩家 `health/blessing ≤ 0` 也讓他正常進入玩家中心查看明細；所有寫入由後端 `assertNotDuringFinalScoring` 統一拒絕（玩家 / 關主端皆然），前端不依賴鎖頁來阻擋寫入
- 玩家進入頁面時若 `AppSettings.CardDrawMode==='true'` 且 `destiny_name=NULL` → middleware 強制導 `/onboarding` 抽命格範本；抽完才能進 `/`。**觸發條件不是「首次登入」**：只要兩條件同時成立（抽卡模式開啟 + 尚無命格）就會被導向，無論第幾次進站。若 `CardDrawMode==='false'` 或玩家已有 `destiny_name`，自行進 `/onboarding` 一律被擋回 `/`

### 命格抽卡比例與配額（CRITICAL）
- **設定基準**：`AppSettings.MaxDestinyDraws`（預設 100）= 比例計算基準人數，**不是硬上限**
- **每範本比例**：`InitialValueTemplate.draw_ratio`（INTEGER 0–100）= 該命格佔 MaxDestinyDraws 的百分比
- **配額計算**：每個命格 quota = `floor(MaxDestinyDraws × draw_ratio / 100)`
- **抽卡演算法（滾動 cycle，不擋人）**：
  1. 查當前已抽 destiny_name 各命格人數
  2. 算 `cycle = floor(total_drawn / MaxDestinyDraws)`（已跑幾輪）
  3. 該命格的有效 quota = `(cycle + 1) × quota`（每多一輪允許再抽 quota 個）
  4. 過濾掉 `already_drawn >= effective_quota` 的命格
  5. 若仍有候選 → 隨機抽（同 ratio 內均勻）
  6. 若全部命格都達 effective quota（極端情況浮點偏差）→ 從所有 active 範本均勻抽（不擋人 fallback）
- **後台 UI**（`/admin/settings` 命格範本池區）：
  - 頂部加全域「總人數基準 [100]」input → 寫入 `MaxDestinyDraws`
  - 每張卡加「比例 [10] %」input
  - 即時換算顯示：「富貴命 quota 10 / 清修命 30 / 勞碌命 60，合計 100%」
  - 警示比例不為 100（紅字「目前合計 95%，建議調整」），但不擋儲存（讓 admin 自由配）
- **保證**：抽完 100 人後系統不擋玩家，會繼續按同比例分配（第 101 人開始第二輪 cycle）
- 主題：`/admin/*` 與 `/display/*` **強制深色 + md 字級**；其他路由跟玩家偏好（`pref_theme` / `pref_font_size` localStorage）。詳見架構文件 §12.3
- **回合制**：主持人後台按「下一回合」按鈕同時推進股價 + 結算所有借款利息（每 10 分鐘 1 次，120 分鐘共 12 回合）；**不用 cron**（Supabase 免費版不支援）。**第 1 回合推進時自動關閉 `TourMode`**（admin 從 demo 進入正式遊戲）；`tickRound` 內驗 `BoardGameEnabled === 'true'` 與 `final_scoring_triggered_at IS NULL`，不符直接拒絕
- 預期負載：單場 2 小時活動、**≤ 500 人**同時在線、1～3 台大屏幕
- 股市：**≤ 10 檔**、玩家 ↔ 大會（系統）交易、**無 P2P 撮合**、依當下 `current_price` 即時成交。具備「前台顯示 / 不顯示」與「可賣 / 不可賣」屬性；不顯示的商品，玩家仍可透過代碼搜尋進入購買。
- **不輪詢**：玩家頁進入 / 下拉刷新 / 自身 action response 才更新；看板靠 Realtime 推 + 60 秒 fallback；徹底避開 500 人輪詢洪流

---

## 2. 技術棧

| 層 | 工具 |
|----|------|
| 前端 | Next.js 14+（App Router）、React、Tailwind CSS |
| 後端 | Next.js Server Actions |
| 資料庫 | PostgreSQL（建議 Supabase） |
| 寫入路徑 | `pg` 連線池 + 顯式交易（`BEGIN/COMMIT/ROLLBACK`） |
| 讀取路徑 | Supabase JS（PostgREST 自動 JOIN） |
| 掃碼 | `html5-qrcode`（**dynamic import，禁 SSR**） |
| 部署 | Vercel + Supabase |

---

## 3. 資料庫存取規則（CRITICAL）

### 3.1 兩種 client，分清楚用哪個
- **寫入 + 需交易** → `lib/db.ts` 的 `pg` 連線池
- **讀取 + 簡單寫入** → `lib/supabase.ts` 的 Supabase JS
- **絕對不要** 在同一個 server action 內混用兩種 client

### 3.2 交易紀律
- 涉及「金錢移動」「庫存變動」「多表一致性」一律用 pg 顯式交易：
  - 玩家互轉、股票買賣、套用快捷模組、換匯、發放道具
- 多 row 鎖：固定 `user_id` 升序排序避免死鎖
- **不鎖 `Stock` row**：股價以呼叫當下 `current_price` 成交（避免買賣序列化）
- **`withTx` 內建 deadlock auto-retry**：偵測到 PG SQLState `40P01` 自動 ROLLBACK + 換 client + 等 50ms 重試，最多 2 次。對抗環境差異 / 並發抖動造成的偶發 deadlock，業務錯誤（INSUFFICIENT_FUNDS 等）不重試
- **tx 內取 / 寫 setting 一律傳 `client`**：`getSetting(key, client)` / `getSettings(keys, client)` / `setSetting(key, value, actor, client)`。**禁用** standalone — 否則會走獨立連線占用第 2 個 pool slot，500 並發雙倍消耗 pool（pool=10 production 等於 10% 直接浪費）
- **凍結態檢查用合併 helper**：玩家寫入 action 第一行用 `assertNotFrozen(client)` 取代 `assertNotDuringFinalScoring + assertNotTourMode`（從 2 個 round-trip 降到 1）
- **多表寫入合併 CTE**：UPDATE PlayerStats + UPSERT StockHolding + INSERT Transaction 等同一 tx 內的多次 row 寫入應合併成單一 CTE，從 3 個 round-trip 降到 1（範例見 [stock.ts buyStock](src/app/actions/stock.ts)）

### 3.3 防止 N+1（最常見效能殺手）

**準則**：函式內的 DB 查詢次數應與資料筆數**無關**，只與「查詢類型數」有關。

#### 紅旗 — 看到就要改
- ❌ `for (const x of list) { await db.query(...) }`
- ❌ `await Promise.all(list.map(x => db.query(...)))` — 平行化 ≠ 解決 N+1
- ❌ 取列表後再對每筆呼叫 `.select()` / `pool.query()`

#### 三種正確模式

| 場景 | 用法 | 範例 |
|------|------|------|
| 一般讀取（首選） | Supabase 嵌套 | `select('*, item:Item(*)').eq('user_id', uid)` |
| pg 交易內部 | 批次 IN | `WHERE id = ANY($1)` + Map 重組 |
| 複雜聚合（sparkline、排行榜） | 原生 JOIN / LATERAL | `LATERAL JOIN ... array_agg` |

**預設用嵌套 select；特殊情境才用其他**。詳解與本系統 6 個高風險場景見架構文件 §14.9。

#### 自審流程
寫完每個 server action 後，回頭數每個 DB 查詢實際會跑幾次。若答案依賴「列表筆數」，就是 N+1。

### 3.4 索引
新增 FK、常用 WHERE / ORDER BY 欄位，**必須**同步加索引（清單見架構文件 §14.3）。

---

## 4. 認證與安全規則

### 4.1 後端是唯一真相
- 所有 server action 開頭以 session（HttpOnly cookie + JWT）取得登入者
- **JWT payload 包含 `{ userId, role, name }`**，middleware 純解碼即可路由保護，**禁止**為了驗 role 額外打 DB
- **禁止信任前端傳入的 `actorUserId`** — 一律以 session 為準
- 寫入前必驗權限：玩家動自己、關主動指派關卡的玩家、管理員動全域
- `changeRole` 後該 user 的舊 JWT 仍帶舊 role 直到 access token TTL（30 分鐘）；可透過撤銷 refresh token 強制重登

### 4.2 共用 guard helper（DRY）
所有玩家寫入 action（換匯、轉帳、買股、賣股、銀行借款／還款 …）都要拒絕地獄狀態玩家。**禁止**在每個 action 自己 inline 寫 `if (health <= 0 || blessing <= 0)`，一律用 `lib/auth.ts` 的共用 helper：

```ts
// lib/auth.ts
export function assertPlayerAlive(stats: PlayerStats) {
  if (stats.health <= 0 || stats.blessing <= 0) {
    throw new ActionError('PLAYER_DEAD')
  }
}
```

```ts
// app/actions/player.ts — 每個玩家寫入 action 第一行
const { userId } = await requireSession()
const stats = await getPlayerStats(userId)
assertPlayerAlive(stats)   // ← 統一 guard
// ... 業務邏輯
```

**為什麼**：規則一改（例如未來「金錢 < 0 也算死」）只動 helper 一處；漏寫時 grep 一抓就抓到；code review 不必逐 action 比對。

同樣原則也適用於：
- `assertCaptainOfStation(userId, stationId)` — 關主操作前驗指派
- `requireRole(role)` — admin-only / captain-only / player-only 動作的角色檢查
- `assertNotDuringFinalScoring()` — 終局結算後拒絕一切玩家寫入

### 4.3 Token 與密碼
- 玩家 QR / 看板 display token：HMAC-SHA256（金鑰 `AUTH_SECRET`），含 `nonce + exp`
- 玩家 QR TTL = 5 分鐘；display token TTL = 活動天數 + 1
- 密碼存 bcrypt（cost ≥ 12）或 argon2id
- **禁明文、禁可逆加密、禁自製雜湊**

### 4.4 環境變數
- `SUPABASE_SERVICE_ROLE_KEY` / `AUTH_SECRET` / `DATABASE_URL` 僅 server-side
- **禁用 `NEXT_PUBLIC_` 前綴包裝任何敏感值**
- DB 連線必帶 `sslmode=require`

### 4.5 攻擊防護
- 登入接口 rate limit：**主防線 per-account**（同一 `login_id` 5 次失敗 / 分鐘 → 鎖 15 分鐘）、**副防線 per-IP** 120 次/分鐘（會場 500 人共用 NAT egress IP，per-IP 不能太嚴）
- SQL 一律 parameterized query；**禁字串拼接 SQL**
- 玩家輸入**禁**套 `dangerouslySetInnerHTML`
- 跑馬燈 / 事件文字渲染為純文字

---

## 5. 系統設定（AppSettings）

新增 key 的標準流程：
1. 在 `lib/settings.ts` 的 `AppSettingsKey` type 加入新 key 字面量
2. 在 `DEFAULT_SETTINGS` 表加入預設值
3. 讀取走 `getSetting(key)` helper（自動 fallback 預設值）
4. 寫入走 `setSetting(key, value)` helper（自動 upsert + 寫 `Transaction` log）

**禁止**直接 `from('AppSettings').select()` 跳過 helper — helper 統一處理預設值與稽核。

### 參數設定頁（`/admin/settings`）

後台路由 `/admin/settings` 提供 **7 個 section** 的參數設定頁面（數值顯示 / 最終計分權重 / 賣股福分扣分 / 重生後初始值 / 命格範本池 / 業力影響 / 危險操作區）：

| 區塊 | 涵蓋的內容 |
|------|------------|
| 數值顯示設定 | `ShowAllStats`（單一 toggle，控制玩家是否看見福分／業力。健康／金錢始終可見） |
| 最終計分權重 | `ScoreWeightMoney`（建議 0.05）、`ScoreWeightBlessing`（建議 200）、`ScoreWeightKarma`（建議 150，扣除）；公式：`金錢×W_m + 福分×W_b − 業力×W_k`，健康不參與計分 |
| 重生後初始值 | `RebirthMoney`、`RebirthHealth`（最高 100）、`RebirthBlessing`、`RebirthKarma`（玩家被關主執行重生後的初始值；不再有「新手 fallback」一律走命格抽卡）|
| 新手命格範本池 | `InitialValueTemplate` 表 CRUD（多個範本，啟用中隨機抽取） |
| 危險操作區（Danger Zone） | 5 個按鈕（重置會員明細 / 刪除所有會員 / 重置股價歷史 / 刪除所有股票 / 重置使用次數），**每個按鈕需經過 3 次確認彈窗才會執行**。**「重置會員明細」**：清空玩家四項數值 / 命格 / 持股 / 借貸 / 道具 + **玩家四項值的 Transaction 明細**（`DELETE WHERE user_id IN (player accounts)`），保留 Account |

**這頁不含**：
- **活動時間 / 遊戲狀態旗標**（`BoardGameEnabled` / `CardDrawMode` / `TourMode`）→ 在 `/admin` 總覽面板的工具列
- **換匯倍率**（`ExchangeRateMultiplier`）→ 在 `/admin` 總覽面板的「換匯所即時權重控制」
- **換匯方案 / 銀行借貸方案**（`ExchangeOption` / `BankLoanOption`）→ 在 `/admin/finance`
- **看板版型 / 跑馬燈 / display token** → 在 `/admin/events`（兩列佈局：劇情事件排程全寬 + 看板畫面設定 ｜ Display Token 並排；Token 撤銷或過期後可進一步「刪除紀錄」`deleteDisplayToken`）

最終計分由管理員按 `/admin` 工具列的「遊戲結束(計分)」觸發（`triggerFinalScoring`），結果推送至看板與玩家端。

### 總覽面板（`/admin`）

`/admin` 是管理員的核心儀表板，**唯一**控制遊戲整體節奏的地方。三大功能群：

**A. 頂部工具列（5 鈕）**
- 「導覽遊戲」toggle → `setQuickFlag('TourMode', bool)`。**TourMode=true 時**：(1) 玩家不需抽命格也能瀏覽所有頁面（middleware 跳過導向 `/onboarding`）；(2) 即使 health/blessing ≤ 0 不顯示地獄畫面；(3) **所有玩家 / 關主寫入 action 後端用 `assertNotTourMode()` 一律拒絕**（換匯 / 轉帳 / 股市 / 借貸 / 套用快捷模組 / 重生）；玩家頁面顯示 sky 色 banner 提示「導覽中」
- 「遊戲開始」按鈕 → `setQuickFlag('BoardGameEnabled', true)`：除了寫入旗標 + 第一次開啟記錄 `BoardGameStartedAt`，**還會自動將 `ShowAllStats` 設為 `'false'`**（活動進行中隱藏福分 / 業力數值保持神秘感；admin 可手動切回 true）
- 「抽卡模式」toggle → `setQuickFlag('CardDrawMode', bool)`
- 「遊戲開始」按鈕 → `setQuickFlag('BoardGameEnabled', true)`；**前置條件**：上面兩個 toggle 都要先開
- 「遊戲結束(計分)」按鈕 → `triggerFinalScoring()`（鎖定玩家寫入、看板切排行榜）。**已計分後此按鈕變成「重置系統」** → `restartGameCycle()`：核重置（清玩家狀態 / 持股 / 借貸 / 道具 / 股票歷史曲線 / 使用次數 / 看板場次狀態 / **玩家四項值 Transaction 明細**，並把事件全部停用、所有旗標歸零；**保留**帳號、商品定義含 current_price、道具、關卡、方案、命格範本、**StockRoundScript / StockRoundEvent 股票回合腳本**），**前端強制 5 次確認彈窗**。重置後三鍵全關，admin 必須重新按「導覽遊戲」「抽卡模式」「遊戲開始」才能啟動下一場
- 「開啟活動看板」link → `/admin/events`（去發 display token）

**B. 3 控制台**
- **回合控制面板**：「推進下一回合」按鈕 → `tickRound()`（兩 tx + 30 秒節流 + 套用 StockRoundScript / StockRoundEvent）。前置條件：`BoardGameEnabled='true'` && 終局未觸發；不符直接 FORBIDDEN。第 1 回合推進時 UPSERT `TourMode='false'`。三個控制面板等高 `xl:h-[420px]`，推進歷史內部 `h-32` fixed scroll，內容超過走滾動不撐高 panel
- **股票腳本值 = 0 的語意**：`StockRoundScript.change_value`（`/admin/stocks` 回合腳本總表）允許設 0：
  - `fixed = 0`：該回合股價直接歸零（暴跌劇情）。後端 `buyStock` 加 guard 拒絕 `price <= 0` 的買單；前端股市買進按鈕顯示「停止交易」disabled
  - `percent = 0`：該回合股價鎖定**不變動**（與「無腳本走 ±5% 隨機」不同）
  - 前端 admin 編輯 cell：值為 0 **不該觸發 cell 刪除**，只有空值或非數字才刪
- **強制平倉事件**：`StockRoundEvent.force_liquidation_ratio`（0–100）每回合可設一個全域比例。`tickRound` Tx1 內在股價更新後執行：
  - 對所有 `StockHolding`：`shares_to_sell = FLOOR(shares × ratio / 100)`
  - 賣價固定 **$0**（不依當前 current_price，事件性懲罰），玩家完全沒拿回錢
  - `avg_cost` **不變動**（剩下的股維持原均價）
  - 剩餘 = 0 → DELETE row；否則 UPDATE shares
  - 寫 `Transaction tx_type='forced_liquidation'`，payload `{round, ratio, event_text, stock_id, stock_code, stock_name, shares_sold, money_gain: 0}`
  - 死亡玩家也被平倉（無差別）；TourMode / 終局結算因 `tickRound` 已被 guard 擋
  - **單條 CTE SQL** 完成 SELECT + DELETE + UPDATE + INSERT 寫紀錄（無 N+1）
  - admin 在 `/admin/stocks` 回合腳本總表「事件跑馬燈」欄前面的「強制平倉 %」input 設定（rose 色強調危險）
  - 玩家歷史明細顯示：「因『事件名』股票『BTC 比特幣』被強制售出 ×N @ $0」，金錢 delta = 0
- **快捷模組 / 倍率方案歸屬（CRITICAL）**：`QuickAction` 與 `StationSellMultiplier` 都**只綁 `station_id`，沒有 `owner_user_id`**。同一個關卡的多位關主共用同一份清單，任何被指派的關主都能完整 CRUD。後端 guard 用 `$session.userId = ANY(s.captain_user_ids)` 驗權限，**禁止**用 `WHERE owner_user_id = $captainUserId` 的舊模式。Migration 0009 移除了 QuickAction 原本的 `owner_user_id` 欄位（早期設計每位關主有私房清單，後改為協作模型）。
- **股票加乘賣出（關主限定）**：`Station.allow_stock_sell_multiplier` 旗標（admin 在 `/admin/stations` 開關）。開啟後關主可在 `/captain/multipliers` 自管倍率方案（`StationSellMultiplier` 表，`{label, money_multiplier, blessing_penalty_multiplier, req_item_ids[], sort_order, is_active}`），掃玩家 QR 或手動輸入 ID 後在 `/captain/scan` 看到玩家持股清單，選一檔點擊 → modal 跳出股數 + 倍率選擇 → 確認賣出。**前置道具條件**：每個倍率可指定 `req_item_ids` 多個道具，**AND 語意**（玩家須同時持有所有道具），空陣列 = 無條件。前端自動 disable 玩家未具備全部道具的倍率；後端 `captainSellStockWithMultiplier` 用 CTE 重驗（`miss CTE: need LEFT JOIN have WHERE h.item_id IS NULL`），缺道具回 `MISSING_REQUIRED_ITEMS`。**計算規則**：
  - `proceeds = current_price × shares`、`profit = (current_price - avg_cost) × shares`
  - `profit > 0` → `bonus = round(profit × (moneyMult - 1))`、`blessing_penalty = round(profit × blessingMult / divisor)`，**divisor 由 `AppSettings.StockSellBlessingPenaltyDivisor` 控制**（預設 10000 = 「每 1K 獲利扣 0.1 福分」=「每 10K 獲利扣 1 福分」；admin 在 `/admin/settings` 「賣股福分扣分」區可調）
  - `profit ≤ 0` → bonus=0、blessing_penalty=0（**賠錢不疊加倍率、不扣福分**）
  - 寫 `Transaction tx_type='captain_stock_sell_mult'`，actor 是關主 user_id
  - **同樣的「1K 獲利扣 0.1 福分」基礎規則也套用在玩家 `/stock` 自助 sellStock**（不是只有關主代售才扣）；profit ≤ 0 同樣不扣
  - **掃碼或手動輸入 ID 都可用**（不像重生鍵限定 QR）；後端在 captainSellStockWithMultiplier 內驗 captain 屬於該 station 且 station 旗標開啟、multiplier 屬於該 station 且啟用
- **業力影響（KarmaBand）**：`/admin/settings` 命格範本下方的「業力影響」區管理。每筆 row = `{label, karma_min, karma_max, money_delta, health_delta, blessing_delta, karma_delta, sort_order, is_active}`，`karma_min/max` 允許 NULL（不設下/上限）。`tickRound` Tx1 在強制平倉之後執行：
  - 對 `health > 0 AND blessing > 0` 的玩家以 LATERAL JOIN 取對應 band（重疊以 `sort_order` 小者優先 LIMIT 1）
  - 跳過 4 項 delta 全 0 的 band（如「平凡」），避免污染 Transaction
  - cap 規則：`health = LEAST(100, GREATEST(0, ...))`、`money / blessing = GREATEST(0, ...)`、`karma` 不設上下限
  - **單條 CTE**：affected → upd → INSERT，500 玩家也只一次 round-trip（無 N+1）
  - 寫 `Transaction tx_type='karma_band_effect'`，payload `{round, band_label, money_delta, health_delta, blessing_delta, karma_delta}`
  - 地獄狀態玩家不受影響；TourMode / 終局結算因 `tickRound` 已被 guard 擋
- **即時跑馬燈廣播**：textarea + 發送 / 清除 → `publishMarquee` / `clearMarquee`，TTL 上限由 `BoardMarqueeMaxMinutes` 控制
- **換匯所即時權重控制**：`-50%` / `-20%` / `0%` / `+50%` / `+100%` / 自訂 6 鈕 → `setExchangeRateMultiplier`，倍率套在 `ExchangeOption.money_gain_per_unit` 上。**「自訂」用內建 modal**（不要用 `window.prompt` — mobile Safari / 部分桌面 Chrome 會靜默擋）。**前後端必須同時套用倍率且公式一致**：`listExchangeOptionsForPlayer` 與 `exchangeBlessing` 都用 `effective_per_unit = round(money_gain_per_unit × mult)`、`total = effective_per_unit × units`（先 round 再乘，避免「顯示 +200、實際 +199」的 rounding 爭議）。**禁止**只在後端套倍率不在前端 list 套，否則玩家看到的「將獲得」與實際入帳會不一致

**C. 風雲榜**（前身為「財富排行榜」）
- `final_score` **預存於 `PlayerStats.final_score`**（migration 0012），每次 `tickRound` Tx2 結尾 / 改 `ScoreWeight*` / `triggerFinalScoring` / `rebirthPlayer` 由 `lib/score.ts` 的 `recomputeAllPlayerScores` / `recomputePlayerScore` 自動重算。SQL 內以 `::float` cast 讀 AppSettings 算分（避免 PG 對 `int * float-text-param` 的 cast 推導失敗）。
- 公式：`final_score = ROUND(money × W_m + blessing × W_b − karma × W_k)`
- Admin 端 leaderboard 撈全部 active player（**不下 LIMIT**，依 `final_score DESC`）→ 前端分頁（**預設 20 / 可切 50 / 100**）+ 6 欄可點排序（金錢 / 福份 / 健康 / 業力 / 重生次數 / 最終分數）+ 命格 / 狀態 兩欄 pill badge 依 theme 套色
- **rank 永遠依 `final_score` DESC 固定，不隨當前排序欄位變化**（V2 §8 名次固定原則）— 玩家身上的 rank 數字不論點哪個欄位排序都不會變

---

## 6. UI 規則

### 6.1 響應式（鐵則）
- **每個 UI 變更同時考慮桌面與手機**（除 `/admin/*` 例外）
- Tailwind 響應式 prefix：`md:` / `lg:`
- 觸控目標 ≥ 44px
- 避免 `fixed` / `absolute` 元素在小螢幕互相覆蓋
- 寫死 px（`w-96`、`p-10`、`text-5xl`）必須有手機版對應
- **禁用 `window.confirm()` / `window.alert()`**：mobile Safari / 部分桌面 Chrome 會擋。一律用 `useConfirm()`（[components/shared/ConfirmProvider.tsx](src/components/shared/ConfirmProvider.tsx)）— 自帶 destructive flag、可自訂按鈕文字、樣式跟主題對齊。`<ConfirmProvider>` 已包在 `/admin/layout.tsx` 與 `/captain/layout.tsx`；玩家 / display 路由若未來需要也要先加 provider

### 6.2 特殊頁面要求
- **`/admin/*` 桌面優先**（≥1280px 為主要設計斷點，**ThemeProvider 強制深色 + md 字級**，不跟玩家偏好）：可直接擺寬表格、側欄、多欄 dashboard；**手機仍須能訪問**（不破版、能看懂、能執行核心操作即可，不必逐元件響應式優化）
- **`/captain` 與 `/captain/scan` 手機優先**：關主在現場拿手機操作，必測直立／橫式切換、相機釋放。**必須使用 SWR/localStorage 等機制暫存快捷模組**，不可每次刷新都重撈。
- **`/`、`/stock` 玩家頁**：手機 / 桌面雙端皆要好。玩家金錢與健康始終公開顯示（健康寫入與顯示上限為 `100`），**福分與業力僅在 `ShowAllStats = true` 時顯示**。**頁面右上角必有「🔄 重新整理」按鈕**，點擊後 disabled 並顯示倒數，cooldown 秒數讀 `AppSettings.ManualRefreshCooldownSeconds`（預設 60，兩個玩家頁共用，後端 atomic 節流為主、前端 disable 為輔）。

- **「福分／福報」字眼可見範圍**（CRITICAL，含同義字）：
  - ✅ **可見**：admin / captain 後台所有頁面、看板（display/board）含 sparkline 與最終結算榜單、玩家最終結算後的歷史明細
  - 🟡 **`/onboarding` 抽命格**：保留福分 / 業力**欄位**讓 layout 一致，但**數值固定顯示「???」**不論哪種命格（避免一開始就暴露玩家自身命格的福分 / 業力）
  - ✅ **永遠可見**：`/` 玩家首頁的「命格」+「狀態」卡片列（位於四項數值卡上方）。狀態卡顯示當下 KarmaBand label（光明 / 平凡 / 微濁 / 渙散 / 迷失 / 墮落 等）。**ShowAllStats 控制的是「具體數值」（福分 / 業力的數字本身），不擋 label 文字**；狀態 label 反映業力區間、不暗示福分值，所以永遠顯示無衝突
  - ✅ **條件可見**：`/`、`/stock` 等玩家日常頁面在 `ShowAllStats=true` 時可顯示福分卡片
  - ❌ **不可見**（即使 ShowAllStats=true 也禁止）：`/exchange` 與 `/bank` 路由（CLAUDE.md §6.2）— 任何錯誤訊息、UI label、計算過程都不能含「福分」「福報」字眼
  - ❌ **依 ShowAllStats 隱藏**：玩家頁面的 settings 字體預覽、history 錯誤提示文字、地獄畫面死因說明 — `ShowAllStats=false` 時改用「指標」「隱藏參數」等籠統字眼
  - **server action 錯誤訊息**：玩家可見的 action（buyStock、sellStock、exchangeBlessing、borrowFromBank、repayBank、transferMoney 等）拋出 `INSUFFICIENT_FUNDS` / `INVALID_INPUT` 時不能直接寫「福分不足」，要改用「額度不足（最多 N 單位）」之類間接說法
- **`/exchange` 換匯所**：**禁止**在前台顯示任何福報相關資訊（餘額、消耗量）。玩家只看到「每方案最高可兌換現金」與「每單位獲得金錢」，選方案後輸入「兌換單位數」；後端靜默扣除福報。
- **`/bank` 銀行借貸**：**禁止**在前台顯示任何福報相關資訊（利率比例、福報扣除量、抵押計算過程）。錯誤訊息一律以「單位（unit）」表達不能用「福分不足」。玩家只看到借款金額與每回合利息（金錢）；每回合利息結算與福報扣除由後台 `tickRound` 靜默完成。**借款合約化（CRITICAL）**：每次 borrow → 新建一張 `PlayerLoan` 獨立 row（含 id / loan_label / principal / balance / 凍結的 base_interest_*）；還款 `repayBank({ loanId, amount })` 只減該合約 balance；利息結算每回合對每張未還清合約 `ROUND(base_interest * balance / principal)` 個別算（部分還款後利息按比例自動降）。前台顯示「合約清單」每張可獨立還款，**不可**用單一 `bank_loan` 總額還款。
- **`/transfer` 玩家轉帳**：**不預先列出任何玩家清單**。玩家需輸入完整 ID（≥ 6 碼）才觸發查詢；亦支援 QR 掃碼自動填入。找到後顯示對方卡片，未找到顯示錯誤。
- **`/stock` 股市**：有持股的卡片青綠色高亮，顯示「持股: N 股」與「預期賣出利潤」（(現價 - 均攤成本) × 持股數）；無持股的賣出按鈕灰暗 disabled；頁首額外顯示「庫存市值」。
- **`/admin/finance` 財務後台**：換匯所方案（每單位消耗福報、每單位換得金錢）與銀行借貸規則（借款金額、每回合福報扣除 %、每回合利息 %）的後台設定頁，支援新增 / 刪除方案；預覽欄位即時計算每回合扣除值。
- **`/captain/scan` 關主掃碼**：頁面頂部常駐「進行中列表」（玩家姓名 + 模組名），**localStorage 持久化**（key `captain_inprogress_v1_<userId>`）— 不小心刷新 / 離開頁面 / app 切到背景都不會遺失，下次回來自動還原。掃碼後玩家卡片顯示四項數值 + **道具列**（icon + 名稱，給關主判斷 `req_item_id` 是否符合），**不顯示持股資訊**（持股屬玩家股市視野）。主操作按鈕改為「加入進行列表（執行）」；進行列表每筆右側有「完成結算」按鈕。**完成結算走兩步驗證**：
  1. **驗證玩家身份 modal**：再掃一次玩家 QR 或輸入完整 ID（≥ 6 碼），ID 必須匹配進行列表那筆的 `player.user_id`，否則拒絕（QR 掃到不同玩家或 ID 不符 → toast 錯誤）。後端用輕量 server action `captainVerifyPlayerQr(token)` 只解 QR token 拿 user_id 不重新 lookup 整個 PlayerLookupResult
  2. **確認結算 modal**：預覽四項變動 + 發放道具，再按一次「確認結算」才呼叫 `applyQuickAction`
  防止關主誤觸把獎勵發給錯的人或誤扣分（特別是進行列表多人時容易混淆）
- **`/settings` 通用設定頁**：玩家 + 關主共用，含主題（深 / 淺）/ 字級（sm/md/lg/xl）/ **登出**。「返回」按鈕走 `router.back()` 動態回上一頁（玩家從 `/` 進、關主從 `/captain` 進都能正確返回）。`/captain` 與 `/` 玩家頁都在 header 加齒輪 icon 連結到此頁。
- **活動看板** `/display/board`：1920×1080 優先、字級 ≥ 24px、無滾動條、`pointer-events-none` 防誤觸；**ThemeProvider 強制深色**，不跟玩家偏好
- **股市曲線僅出現在看板** `/display/board`：sparkline 用 `<canvas>` 而非 SVG。**玩家股市頁 `/stock` 不顯示圖表**，只列商品 + 當前價格 + 漲跌箭頭，曲線分析屬於「現場感」由大屏看板提供

### 6.3 無障礙
- 漲跌**不能只靠紅綠色** — 必須加 ↑↓ 箭頭（色盲友善）
- 看板配色可後台切換「紅漲綠跌 / 綠漲紅跌」

---

## 7. 檔案配置慣例

```
app/
├── (auth)/login/
├── admin/
│   ├── page.tsx                # 總覽面板（工具列 5 鈕 + 3 KPI + 3 控制台 + 排行榜）
│   ├── accounts/page.tsx       # 帳號 CRUD（含 player 重置遊戲狀態）
│   ├── stations/page.tsx       # 關卡 + 關主指派
│   ├── stocks/page.tsx         # 股票列表 + 股市大盤回合腳本總表
│   ├── items/page.tsx          # 道具定義 CRUD
│   ├── events/page.tsx         # 三合一：事件 + 看板畫面設定 + display token
│   ├── finance/page.tsx        # 換匯所方案 + 銀行借貸方案
│   └── settings/page.tsx       # 7 區塊：顯示/計分/賣股扣分/重生/範本池/業力影響/危險區
├── captain/
│   ├── page.tsx                # 關主後台（快捷模組設定）
│   └── scan/page.tsx           # 關主前台掃碼（進行列表 + 完成結算 + 重生按鈕）
├── stock/                      # 玩家股市（持股庫存、預期利潤、買入/賣出）
├── exchange/                   # 換匯所（前台不顯示福報）
├── bank/                       # 銀行借貸（前台不顯示福報）
├── transfer/                   # 玩家轉帳（ID 查詢 + QR 掃碼）
├── display/board/              # 活動看板
├── actions/                    # Server Actions（player.ts, captain.ts, admin.ts, stock.ts, auth.ts）
└── page.tsx                    # 玩家首頁
```

> **完整目錄樹以架構文件 `docs/BOARD_GAME_V2_ARCHITECTURE.md` §4「元件目錄結構」為單一正本** — 含所有 admin 子路由、`/captain/actions`、`/history/[type]`、`/onboarding`、`/settings` 等。
> 此處保留簡化版方便 grep；與 ARCH §4 衝突時以 ARCH §4 為準。

關鍵 helper：
- `lib/db.ts` — pg 連線池（寫入 + 交易）
- `lib/supabase.ts` — Supabase client（讀取）
- `lib/auth.ts` — session / JWT / HMAC + `assertPlayerAlive` / `assertCaptainOfStation` / `requireRole` 等 guard
- `lib/settings.ts` — `getSetting` / `setSetting`（AppSettings 唯一存取入口）
- `lib/qr.ts` — QR token 簽章
- `components/ThemeProvider.tsx` — 主題切換（路由感知，`/admin` `/display` 強制深色）
- `components/QrButton.tsx` — 玩家 header QR 彈窗（資訊型 modal，非進入模式）

新增功能時：
- 新 server action → `app/actions/<role>.ts`（依角色分檔，不要全塞一個檔）
- 新 UI 元件 → `components/<role>/`
- 新 helper → `lib/`

---

## 8. 系統獨立性原則

本系統是**獨立部署**的活動小遊戲，不是任何主遊戲的子模組。寫程式碼時遵守：

- **自帶帳號**：使用 `Account` 表，不耦合任何外部使用者表
- **自帶設定**：使用 `AppSettings` 表，不共用其他系統的 settings
- **自帶交易記錄**：所有寫入皆 INSERT 至本系統的 `Transaction` 表
- **路由獨立**：每頁是 Next.js 獨立 route，**禁止**用全屏疊層彈窗作為「主要功能進入模式」（例如把整個換匯所做成 modal）。**例外**：資訊展示型彈窗（QR 顯示、確認對話、輕量提示）允許用 modal，不算進入模式
- **登入後依 `Account.role` 三向分流**：`admin` → `/admin`（桌面）；`captain` → `/captain`（手機）；`player` → `/`（玩家首頁）
- **角色互斥**：admin / player / captain 三選一；關主不參與遊戲（無 `PlayerStats` / `PlayerItem` / `StockHolding`）；想兼任請建立兩個帳號
- **middleware 強制路由保護**：非對應 role 直接 302 導回各自首頁，不靠前端隱藏入口擋人

---

## 9. 設計取捨備忘（為什麼這樣決定）

理解「為什麼」才能在邊緣情境做正確判斷：

| 決定 | 為什麼 |
|------|--------|
| 看板用 Realtime 推 + 60 秒 fallback 輪詢（混合） | 後台變更 < 1 秒推到看板，比舊 5 秒輪詢更即時；fallback 60 秒救援漏推與時間觸發事件；玩家端**不**開 Realtime（500 條 WS 會爆 quota） |
| 玩家端不輪詢，靠 action response 帶回新 stats | 主動操作直接拿回新值；被動變化（被關主套快捷、回合扣息）下拉刷新即可；徹底避開 500 人輪詢洪流 |
| 回合制由主持人按鈕推進（不用 cron） | Supabase 免費版無內建 cron；主持人按「下一回合」一次完成股價更新 + 利息結算，120 分鐘 12 回合彈性節奏 |
| `BoardConfig` 獨立於 `AppSettings` | Supabase Realtime 不支援 server-side filter；看板訂閱 `BoardConfig` 才不會被無關 settings 變動污染 |
| JWT payload 帶 role | middleware 純解碼即可路由保護，省掉每個 protected route hit 一次 DB query |
| 排行榜不用物化視圖 | 活動進行中**不公開即時排行**（避免玩家偏離劇情）；終局結算 500 列 ORDER BY 一次足矣 |
| 不鎖 `Stock` row | 股價以呼叫當下價成交，避免高併發買賣被序列化；接受極小機率價差 |
| 跑馬燈 TTL 上限 120 分鐘（可調 `BoardMarqueeMaxMinutes`） | 對齊單場 2 小時活動，防跨場殘留；長期訊息改用「事件」 |
| 事件入表、跑馬燈走設定 | 事件需排程／優先順序所以結構化；跑馬燈是即時、單一字串 |
| 用 `pg` + Supabase 雙 client | pg 負責交易完整性、Supabase 負責方便讀寫，各取所長 |
| QR token TTL 5 分鐘 | 防外流冒用；前端每 60 秒刷新足夠 |
| 角色三分（admin/player/captain）互斥 | 關主不參與遊戲，邏輯較單純；同一人若要兼玩，請另開玩家帳號（`Station.captain_user_ids` 仍保留為 M:N 站 ↔ 關主指派關係） |
| 股市玩家 ↔ 大會（系統）交易、無 P2P 撮合 | 活動情境不需要真實市場；省去訂單簿、撮合引擎、對手盤的複雜度 |
| 股票檔數上限 ≤ 10 | 2 小時活動、玩家認知負荷有限；過多檔反而稀釋互動 |
| `/admin` 桌面優先、`/captain*` 手機優先 | 管理員多在桌機操作大表格；關主在現場用手機掃碼 |

---

## 10. 開發流程

### 10.1 改動前
1. 讀 `docs/BOARD_GAME_V2.md` 確認功能規格
2. 讀 `docs/BOARD_GAME_V2_ARCHITECTURE.md` 確認資料模型與設計取捨
3. 讀本檔確認規則

### 10.2 寫完之後（自審）
1. **N+1 自審**：每個 server action 的 DB 查詢次數應與資料量無關
2. **Server Action 加 query counter**（dev mode）：超過閾值警告
   ```ts
   if (queryCount > 5) console.warn(`[N+1?] ${actionName} ran ${queryCount} queries`)
   ```
3. **桌面 + 手機都測**：DevTools 切 mobile viewport
4. **新增設定 key 確認走 helper**

### 10.3 提交前
- 跑 `npm run lint`
- 確認沒有 `console.log` 殘留含敏感資料
- migration SQL 在 `supabase/migrations/` 並有遞增 prefix

### 10.4 兩階段 Prompt（給 AI 自己用）
不要在同一輪對話「寫功能 + 審查」— AI 不會挑自己剛寫的毛病。
- 第一輪：「寫這個 server action」
- 第二輪：「以 N+1 視角審視，列出每個 DB 查詢實際會跑的次數」

---

## 11. 紅旗清單（PR review 必查）

### 資料庫
- [ ] `for (...) { await db.query() }` 對 DB call
- [ ] `Promise.all(items.map(i => db.query()))` 沒改成批次或嵌套
- [ ] 字串拼接 SQL（如 `` `WHERE name = '${input}'` ``）
- [ ] 多表寫入沒有用 pg 交易包裹
- [ ] 對 `Stock` row 加 `FOR UPDATE` 鎖（**禁止**，股價以呼叫當下 `current_price` 成交即可）
- [ ] tx 內呼叫 `getSetting(key)` / `getSettings(keys)` / `setSetting(...)` 沒傳 `client`（→ 占第 2 個 connection；應改 `getSetting(key, client)` 走同一 tx，CLAUDE.md §3.2）
- [ ] 玩家寫入 action 同時用 `assertNotDuringFinalScoring(client)` + `assertNotTourMode(client)`（→ 2 個 round-trip；應改 `assertNotFrozen(client)` 一行搞定，CLAUDE.md §3.2）
- [ ] 同 tx 內多次連續 `UPDATE` / `INSERT` / `UPSERT` 沒合併成 CTE（→ 每多 1 個 round-trip ~20ms，500 並發累計 p95 拖慢 0.3-1s；用 `WITH paid AS (UPDATE ... RETURNING), holding AS (INSERT ... RETURNING), tx AS (INSERT ...) SELECT ...` 模式合併。CLAUDE.md §3.2 / 範例見 [stock.ts buyStock](src/app/actions/stock.ts)）

### 安全
- [ ] `dangerouslySetInnerHTML` 套到玩家輸入
- [ ] `NEXT_PUBLIC_` 前綴包敏感 key
- [ ] Server Action 信任前端傳入的 `actorUserId`（一律以 session 為準）
- [ ] 密碼明文比對（應該比對雜湊）
- [ ] Token 沒帶 `exp` 或 nonce
- [ ] 角色檢查只看前端 cookie / query 而沒重新驗 session
- [ ] 關主操作沒驗 `Station.captain_user_ids` 是否包含自己（即使 `role==='captain'` 也要查指派站）
- [ ] 重生操作沒驗 `Station.allow_rebirth = true`（即使是該站關主也不能在未開放的站執行重生）
- [ ] 重生操作沒驗目標玩家「當前處於地獄狀態」（`health ≤ 0 || blessing ≤ 0`）—— pg tx 內必須即時讀 `PlayerStats` 二次驗證，未死亡的玩家直接 reject `PLAYER_NOT_DEAD`，防止關主對非死亡玩家任意重置
- [ ] 重生 server action 接受手動輸入的 `targetUserId` 而非 `lookupPlayerByQR` 解碼結果（必須走 QR 掃碼路徑，不可繞過）。`/captain/scan` 雖然有「手動輸入 ID」UI 但只用於套用快捷模組；`scanned.source === 'manual'` 時前端不顯示重生按鈕，且 `rebirthPlayer` action 仍只收 `qrToken` 參數，後端無法被繞過
- [ ] `applyQuickAction` 沒檢查 `Station` / `QuickAction` 的 `player_max_uses` / `global_max_uses`（任一達上限應拒絕，回 `USAGE_LIMIT_EXCEEDED`）
- [ ] 計數更新（`UPSERT StationUsage` / `QuickActionUsage` + `UPDATE global_use_count`）沒包在套用變動的同一 pg tx（會導致超發）
- [ ] 玩家 `getMyStats` / `getStockMarket` 的 `manual=true` 路徑沒做 server-side 60 秒節流（只靠前端 disable 按鈕會被繞過）；正確做法是用 `UPDATE ... WHERE last_manual_refresh_at < now() - interval '60s' RETURNING true` 的 atomic SQL，rowcount=0 直接回 `REFRESH_RATE_LIMITED`
- [ ] `tickRound` 沒驗 `BoardConfig.last_tick_at` 距今 ≥ 30 秒（防主持人連按 / 重複觸發）；通過後再做股價更新與利息結算
- [ ] 玩家寫入操作（換匯、轉帳、股市買賣）沒檢查死亡狀態（`health ≤ 0 || blessing ≤ 0` → 拒絕，回傳 `PLAYER_DEAD`）
- [ ] 股票相關 server action 沒檢查 `role==='player'`（admin / captain 不該下單）
- [ ] `tickRound` 沒驗 `BoardGameEnabled === 'true'`（遊戲未開始就能推進回合）或 `final_scoring_triggered_at IS NULL`（已結算還能 tick）
- [ ] `buyStock` 沒驗 `current_price > 0`（fixed=0 暴跌劇情下玩家可 free 拿股）
- [ ] admin StocksClient 編輯回合腳本 cell：把 `num === 0` 當作刪除條件（破壞 fixed=0 / percent=0 兩種合法值）

### 設定
- [ ] 直接 `.from('AppSettings').select()` 而非走 `getSetting` helper
- [ ] 新增 setting key 沒在 `lib/settings.ts` 同步登錄
- [ ] 換匯倍率 `ExchangeRateMultiplier` **只在後端結算 `exchangeBlessing` 套、沒在前台列表 `listExchangeOptionsForPlayer` 套**（玩家會看到舊 rate，輸入後實際入帳跟顯示不一致）；或前後端套用公式不一致（必須都用 `ROUND(per_unit × mult) × units`，不是 `ROUND(per_unit × units × mult)`）
- [ ] 換匯 / 銀行 / 借款的「自訂」彈窗用 `window.prompt`（mobile Safari / 部分桌面 Chrome 會靜默擋）— 改用內建 modal
- [ ] schema 改了（如 migration 新增 / 移除 / 重新命名欄位）但其他 server action 還在 SELECT 舊欄位（會丟 PG「column does not exist」被 fail() 包成「伺服器發生錯誤」）。改 schema 後必須 grep 該欄位名確認所有用法都對齊新 schema

### UI
- [ ] 寫死 px 沒考慮手機版
- [ ] 玩家 / 關主前台路由用 `text-[Npx]` 寫死字級 — 字級偏好設定會無法縮放，**必須改 `text-[Nrem]`**（10px → `text-[0.625rem]`、11px → `text-[0.6875rem]`）；後台 / 看板因強制 md 不受此限
- [ ] 漲跌只用紅綠沒加箭頭（color-blind 友善必加 ↑↓）；**flat / 持平**用 `lucide Minus` icon（`−` 形狀）會被誤認為「股價是負數」，要改成 invisible spacer 維持對齊
- [ ] 觸控目標 < 44px
- [ ] 用 `window.confirm` / `window.alert`（→ mobile Safari 會擋；改用 `useConfirm()`，CLAUDE.md §6.1）
- [ ] Scanner 沒用 dynamic import 導致 SSR 錯誤
- [ ] **淺色模式**新增的半透明色（`bg-zinc-XXX/40` `/50` `/95`、`bg-emerald-950/40`、`bg-rose-950/40`、`bg-amber-950/30`、`bg-sky-950/40`、`border-emerald-900/60` 等）沒在 `globals.css` 的 `[data-theme="light"]` 區塊覆蓋 → 淺色頁面會看到深底深字無法閱讀。新增類別前先 grep `globals.css` 確認有覆蓋，否則同步補。**已補的色系**：`bg-zinc-950/{30,70,85}`、`bg-{amber/emerald/teal/rose/purple/sky}-500/{10,15,20}`、`border-{amber/emerald/teal/rose/purple/sky}-500/30`、`border-zinc-{700,800}/{50,60}`、`text-{purple/sky}-400`、`text-yellow-300`、`text-amber-500`
- [ ] 看板 `/display/board` 終局結算後 toggle 「返回常規模式」無效 — 不可寫 `isFinal = forceFinal || final_scoring_triggered_at`（被 server 鎖死），要改成 `userOverride !== null ? userOverride : serverIsFinal` 讓 user 真的能切回看股市
- [ ] 看板風雲榜 regular 模式（14% 窄欄）若用 sticky thead 會視覺脫節 → 整個 thead 不渲染，圓圈+姓名自明
- [ ] 玩家日常頁（地獄畫面 / settings 預覽 / history 提示）`ShowAllStats=false` 時直接寫「福分」「業力」字眼 → 違反 §6.2 字眼可見範圍（必須改用「指標」「隱藏參數」籠統字眼，admin / captain 後台 / onboarding / 最終結算可見）
- [ ] PlayerHomeClient 地獄畫面進入條件少了 `!stats.final_scoring_at` → 終局結算後玩家無法回首頁查明細（規格 §1 / V2 下地獄機制：`is_dead && !tour_mode && !final_scoring_at`）
- [ ] 終局結算後玩家首頁福分 / 業力 仍受 `ShowAllStats` 控制顯示鎖頭 → 違反 V2 §6.2「玩家最終結算後的歷史明細」可見規格。正確條件：`stats.show_all_stats || stats.final_scoring_at` 任一為真就解鎖
- [ ] 終局結算後玩家首頁的「換匯所 / 銀行借貸 / 轉帳」按鈕仍是 `<Link>` → 玩家點下去才被後端拒絕，UX 差。正確：套 `<DisabledAction>` 占位元件直接 disable 顯示「已結算停用」
- [ ] 終局結算後玩家首頁沒揭曉 modal → 違反規格。實作：`FinalScoreModal` 顯示排名（含 🥇🥈🥉）+ 最終分數 + 命格 / 狀態 + 四項數值（每格右下淺色 watermark icon `opacity-10 w-16 h-16`，跟玩家首頁同風格），含「不再顯示」checkbox（localStorage key `final_score_dismissed_<userId>` 存的是 `final_scoring_at` 時間戳，下一場 admin 重啟後會自動失效）。每次回首頁就會重新檢查 localStorage。**注意**：(1) server 回傳的時間戳可能是 Date / ISO string，序列化來回格式不一致 → 寫入與讀取兩端都要走 `new Date(x).toISOString()` 正規化；(2) useEffect 內判斷後**必須 explicit `setShowFinalModal(boolean)`**，不能只在「該顯示時」呼叫 setState，否則前次顯示後 re-render 可能卡在 true。**注意**：(1) server 回傳的時間戳可能是 Date / ISO string，序列化來回會格式不一致 → 寫入與讀取兩端都要走 `new Date(x).toISOString()` 正規化；(2) useEffect 內判斷後**必須 explicit `setShowFinalModal(boolean)`**，不能只在「該顯示時」呼叫 setState，否則前次顯示後 re-render 可能卡在 true
- [ ] 揭曉彈窗的「下載成績圖片」按鈕用 static import 拉 `html-to-image` → 增加首頁初始 bundle ~30KB，多數玩家不會點。改用 dynamic `import('html-to-image')` 在 onClick 內觸發；截圖前用 `captureRef` 限制範圍（不含 checkbox / 下載 / 確認 button），且 `toPng` 套 `backgroundColor: '#18181b'` + `pixelRatio: 2` 確保淺色主題使用者也得到深底高解析度成績圖
- [ ] 揭曉彈窗截圖 amber 邊框消失、buttons 跑進去 → captureRef 沒包完整成績卡。正確 DOM 結構：dialog overlay → dialog shell（單純 bg + p-4 + scroll，無邊框）→ `captureRef`（含 amber 邊框 + 上緣金漸層 + 標題 + 排名 + 6 格 + 提示）→ 兄弟 buttons（下載 / checkbox / 確認，不會出現在截圖）
- [ ] 揭曉彈窗截圖**強制深色**（不論玩家當下主題）→ 違反規格。正確做法：**跟著當下主題**——讀 `document.documentElement.dataset.theme === 'light'` 決定 `toPng({ backgroundColor: ... })` 用 `#ffffff`（淺）或 `#18181b`（深）；玩家自己選什麼模式就下載什麼模式
- [ ] 揭曉彈窗截圖只用 `<a download>` → iPhone Safari 體驗差（彈出「下載項目」要去檔案 app 找）。正確：先試 `navigator.canShare({ files: [file] })`，可用就 `navigator.share(...)` 開系統 share sheet（iOS 跳「儲存圖片」直接存相簿）；不支援的環境 fallback `<a download>`。`AbortError`（使用者取消）視為成功不報錯
- [ ] 命格 / 狀態卡片設了 `show_all_stats` 條件 → 違反規格。兩張卡都「永遠顯示」；狀態 label 反映業力區間、不暗示福分值，與 ShowAllStats 無關（ShowAllStats 只擋具體數值的數字本身）
- [ ] 排行榜算分搬回 JS 端（撈全部 → JS sort + slice）→ 違反現行設計。**現行設計：score 預存在 `PlayerStats.final_score`**，每次 `tickRound` Tx2 結尾 / 改 `ScoreWeight*` / `triggerFinalScoring` / `rebirthPlayer` 都會重算（見 `lib/score.ts` 的 `recomputeAllPlayerScores` / `recomputePlayerScore`）。Leaderboard 查詢直接 `ORDER BY ps.final_score DESC LIMIT N`。**不要再下 LIMIT 但忘了 ORDER BY** — 那會隨機截掉高分玩家（已踩過坑）
- [ ] `/display/board` 「展開最終榜單」按鈕在活動進行中也顯示 → 違反規格（按鈕**僅** `serverIsFinal === true` 時才出現，避免在公開看板讓觀眾 preview 終局結算未發生時的排名）
- [ ] `/display/board` 常規模式仍渲染風雲榜 panel → 違反規格（`!isFinal` 時 panel **完全隱藏**，重點趨勢 + 行情總表 flex 自然填滿）
- [ ] `/display/board` 終局風雲榜限制只顯示前 10 名 / 沒可見 scrollbar / 點擊 header 排序無效 → 違反規格。正確做法：(1) 撈全部、前端不 slice；(2) panel 套 `pointer-events-auto` 覆蓋 main 的 `pointer-events-none` 讓主持人可點排序 + 滾動；(3) 用 `.board-final-scroll` 顯示明顯的 amber scrollbar（不是 `.no-scrollbar`）；(4) header 副標寫「共 N 人」提示總人數
- [ ] `restartGameCycle` 把 `BoardConfig.featured_stock_ids` 一起 reset → 違反規格（admin 設好的看板曲線商品**場次間保留**，只重置場次狀態：current_round / last_tick_at / marquee / final_scoring_triggered_at）
- [ ] `drawDestiny` 在沒有 active 命格範本時走 `Initial*` AppSettings fallback → 違反規格（migration 0013 移除這條路徑；無範本直接 throw `CONFLICT`，要求 admin 必須先建立至少一個 active 範本）
- [ ] 命格 / 狀態 顏色用 `karma` 值動態推算（emerald / amber / orange / rose 五色梯度）→ 違反規格（改用 `InitialValueTemplate.theme` / `KarmaBand.theme` 由 admin 設定的 6 色 enum，前端 `THEME_PALETTE` 對應）
- [ ] Display Token 撤銷後直接呼叫 `deleteDisplayToken` 也允許 → 違反規格（後端 guard 只允許 `revoked_at IS NOT NULL OR expires_at < now()` 的 token 被刪除，前端只在已撤銷 / 已過期 row 顯示「刪除紀錄」按鈕）

---

## 12. 效能目標（驗收門檻）

| 指標 | 目標 |
|------|------|
| 玩家操作 p95 latency | < 300ms |
| 看板資料更新延遲 | **< 1 秒**（Realtime 推播）/ 60 秒 fallback 救援漏推 |
| 5xx 錯誤率 | < 0.1% |
| DB 連線池使用率 | < 80% |
| Vercel function duration | < 1s |

上線前壓測：用 k6 / artillery 模擬 **500 人**同時在線 + **120 req/s** 股市買賣（玩家主動下單峰值）+ 玩家「進頁面 / 下拉刷新」混合腳本（≈ 8 req/s，不輪詢）+ 主持人每 10 分鐘按「下一回合」（`tickRound`）+ 3 台看板每 60 秒 fallback 拉取（變動本身走 Realtime，不在壓測腳本內）；500 人時 PgBouncer transaction mode（6543）為強制要求，不能直連 5432。

---

## 13. 參考文件

| 檔案 | 用途 |
|------|------|
| `docs/BOARD_GAME_V2.md` | 功能規格（給 PM／設計／需求討論） |
| `docs/BOARD_GAME_V2_ARCHITECTURE.md` | 系統架構（資料模型、流程、效能、加密、N+1 詳解） |
| 本檔 | AI 協作規範與檢查清單（每次開工必讀） |
