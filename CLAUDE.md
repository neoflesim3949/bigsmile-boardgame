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
- 玩家進入頁面時若 `AppSettings.CardDrawMode==='true'` 且 `destiny_name=NULL` → middleware 強制導 `/onboarding` 抽命格範本（隨機從啟用中 `InitialValueTemplate` 抽一張）；抽完才能進 `/`。**觸發條件不是「首次登入」**：只要兩條件同時成立（抽卡模式開啟 + 尚無命格）就會被導向，無論第幾次進站。若 `CardDrawMode==='false'` 或玩家已有 `destiny_name`，自行進 `/onboarding` 一律被擋回 `/`
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

後台路由 `/admin/settings` 提供 **6 個 section** 的參數設定頁面：

| 區塊 | 涵蓋的內容 |
|------|------------|
| 數值顯示設定 | `ShowAllStats`（單一 toggle，控制玩家是否看見福分／業力。健康／金錢始終可見） |
| 最終計分權重 | `ScoreWeightMoney`（建議 0.05）、`ScoreWeightBlessing`（建議 200）、`ScoreWeightKarma`（建議 150，扣除）；公式：`金錢×W_m + 福分×W_b − 業力×W_k`，健康不參與計分 |
| 預設新手初始值 | `InitialMoney`、`InitialHealth`、`InitialBlessing`、`InitialKarma`（命格範本不可用時的 fallback） |
| 重生後初始值 | `RebirthMoney`、`RebirthHealth`（最高 100）、`RebirthBlessing`、`RebirthKarma`（與新玩家初始值**分開管理**） |
| 新手命格範本池 | `InitialValueTemplate` 表 CRUD（多個範本，啟用中隨機抽取） |
| 危險操作區（Danger Zone） | 5 個按鈕（重置會員明細 / 刪除所有會員 / 重置股價歷史 / 刪除所有股票 / 重置使用次數），**每個按鈕需經過 3 次確認彈窗才會執行**。**「重置會員明細」**：清空玩家四項數值 / 命格 / 持股 / 借貸 / 道具 + **玩家四項值的 Transaction 明細**（`DELETE WHERE user_id IN (player accounts)`），保留 Account |

**這頁不含**：
- **活動時間 / 遊戲狀態旗標**（`BoardGameEnabled` / `CardDrawMode` / `TourMode`）→ 在 `/admin` 總覽面板的工具列
- **換匯倍率**（`ExchangeRateMultiplier`）→ 在 `/admin` 總覽面板的「換匯所即時權重控制」
- **換匯方案 / 銀行借貸方案**（`ExchangeOption` / `BankLoanOption`）→ 在 `/admin/finance`
- **看板版型 / 跑馬燈 / display token** → 在 `/admin/events`

最終計分由管理員按 `/admin` 工具列的「遊戲結束(計分)」觸發（`triggerFinalScoring`），結果推送至看板與玩家端。

### 總覽面板（`/admin`）

`/admin` 是管理員的核心儀表板，**唯一**控制遊戲整體節奏的地方。三大功能群：

**A. 頂部工具列（5 鈕）**
- 「導覽遊戲」toggle → `setQuickFlag('TourMode', bool)`。**TourMode=true 時**：(1) 玩家不需抽命格也能瀏覽所有頁面（middleware 跳過導向 `/onboarding`）；(2) 即使 health/blessing ≤ 0 不顯示地獄畫面；(3) **所有玩家 / 關主寫入 action 後端用 `assertNotTourMode()` 一律拒絕**（換匯 / 轉帳 / 股市 / 借貸 / 套用快捷模組 / 重生）；玩家頁面顯示 sky 色 banner 提示「導覽中」
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
- **即時跑馬燈廣播**：textarea + 發送 / 清除 → `publishMarquee` / `clearMarquee`，TTL 上限由 `BoardMarqueeMaxMinutes` 控制
- **換匯所即時權重控制**：`-50%` / `-20%` / `0%` / `+50%` / `+100%` / 自訂 6 鈕 → `setExchangeRateMultiplier`，倍率套在 `ExchangeOption.money_gain_per_unit` 上。**「自訂」用內建 modal**（不要用 `window.prompt` — mobile Safari / 部分桌面 Chrome 會靜默擋）。**前後端必須同時套用倍率且公式一致**：`listExchangeOptionsForPlayer` 與 `exchangeBlessing` 都用 `effective_per_unit = round(money_gain_per_unit × mult)`、`total = effective_per_unit × units`（先 round 再乘，避免「顯示 +200、實際 +199」的 rounding 爭議）。**禁止**只在後端套倍率不在前端 list 套，否則玩家看到的「將獲得」與實際入帳會不一致

**C. 排行榜（前 50 名）**
即時依 `ScoreWeight*` 計算 `final_score = money×W_m + blessing×W_b − karma×W_k`。**計算在 JS 端做**（避免 PG 對 `int * float-text-param` 的 cast 推導失敗）。

---

## 6. UI 規則

### 6.1 響應式（鐵則）
- **每個 UI 變更同時考慮桌面與手機**（除 `/admin/*` 例外）
- Tailwind 響應式 prefix：`md:` / `lg:`
- 觸控目標 ≥ 44px
- 避免 `fixed` / `absolute` 元素在小螢幕互相覆蓋
- 寫死 px（`w-96`、`p-10`、`text-5xl`）必須有手機版對應

### 6.2 特殊頁面要求
- **`/admin/*` 桌面優先**（≥1280px 為主要設計斷點，**ThemeProvider 強制深色 + md 字級**，不跟玩家偏好）：可直接擺寬表格、側欄、多欄 dashboard；**手機仍須能訪問**（不破版、能看懂、能執行核心操作即可，不必逐元件響應式優化）
- **`/captain` 與 `/captain/scan` 手機優先**：關主在現場拿手機操作，必測直立／橫式切換、相機釋放。**必須使用 SWR/localStorage 等機制暫存快捷模組**，不可每次刷新都重撈。
- **`/`、`/stock` 玩家頁**：手機 / 桌面雙端皆要好。玩家金錢與健康始終公開顯示（健康寫入與顯示上限為 `100`），**福分與業力僅在 `ShowAllStats = true` 時顯示**。**頁面右上角必有「🔄 重新整理」按鈕**，點擊後 disabled 並顯示倒數，cooldown 秒數讀 `AppSettings.ManualRefreshCooldownSeconds`（預設 60，兩個玩家頁共用，後端 atomic 節流為主、前端 disable 為輔）。

- **「福分／福報」字眼可見範圍**（CRITICAL，含同義字）：
  - ✅ **可見**：admin / captain 後台所有頁面、看板（display/board）含 sparkline 與最終結算榜單、`/onboarding` 抽命格揭露、玩家最終結算後的歷史明細
  - ✅ **條件可見**：`/`、`/stock` 等玩家日常頁面在 `ShowAllStats=true` 時可顯示福分卡片
  - ❌ **不可見**（即使 ShowAllStats=true 也禁止）：`/exchange` 與 `/bank` 路由（CLAUDE.md §6.2）— 任何錯誤訊息、UI label、計算過程都不能含「福分」「福報」字眼
  - ❌ **依 ShowAllStats 隱藏**：玩家頁面的 settings 字體預覽、history 錯誤提示文字、地獄畫面死因說明 — `ShowAllStats=false` 時改用「指標」「隱藏參數」等籠統字眼
  - **server action 錯誤訊息**：玩家可見的 action（buyStock、sellStock、exchangeBlessing、borrowFromBank、repayBank、transferMoney 等）拋出 `INSUFFICIENT_FUNDS` / `INVALID_INPUT` 時不能直接寫「福分不足」，要改用「額度不足（最多 N 單位）」之類間接說法
- **`/exchange` 換匯所**：**禁止**在前台顯示任何福報相關資訊（餘額、消耗量）。玩家只看到「每方案最高可兌換現金」與「每單位獲得金錢」，選方案後輸入「兌換單位數」；後端靜默扣除福報。
- **`/bank` 銀行借貸**：**禁止**在前台顯示任何福報相關資訊（利率比例、福報扣除量、抵押計算過程）。錯誤訊息一律以「單位（unit）」表達不能用「福分不足」。玩家只看到借款金額與每回合利息（金錢）；每回合利息結算與福報扣除由後台 `tickRound` 靜默完成。**借款合約化（CRITICAL）**：每次 borrow → 新建一張 `PlayerLoan` 獨立 row（含 id / loan_label / principal / balance / 凍結的 base_interest_*）；還款 `repayBank({ loanId, amount })` 只減該合約 balance；利息結算每回合對每張未還清合約 `ROUND(base_interest * balance / principal)` 個別算（部分還款後利息按比例自動降）。前台顯示「合約清單」每張可獨立還款，**不可**用單一 `bank_loan` 總額還款。
- **`/transfer` 玩家轉帳**：**不預先列出任何玩家清單**。玩家需輸入完整 ID（≥ 6 碼）才觸發查詢；亦支援 QR 掃碼自動填入。找到後顯示對方卡片，未找到顯示錯誤。
- **`/stock` 股市**：有持股的卡片青綠色高亮，顯示「持股: N 股」與「預期賣出利潤」（(現價 - 均攤成本) × 持股數）；無持股的賣出按鈕灰暗 disabled；頁首額外顯示「庫存市值」。
- **`/admin/finance` 財務後台**：換匯所方案（每單位消耗福報、每單位換得金錢）與銀行借貸規則（借款金額、每回合福報扣除 %、每回合利息 %）的後台設定頁，支援新增 / 刪除方案；預覽欄位即時計算每回合扣除值。
- **`/captain/scan` 關主掃碼**：頁面頂部常駐「進行中列表」（玩家姓名 + 模組名）。掃碼後玩家卡片**不顯示持股資訊**。主操作按鈕改為「加入進行列表（執行）」；進行列表每筆右側有「完成結算」按鈕，點後移除該筆並觸發後端結算。
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
│   └── settings/page.tsx       # 6 區塊：顯示/計分/新手/重生/範本池/危險區
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
- [ ] Scanner 沒用 dynamic import 導致 SSR 錯誤
- [ ] **淺色模式**新增的半透明色（`bg-zinc-XXX/40` `/50` `/95`、`bg-emerald-950/40`、`bg-rose-950/40`、`bg-amber-950/30`、`bg-sky-950/40`、`border-emerald-900/60` 等）沒在 `globals.css` 的 `[data-theme="light"]` 區塊覆蓋 → 淺色頁面會看到深底深字無法閱讀。新增類別前先 grep `globals.css` 確認有覆蓋，否則同步補
- [ ] 看板 `/display/board` 終局結算後 toggle 「返回常規模式」無效 — 不可寫 `isFinal = forceFinal || final_scoring_triggered_at`（被 server 鎖死），要改成 `userOverride !== null ? userOverride : serverIsFinal` 讓 user 真的能切回看股市
- [ ] 看板風雲榜 regular 模式（14% 窄欄）若用 sticky thead 會視覺脫節 → 整個 thead 不渲染，圓圈+姓名自明
- [ ] 玩家日常頁（地獄畫面 / settings 預覽 / history 提示）`ShowAllStats=false` 時直接寫「福分」「業力」字眼 → 違反 §6.2 字眼可見範圍（必須改用「指標」「隱藏參數」籠統字眼，admin / captain 後台 / onboarding / 最終結算可見）

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
