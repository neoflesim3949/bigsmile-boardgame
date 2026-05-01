# 開運大富翁 — 系統架構文件

**系統名稱**：開運大富翁（Board Game）
**建立日期**：2026-04-28
**編輯者**：Neo Huang
**規劃文件**：[BOARD_GAME_V2.md](./BOARD_GAME_V2.md)
**定位**：獨立部署的活動型小遊戲系統

---

## 目錄

1. [架構總覽](#1-架構總覽)
2. [角色與權限](#2-角色與權限)
3. [資料模型](#3-資料模型)
4. [頁面路由](#4-頁面路由)
5. [Server Actions](#5-server-actions)
6. [系統設定](#6-系統設定)
7. [關鍵流程](#7-關鍵流程)
8. [股市價格驅動機制](#8-股市價格驅動機制)
9. [QR Code 與掃碼流程](#9-qr-code-與掃碼流程)
10. [安全性與授權](#10-安全性與授權)
11. [活動看板](#11-活動看板)
12. [玩家與關主介面結構](#12-玩家與關主介面結構)
13. [傳輸加密與資料安全](#13-傳輸加密與資料安全)
14. [效能與容量規劃](#14-效能與容量規劃)
15. [部署與環境](#15-部署與環境)

---

## 1. 架構總覽

```
┌──────────────────────────────────────────────────────────┐
│                    大會後台 (Admin)                       │
│  排行榜｜參數設定｜關卡｜關主指派｜股市商品｜道具定義       │
└──────────────────────────────────────────────────────────┘
              │ 管理參數
              ▼
┌──────────────────────────────────────────────────────────┐
│                    關主後台 (Captain Admin)               │
│  快捷功能模組設定（金錢/健康/福分/業力 +/-）              │
└──────────────────────────────────────────────────────────┘
              │ 綁定快捷模組
              ▼
┌──────────────────────────────────────────────────────────┐
│                    關主前台 (Captain Front)               │
│  掃描玩家 QR → 檢視狀態 → 套用快捷模組或發放道具          │
└──────────────────────────────────────────────────────────┘
              │ 寫入交易
              ▼
┌──────────────────────────────────────────────────────────┐
│                    使用者介面 (Player)                    │
│  四項參數｜換匯所｜道具列表｜玩家互轉金錢｜進入股市      │
└──────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────┐
│                    股市介面 (Stock Market)                │
│  曲線圖｜代碼／點選下單｜庫存買賣                         │
└──────────────────────────────────────────────────────────┘

旁支：投放至活動現場大屏／投影機
┌──────────────────────────────────────────────────────────┐
│                   活動看板 (Event Board)                  │
│  重點曲線｜行情總表｜事件｜跑馬燈｜token 授權             │
└──────────────────────────────────────────────────────────┘
```

### 系統定位
- **完全獨立**：自帶帳號、權限、設定與交易資料表，不依賴外部遊戲系統的資料
- 採用單一 PostgreSQL 資料庫統一儲存帳號、遊戲參數、交易紀錄
- 前端 Next.js（App Router）；寫入操作走 Server Actions + pg 顯式交易，讀取走 Supabase JS

### 技術棧建議
- **前端**：Next.js 14+（App Router）、React、Tailwind CSS
- **資料庫**：PostgreSQL（自架或 Supabase）
- **後端**：Next.js Server Actions + `pg` 連線池（交易型寫入）+ Supabase JS（一般讀寫）
- **掃碼**：`html5-qrcode` 或同類套件，動態 import 避免 SSR
- **部署**：Vercel + Supabase（推薦）；或自架 Docker

---

## 2. 角色與權限

| 角色 | 識別方式 | 可訪問頁面 |
|------|----------|------------|
| 大會管理員 | `Account.role === 'admin'` | 大會後台 + 所有頁面 |
| 關主 | `Account.role === 'captain'` | 關主後台、關主前台 |
| 玩家 | `Account.role === 'player'` | 使用者介面、股市介面 |
| 活動看板 | 顯示 token（無對應 Account） | 活動看板（唯讀） |

> **角色互斥**：一個 `Account` 只擁有一個 role。關主**不參與遊戲本身**（無 `PlayerStats`、無道具、無持股），純粹是發放分數的工具人；想兼任請建立兩個帳號（不同 `login_id`）。
> `Station.captain_user_ids` 仍保留為「站 ↔ 關主」的 M:N 指派關係（一站可多位關主、一位關主可指派多站），但**身份判斷只看 `Account.role`**，越權檢查才查陣列。

### 認證方式
- **玩家登入**：採用免密碼設計，使用「**玩家 ID** (`user_id` 或是 `login_id`)」+「**姓名** (`name`)」進行登入。系統比對此兩欄位完全相符且帳號啟用 (`is_active=true`) 即可登入。
- **管理員 / 關主登入**：固定使用「**帳號 (`login_id`)**」+「**密碼 (`password_hash`)**」登入（管理員建議啟用兩步驟驗證）。
- 登入狀態以 HTTP-only cookie + JWT 維持。
- 三向分流：登入後依 `Account.role` 直接導向對應入口（admin → `/admin`、captain → `/captain`、player → `/`）。

---

## 3. 資料模型

### 3.1 帳號表

#### `Account` — 使用者帳號
| 欄位 | 型別 | 說明 |
|------|------|------|
| `user_id` | TEXT PK | 玩家唯一識別（UUID 或自訂編號） |
| `name` | TEXT | 顯示名稱 |
| `login_id` | TEXT UNIQUE NULL | 登入帳號（關主/管理員登入用；玩家亦可作為短 ID 輸入用） |
| `password_hash` | TEXT NULL | bcrypt / argon2 雜湊（玩家免密碼，此欄可為 NULL） |
| `role` | TEXT | `'admin'` / `'player'` / `'captain'`（互斥） |
| `is_active` | BOOLEAN | 是否啟用 |
| `created_at` | TIMESTAMPTZ | |

> 角色互斥（admin / player / captain 三選一）。`role='captain'` 不參與遊戲，無對應 `PlayerStats` / `PlayerItem` / `StockHolding` 列。
> `Station.captain_user_ids` 是「站 ↔ 關主」M:N 指派關係，不是身份判斷依據；身份僅看 `Account.role`。

### 3.2 核心遊戲表

#### `PlayerStats` — 玩家四項參數
| 欄位 | 型別 | 說明 |
|------|------|------|
| `user_id` | TEXT PK FK→Account | 玩家 UserID |
| `destiny_name` | TEXT NULL | 抽取的命格名稱。若為 NULL 代表尚未抽取。玩家登入時若發現為 NULL，需強制引導至抽卡畫面，由玩家「手動點擊抽取」後再寫入初始數值與命格名稱。 |
| `money` | INTEGER | 金錢 |
| `health` | INTEGER `CHECK (health BETWEEN 0 AND 100)` | 健康（**DB 強制 0–100**；應用層寫入時亦需 cap 於 100，違反 CHECK 會拋錯） |
| `blessing` | INTEGER | 福分 |
| `karma` | INTEGER | 業力 |
| `rebirth_count` | INTEGER | 重生次數（預設 0）。玩家被關主執行重生時遞增。 |
| `bank_loan` | INTEGER | 當前銀行借款金額（預設 0） |
| `loan_updated_at` | TIMESTAMPTZ | 上次結算借款利息的時間（若無借款則為 NULL） |
| `last_manual_refresh_at` | TIMESTAMPTZ NULL | 上次玩家「**手動點重新整理**」的時間；用於 60 秒節流（讀 `AppSettings.ManualRefreshCooldownSeconds`，預設 `'60'`） |
| `updated_at` | TIMESTAMPTZ | 最後更新時間 |

> **回合集中結算（不在讀取時計算）**：利息**不再**每次讀寫順便計算。改為主持人按下「下一回合」按鈕時，server action `tickRound()` 在同一個 pg tx 內：
> 1. 套用本回合的股價變化 → 寫入 `Stock.current_price` + `StockHistory`
> 2. 掃描所有 `bank_loan > 0` 的玩家，依 `BankInterestBlessingAmount` 扣 blessing、更新 `loan_updated_at`
> 3. 若任一玩家 blessing 被扣至 ≤ 0 → 觸發地獄狀態（不額外存旗標，前端進頁面時即時計算）
>
> `loan_updated_at` 仍保留為「上一次結算時間」用於稽核與重新計息（例：玩家中途還款後再借）。
> Supabase 免費版無自動 cron，刻意設計為「主持人按鈕」推進，整場活動主持人按 12 次（120 分鐘 / 10 分鐘），同步推進股價節奏與借款利息。

#### `Station` — 關卡
| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | UUID PK | 關卡 ID |
| `name` | TEXT | 關卡名稱 |
| `description` | TEXT | 關卡描述 |
| `captain_user_ids` | TEXT[] | 指派的關主 UserID 陣列（多位） |
| `allow_rebirth` | BOOLEAN | 該關卡的關主是否可使用「重生鍵」（預設 `false`） |
| `player_max_uses` | INTEGER NULL | 活動期間**每位玩家**最多在此關卡被套用快捷模組的次數（NULL = 不限） |
| `global_max_uses` | INTEGER NULL | 活動期間**全場**該關卡最多被套用的累計次數（NULL = 不限） |
| `global_use_count` | INTEGER DEFAULT 0 | 全場累計使用次數（每次 `applyQuickAction` 同一 pg tx 內 +1） |
| `is_active` | BOOLEAN | 是否啟用 |
| `created_at` | TIMESTAMPTZ | |

> `allow_rebirth = true` 時，該關卡關主在掃碼後會額外顯示「重生」按鈕，可將玩家四項參數重設為重生初始值（讀取 `AppSettings` 的 `RebirthMoney` / `RebirthHealth` / `RebirthBlessing` / `RebirthKarma`）。

#### `InitialValueTemplate` — 新手初始值範本
| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | UUID PK | |
| `label` | TEXT UNIQUE | 範本名稱（例：「富貴命」「清修命」） |
| `emoji` | TEXT | 卡面圖示 emoji（後台輸入） |
| `description` | TEXT | 卡面描述短文（後台輸入） |
| `theme` | TEXT CHECK IN (`'amber'`, `'teal'`, `'purple'`, `'rose'`, `'sky'`, `'zinc'`) | 色系枚舉，前端對應 Tailwind palette；不接受 hex 色碼（Tailwind JIT 限制） |
| `rarity_label` | TEXT | 稀有度標籤（自由輸入字串，例：「稀有」「普通」「神秘」） |
| `money` | INTEGER | 初始金錢 |
| `health` | INTEGER `CHECK (health BETWEEN 0 AND 100)` | 初始健康 |
| `blessing` | INTEGER | 初始福分 |
| `karma` | INTEGER | 初始業力 |
| `is_active` | BOOLEAN | 是否納入抽卡池 |
| `created_at` | TIMESTAMPTZ | |

> 管理員可建立多個範本。新玩家抽卡時從「啟用中」範本隨機取一個，連同視覺欄位（emoji / description / theme / rarity_label）一起回給前端 onboarding 頁。若無啟用範本，回退使用 `AppSettings` 的 `InitialMoney` / `InitialHealth` / `InitialBlessing` / `InitialKarma`，視覺套預設值。
> **為什麼 `theme` 是枚舉**：Tailwind JIT 必須在編譯期看到完整的 class 字串才會生成樣式，所以後台不能存任意 hex 色碼讓前端動態套用。改採「色系名稱」由後台選擇、前端維護一份固定的 `theme → Tailwind class` palette（見 `src/app/onboarding/OnboardingClient.tsx` 的 `THEME_PALETTE`）。新增色系流程：先在 palette 加一筆，再在 schema CHECK 加值。

#### `QuickAction` — 關主快捷功能模組
| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | UUID PK | |
| `station_id` | UUID FK→Station | 所屬關卡 |
| `owner_user_id` | TEXT FK→Account | 建立的關主 UserID |
| `label` | TEXT | 顯示名稱（例：「完成挑戰 +50 金錢」） |
| `delta_money` | INTEGER | 金錢變動（正/負） |
| `delta_health` | INTEGER | 健康變動 |
| `delta_blessing` | INTEGER | 福分變動 |
| `delta_karma` | INTEGER | 業力變動 |
| `bound_item_id` | UUID NULL FK→Item | 綁定的道具（NULL = 無道具） |
| `req_money` | INTEGER NULL | 前提條件：金錢最低門檻（NULL = 不檢查） |
| `req_health` | INTEGER NULL | 前提條件：健康最低門檻（NULL = 不檢查） |
| `req_blessing` | INTEGER NULL | 前提條件：福分最低門檻（NULL = 不檢查） |
| `req_karma` | INTEGER NULL | 前提條件：業力最低門檻（NULL = 不檢查） |
| `req_item_id` | UUID NULL FK→Item | 前提條件：必須持有的道具（NULL = 不檢查） |
| `player_max_uses` | INTEGER NULL | 活動期間**每位玩家**最多被套用此快捷模組的次數（NULL = 不限） |
| `global_max_uses` | INTEGER NULL | 活動期間**全場**累計最多套用次數（NULL = 不限；例：「中獎 +1000」全場只發 5 次） |
| `global_use_count` | INTEGER DEFAULT 0 | 全場累計使用次數（每次 `applyQuickAction` 同一 pg tx 內 +1） |
| `created_at` | TIMESTAMPTZ | |

> 一個快捷模組可同時調整多項參數，並可選擇性綁定道具發放。
> `req_*` 欄位為可選前提條件：Null = 不檢查；有值時玩家必須 ≥ 該值（或持有該道具）方可執行。條件不符時後端回傳未達標清單，前端彈窗顯示。
> 限額（`player_max_uses` / `global_max_uses`）任一超出 → 後端拒絕，回 `USAGE_LIMIT_EXCEEDED` 並附訊息（哪個 cap 觸發）。

#### `StationUsage` — 每位玩家在每個關卡的使用次數
| 欄位 | 型別 | 說明 |
|------|------|------|
| `station_id` | UUID FK→Station | |
| `user_id` | TEXT FK→Account | |
| `count` | INTEGER DEFAULT 0 | 該玩家對該關卡的累計使用次數 |
| `updated_at` | TIMESTAMPTZ | |
| **PK** | | (`station_id`, `user_id`) |

> 每次 `applyQuickAction` 同一 pg tx 內 UPSERT (`station_id`, `user_id`) `count += 1`；檢查時與 `Station.player_max_uses` 比對。

#### `QuickActionUsage` — 每位玩家在每個快捷模組的使用次數
| 欄位 | 型別 | 說明 |
|------|------|------|
| `quickaction_id` | UUID FK→QuickAction | |
| `user_id` | TEXT FK→Account | |
| `count` | INTEGER DEFAULT 0 | 該玩家對該快捷模組的累計使用次數 |
| `updated_at` | TIMESTAMPTZ | |
| **PK** | | (`quickaction_id`, `user_id`) |

> 每次 `applyQuickAction` 同一 pg tx 內 UPSERT (`quickaction_id`, `user_id`) `count += 1`；檢查時與 `QuickAction.player_max_uses` 比對。

#### `Item` — 道具定義
| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | UUID PK | |
| `name` | TEXT | 道具名稱（手術執照、財神爺 BUFF…） |
| `icon` | TEXT | 圖示路徑或 emoji |
| `description` | TEXT | 描述 |
| `is_active` | BOOLEAN | 是否啟用 |
| `created_at` | TIMESTAMPTZ | |

#### `PlayerItem` — 玩家持有道具
| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | UUID PK | |
| `user_id` | TEXT FK→Account | 玩家 UserID |
| `item_id` | UUID FK→Item | 道具 ID |
| `granted_by` | TEXT FK→Account | 發放關主的 UserID |
| `granted_at` | TIMESTAMPTZ | 發放時間 |

> 同一個道具同一玩家僅持有一份（unique constraint on `user_id + item_id`）。

### 3.3 股市相關表

#### `Stock` — 股市商品定義
| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | UUID PK | |
| `code` | TEXT UNIQUE | 股票代碼（玩家可輸入） |
| `name` | TEXT | 商品名稱 |
| `current_price` | INTEGER | 當前價格 |
| `is_visible` | BOOLEAN | 前台列表是否顯示（`false` 時玩家仍可透過代碼搜尋購買） |
| `is_sellable` | BOOLEAN | 此商品玩家買入後是否可賣回給系統（`false` = 不可賣） |
| `created_at` | TIMESTAMPTZ | |

#### `StockHistory` — 股價歷史（用於繪製曲線）
| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | BIGSERIAL PK | |
| `stock_id` | UUID FK→Stock | |
| `price` | INTEGER | 價格快照 |
| `recorded_at` | TIMESTAMPTZ | 記錄時間 |

> 後台調整 `current_price` 時，自動 INSERT 一筆歷史紀錄。前台曲線讀取最近 N 筆。

#### `StockHolding` — 玩家持股
| 欄位 | 型別 | 說明 |
|------|------|------|
| `user_id` | TEXT FK→Account | |
| `stock_id` | UUID FK→Stock | |
| `shares` | INTEGER | 持有股數 |
| `avg_cost` | INTEGER | 平均成本（顯示用，可選） |
| `updated_at` | TIMESTAMPTZ | |
| **PK** | | (`user_id`, `stock_id`) |

### 3.4 活動看板相關

#### `Event` — 活動事件（後台預設，輪播於看板底部「事件」列）
| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | UUID PK | |
| `title` | TEXT | 內部識別名稱 |
| `text` | TEXT | 看板顯示文字 |
| `start_at` | TIMESTAMPTZ NULL | 開始時間（NULL = 立即生效） |
| `end_at` | TIMESTAMPTZ NULL | 結束時間（NULL = 永久直到關閉） |
| `priority` | INTEGER | 排序權重，數字越大越優先 |
| `is_active` | BOOLEAN | 是否啟用 |
| `created_at` | TIMESTAMPTZ | |

> 看板載入時取所有 `is_active = true` 且當前時間在 `[start_at, end_at]` 區間內的事件，依 `priority DESC, created_at DESC` 輪播。

#### `BoardConfig` — 看板設定（單列表）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | INTEGER PK CHECK (id = 1) | 強制單列 |
| `title` | TEXT | 看板頁首主標題（預設 `'開運大富翁 ── 大廳'`） |
| `featured_stock_ids` | UUID[] | 重點曲線指定的商品 ID（最多 4 檔） |
| `color_scheme` | TEXT | `'red_up'` 或 `'green_up'`（預設 `'red_up'`） |
| `event_rotate_seconds` | INTEGER | 多筆事件輪播間隔，預設 `8` |
| `marquee_text` | TEXT | 跑馬燈即時文字（可空） |
| `marquee_until` | TIMESTAMPTZ NULL | 跑馬燈自動清除時間（NULL = 不自動清除） |
| `final_scoring_triggered_at` | TIMESTAMPTZ NULL | 最終計分觸發時間（NULL = 尚未計分） |
| `current_round` | INTEGER | 目前回合編號（每次 `tickRound` +1，從 0 開始） |
| `last_tick_at` | TIMESTAMPTZ NULL | 上次主持人按下「下一回合」的時間 |
| `updated_at` | TIMESTAMPTZ | |

> **為什麼獨立成單列表**：看板 Realtime 訂閱專用，避免訂閱 `AppSettings` 整表時被無關 key（`ScoreWeight*` / `BankInterestBlessingAmount` / 初始值等）的更新事件污染。Supabase Realtime 不支援 server-side filter by key，分流是唯一乾淨解。
> 寫入仍走 admin server action，所有變更寫 `Transaction`（`tx_type='settings_update'`）。

### 3.5 交易紀錄

#### `Transaction` — 統一交易日誌
| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | BIGSERIAL PK | |
| `user_id` | TEXT FK→Account | 受影響玩家 |
| `actor_user_id` | TEXT NULL FK→Account | 執行者（關主／管理員／NULL=玩家自己） |
| `tx_type` | TEXT | `quick_action` / `item_grant` / `exchange` / `transfer` / `stock_buy` / `stock_sell` / `settings_update` / `account_update` / `rebirth` / `bank_borrow` / `bank_repay` / `bank_interest` / `final_scoring` |
| `payload` | JSONB | 各 type 的細節（金額、商品 ID、轉出/轉入對象…） |
| `created_at` | TIMESTAMPTZ | |

> 所有寫入操作皆需 INSERT 一筆，作為稽核與排行榜計算依據。

### 3.6 財務方案與借貸

#### `ExchangeOption` — 換匯所方案（後台 CRUD）
| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | UUID PK | |
| `label` | TEXT | 方案名稱（後台識別用） |
| `blessing_cost_per_unit` | INTEGER `> 0` | 每單位消耗多少福報 |
| `money_gain_per_unit` | INTEGER `> 0` | 每單位獲得多少金錢 |
| `display_order` | INTEGER | 玩家頁排序權重（小→上） |
| `is_active` | BOOLEAN | 是否啟用 |
| `created_at` | TIMESTAMPTZ | |

> 玩家輸入「兌換單位數 N」→ 後端扣 `N × blessing_cost_per_unit` 福報、加 `N × money_gain_per_unit` 金錢。前台**禁止**顯示 `blessing_cost_per_unit`（CLAUDE.md §6.2）。

#### `BankLoanOption` — 銀行借貸方案
| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | UUID PK | |
| `label` | TEXT | 方案名稱 |
| `blessing_collateral_per_unit` | INTEGER `> 0` | 每單位抵押多少福報 |
| `money_per_unit` | INTEGER `> 0` | 每單位可借入多少金錢 |
| `interest_money_per_round` | INTEGER `≥ 0` | 每回合每單位扣的金錢利息 |
| `interest_blessing_per_round` | INTEGER `≥ 0` | 每回合每單位扣的福分（後台靜默扣，前台不顯示） |
| `display_order` | INTEGER | 玩家頁排序權重 |
| `is_active` | BOOLEAN | 是否啟用 |
| `created_at` | TIMESTAMPTZ | |

#### `PlayerLoan` — 玩家當前借貸（多方案）
| 欄位 | 型別 | 說明 |
|------|------|------|
| `user_id` | TEXT FK→Account | |
| `loan_option_id` | UUID FK→BankLoanOption | |
| `units` | INTEGER `≥ 0` | 借入單位數 |
| `borrowed_at` | TIMESTAMPTZ | 首次借的時間 |
| `updated_at` | TIMESTAMPTZ | |
| **PK** | | (`user_id`, `loan_option_id`) |

> 玩家可同時持有多筆不同方案的借款。`PlayerStats.bank_loan` 仍保留為「當前所有借款的金錢餘額總和」cache（每次 borrow / repay / tickRound 結算時同步更新），方便讀取顯示。
> 額度計算：「此方案最高可借總單位 = `FLOOR(當前福報 / blessing_collateral_per_unit)`；本次可新增單位 = `MAX(0, 最高 - 已持有單位)`」。
> 重生時 `DELETE FROM PlayerLoan WHERE user_id = $userId`，同步 `PlayerStats.bank_loan = 0` / `loan_updated_at = NULL`。

#### `DisplayToken` — 活動看板存取憑證
| 欄位 | 型別 | 說明 |
|------|------|------|
| `jti` | TEXT PK | HMAC token 內含的 nonce |
| `label` | TEXT | 內部識別（哪台螢幕／用途） |
| `expires_at` | TIMESTAMPTZ | TTL（活動天數 + 1） |
| `revoked_at` | TIMESTAMPTZ NULL | 撤銷時間（NULL = 仍有效） |
| `created_by` | TEXT FK→Account NULL | 發行的管理員 |
| `created_at` | TIMESTAMPTZ | |

> 看板 URL 形如 `/display/board?token=...`。token 為 HMAC-SHA256 簽章（`jti + exp`），`/display/board` server component 驗 token + 比對 `DisplayToken` row 未撤銷即可放行。

### 3.7 系統設定

#### `AppSettings` — 鍵值式全域設定
| 欄位 | 型別 | 說明 |
|------|------|------|
| `key` | TEXT PK | 設定鍵 |
| `value` | TEXT | 設定值（字串，必要時前端解析為數字／布林） |
| `updated_at` | TIMESTAMPTZ | |
| `updated_by` | TEXT FK→Account NULL | 最後修改者 |

> 採用 upsert 策略，新 key 第一次儲存即建立。所有設定改動皆寫入 `Transaction`（`tx_type='settings_update'`）。

---

## 4. 頁面路由

| 路由 | 角色 | 說明 |
|------|------|------|
| `/login` | 全部 | 登入頁 |
| `/admin` | 管理員 | 大會後台儀表板（排行榜、回合控制、總覽） |
| `/admin/accounts` | 管理員 | 帳號 CRUD（admin / player / captain；列表 + 搜尋）。**player 角色額外提供「重置遊戲狀態」按鈕**（清四項數值、命格、持股、借貸、道具，保留帳號） |
| `/admin/stations` | 管理員 | 關卡 CRUD（含 `allow_rebirth`、限額） + 關主指派 |
| `/admin/stocks` | 管理員 | 股市商品列表（≤ 10 檔） |
| `/admin/stocks/[id]` | 管理員 | 單一股票編輯 + 回合腳本 |
| `/admin/items` | 管理員 | 道具定義 CRUD |
| `/admin/events` | 管理員 | 後台事件管理 + 跑馬燈發布 |
| `/admin/board` | 管理員 | 看板版型 / display token / 回合控制面板 |
| `/admin/finance` | 管理員 | 財務設定（換匯所方案、銀行借貸規則） |
| `/admin/settings` | 管理員 | 參數設定頁（活動時間、匯率、比分權重、新手參數、重生參數） |
| `/captain` | 關主 | 關主後台首頁（巨大掃碼入口 + 快捷模組列表） |
| `/captain/actions` | 關主 | 快捷模組編輯（建立 / 修改 / 刪除四項參數變動規則） |
| `/captain/scan` | 關主 | 關主前台掃碼介面（進行列表 + 完成結算 + 重生按鈕） |
| `/onboarding` | 玩家 | 命格抽取頁面。玩家無法自行進入；**唯一合法觸發條件**為：抽卡模式已啟用 AND 玩家 `destiny_name` 為 NULL AND 玩家重新整理頁面。其他任何情況嘗試進入此頁均將被強制導向 `/`。 |
| `/` | 玩家 | 玩家首頁：四項數值卡（點擊進 `/history/[type]`）+ 道具列表 + 入口卡（連往 `/exchange` / `/bank` / `/transfer` / `/stock`）+ header 三鈕（QR 彈窗 / 重新整理 / 設定） |
| `/stock` | 玩家 | 股市介面（商品列表 + 當前價 + 漲跌箭頭 + 持股庫存 + 預期利潤 + 買賣；**不顯示曲線圖**） |
| `/exchange` | 玩家 | 換匯所（前台不顯示福報，只顯示最高可兌現金與每單位獲得金錢） |
| `/bank` | 玩家 | 銀行借貸（前台完全不顯示福報相關資訊） |
| `/transfer` | 玩家 | 玩家轉帳（輸入完整 ID 或 QR 掃碼查詢後轉帳） |
| `/history/[type]` | 玩家 | 四項數值明細（type = `money` / `health` / `blessing` / `karma`）；福分 / 業力受 `ShowAllStats` 與 `BoardConfig.final_scoring_triggered_at` 雙重控管 |
| `/settings` | 玩家 | 玩家個人偏好設定（字體大小、深色 / 淺色模式，設定值存於 localStorage，預設深色模式） |
| `/display/board` | 活動看板 | 公開展示行情、事件、跑馬燈（需 display token，無互動，**永遠深色強制**） |

> 採用 Next.js App Router，每個頁面為獨立 route，不使用全屏疊層彈窗的進入模式。
> middleware 依 `Account.role` 強制路由保護：非 admin 不能進 `/admin/*`、非 captain 不能進 `/captain/*`、非 player 不能進 `/`、`/stock`。
> `/admin` 桌面優先（≥1280px），手機可訪問但不專門優化版面；`/captain` 與 `/captain/scan` 手機優先（現場操作）。
> 玩家登入後若 `BoardGameEnabled === 'false'` 顯示「活動尚未開始」訊息，並停用所有寫入按鈕（admin 不受限、captain 端會顯示「等候活動開始」字樣但仍可操作以利測試）。

---

### 遊戲啟動前置流程

管理員在 `/admin` 總覽面板正式按下「遊戲開始」之前，必須逐一啟用以下兩個前置模式（兩個都啟用後「遊戲開始」按鈕才會解鎖）：

#### 1. 導覽遊戲（Tour Mode）

- **定義**：啟用後，系統進入「全頁面製作核對」模式。玩家可以瀏覽所有路由，但所有寫入按鈕（買賣、轉帳、抽卡等）均被停用。
- **目的**：讓工作人員在正式張羅前核對各頁面資訊是否正確，確認介面沒有問題。
- **模式啟用後**：系統設定為 `GameState = 'touring'`（未實作），各頁面可查知 context 致使改變顯示狀態。
- **此模式為啟動遊戲的必要前置條件。**

#### 2. 抽卡模式（Card Draw Mode）

- **定義**：啟用後，middleware 會對所有登入中的玩家進行檢查。
- **觸發條件（三者同時成立）**：
  1. `CardDrawMode === true`（抽卡模式已啟用）
  2. 玩家的 `destiny_name` 為 NULL（尚未抽卡）
  3. 玩家主動重新整理頁面（refresh）
- **目的**：確保每位玩家在正式開始前完成命格抽取，載入初始金錢、福分、健康、業力至資料庫。
- **抽卡完成**：寫入 `destiny_name` 與初始數值至資料庫。第二次登入或重新整理不再導向。
- **防護邏輯**：玩家無法自行導航至 `/onboarding`。middleware 檢查若不符合上述條件就強制導向 `/`（玩家首頁）。
- **此模式僅用於活動開始前的抽籤階段**，正式遊戲開始後通常不允許再次重置命格。


#### 鎖定邏輯

```
導覽遊戲 ✓  AND  抽卡模式 ✓
             ↓
「遊戲開始」按鈕解鎖 → 設定 BoardGameEnabled = true
```

### 危險操作區 (Danger Zone) 重置邏輯

位於 `/admin/settings` 最底部，所有操作需經過 **3 次確認彈窗**才會執行，無法復原。

| 操作 | 清除範圍 | 保留資料 |
|------|----------|----------|
| **重置會員明細** | 金錢、福分、健康、業力、命格（destiny_name）、持股記錄、借貸紀錄、換匯紀錄 | 帳號（Account 資料列） |
| **刪除所有會員** | 所有玩家 Account 資料、命格、交易記錄（全表清除） | — |
| **重置股價歷史** | 所有股票歷史價格記錄與曲線，股價回復為初始設定價格 | 股票商品定義（名稱、代碼、設定值） |
| **刪除所有股票** | 所有股市商品定義、持股記錄、歷史價格 | — |
| **重置使用次數** | 道具與關卡項目的使用記錄次數（`use_count` 歸零） | 道具定義、玩家財富資料 |

> **實作注意**：所有危險操作均應以單一 PostgreSQL 顯式交易執行，並在 `Transaction` 資料表寫入 `tx_type='danger_zone_reset'` 記錄，包含操作者帳號與時間戳。任何子操作失敗均需 rollback。

### 玩家偏好設定（Player Preferences）

位於 `/settings`，由玩家自行調整個人顯示偏好，設定值存於 **localStorage**（無需寫入資料庫）。

| 設定項目 | 選項 | 預設值 |
|----------|------|--------|
| **字體大小** | 小 / 標準 / 大 / 特大 | 標準 |
| **顯示模式** | 深色 / 淺色 | 深色 |

- 設定立即套用，不需按儲存。
- 以 `data-theme` attribute 掛在 `<html>` 或根容器，CSS 變數自動切換顏色方案。
- 以 `data-font-size` attribute 控制根字體尺寸（`sm` / `md` / `lg` / `xl`）。

### 元件目錄結構（單一正本，CLAUDE.md / V2 別處出現的樹圖一律以此為準）

```
src/app/
├── layout.tsx                     # 根 layout（含 ThemeProvider）
├── page.tsx                       # 玩家首頁（QR 彈窗 + 四項數值卡 + 入口卡 + 道具）
├── login/page.tsx                 # 登入頁
├── onboarding/page.tsx            # 命格抽卡（觸發條件：CardDrawMode=true AND destiny_name=NULL AND 玩家 refresh；非首次登入自動進入）
├── settings/page.tsx              # 玩家偏好（字體大小、深色／淺色）
├── history/[type]/page.tsx        # 四項數值明細（money / health / blessing / karma）
├── stock/page.tsx                 # 股市（不畫圖表，只列商品 + 價格）
├── exchange/page.tsx              # 換匯所
├── bank/page.tsx                  # 銀行借貸
├── transfer/page.tsx              # 玩家轉帳
├── captain/
│   ├── page.tsx                   # 關主後台首頁
│   ├── actions/page.tsx           # 快捷模組編輯
│   └── scan/page.tsx              # 關主掃碼前台
├── admin/
│   ├── layout.tsx                 # 後台共用 layout
│   ├── page.tsx                   # Dashboard（總覽 + 回合控制）
│   ├── accounts/page.tsx          # 帳號 CRUD（含 player 重置遊戲狀態）
│   ├── stations/page.tsx          # 關卡 + 關主指派
│   ├── stocks/page.tsx            # 股票列表
│   ├── stocks/[id]/page.tsx       # 單檔股票編輯 + 回合腳本
│   ├── items/page.tsx             # 道具定義
│   ├── events/page.tsx            # 事件 + 跑馬燈
│   ├── board/page.tsx             # 看板版型 + display token + 回合控制
│   ├── finance/page.tsx           # 換匯所方案 + 銀行借貸規則
│   └── settings/page.tsx          # 全域參數設定
├── display/board/page.tsx         # 活動看板（強制深色，display token 授權）
└── actions/                       # Server Actions（player.ts, captain.ts, admin.ts, stock.ts, auth.ts）

src/components/
├── ThemeProvider.tsx              # 主題切換器（路由感知，/admin /display 強制深色）
├── QrButton.tsx                   # 玩家 header 的 QR 彈窗 component
├── Admin/ Captain/ Player/ Stock/ Display/ shared/

src/lib/
├── db.ts                          # pg 連線池（寫入 + 交易）
├── supabase.ts                    # Supabase client（讀取）
├── auth.ts                        # session、JWT、HMAC、assertPlayerAlive helper
├── settings.ts                    # AppSettings helper
└── qr.ts                          # QR token 簽章

supabase/migrations/               # SQL migration（遞增 prefix）
```

---

## 5. Server Actions

**檔案配置**：`app/actions/` 內依角色拆分（`player.ts`、`captain.ts`、`admin.ts`、`stock.ts`、`auth.ts`）

> 所有 server action 開頭一律呼叫 `requireSession()` 取得 `{ userId, role }`，並依該 action 所屬角色檢查 `role`。**禁止信任前端傳入的 actor**。

### 5.0 共用

| Function | 說明 | 交易需求 |
|----------|------|----------|
| `requireSession()` | 解碼 JWT，回傳 payload `{ userId, role, name }`（**不打 DB**，role 已在 token 內），未登入或簽章失敗則 throw | 無 |
| `getMyProfile()` | 同 `requireSession`，前端用來判斷導向；無需 DB query | 無 |
| `assertCaptainOfStation(userId, stationId)` | 驗 `role='captain'` 且 `userId ∈ Station.captain_user_ids`，否則 throw | 無 |

### 5.1 玩家端

| Function | 說明 | 交易需求 |
|----------|------|----------|
| `getMyStats({ manual?: boolean })` | 取得四項參數、道具列表、持股。`manual=true`（玩家點「重新整理」按鈕）時會以**單一 atomic SQL** 強制 60 秒節流：`UPDATE PlayerStats SET last_manual_refresh_at = now() WHERE user_id = $1 AND (last_manual_refresh_at IS NULL OR last_manual_refresh_at < now() - interval 'N seconds') RETURNING true`；rowcount = 0 → throw `REFRESH_RATE_LIMITED`（附 `retryAfterSeconds`）。`manual=false`（進頁面初次載入、action response）不節流 | 視情況：manual=true 為 pg tx |
| `exchangeBlessingToMoney(userId, amount)` | 福報換金錢（單向） | pg tx |
| `transferMoney(fromUserId, toUserId, amount)` | 玩家間金錢互轉 | pg tx |
| `buyStock(userId, stockId, shares)` | 買進股票（對於 `is_visible = false` 的隱藏商品，只要能傳入正確的 stockId 亦可購買） | pg tx |
| `sellStock(userId, stockId, shares)` | 賣出股票（操作前需驗證該商品 `is_sellable = true`，若不可賣則拒絕） | pg tx |
| `getStockMarket({ manual?: boolean, queryCode?: string })` | 取得股市商品。`queryCode` 為空時取得所有 `is_visible = true` 商品的當前價格；若帶入 `queryCode` 則精準回傳該代碼的商品（無論顯示與否，供隱藏商品購買）。`manual=true` 時共用 `last_manual_refresh_at` 60 秒節流 | 視情況 |

### 5.2 關主端

| Function | 說明 | 交易需求 |
|----------|------|----------|
| `listMyQuickActions(captainUserId)` | 列出該關主已建立的快捷模組 | 無 |
| `upsertQuickAction(payload)` | 新增/編輯快捷模組 | 無 |
| `deleteQuickAction(id)` | 刪除快捷模組 | 無 |
| `lookupPlayerByQR(qrToken)` | QR 解碼 → 取得玩家四項參數與道具；同時回傳該關卡 `allow_rebirth` 供前端決定是否顯示重生按鈕 | 無 |
| `applyQuickAction(captainUserId, targetUserId, quickActionId)` | 套用快捷模組：(1) 驗條件 (2) **驗使用次數限額**（QuickAction / Station 各自的 player_max_uses / global_max_uses，任一超出回 `USAGE_LIMIT_EXCEEDED`）(3) 套用四項參數變動（health 寫入時 cap 100）(4) UPSERT `StationUsage` / `QuickActionUsage` `count += 1`、UPDATE `Station.global_use_count` / `QuickAction.global_use_count` += 1 | pg tx |
| `grantItem(captainUserId, targetUserId, itemId)` | 單獨發放道具 | pg tx |
| `rebirthPlayer(captainUserId, targetUserId, stationId)` | 重生玩家：四項參數重設為重生初始值（健康最高 100）、清空 `bank_loan` 與 `loan_updated_at`、**清空 `StockHolding`（所有持股歸零）**、**清空 `PlayerItem`（所有道具刪除，含手術執照、財神爺 BUFF 等身份識別道具）**、解除死亡 | pg tx |
| `borrowBank(userId, amount)` | 銀行貸款：檢查 `amount ≤ blessing * BankLoanCapacityRatio - bank_loan`，增加金錢與借款，寫入 `loan_updated_at` | pg tx |
| `repayBank(userId, amount)` | 銀行還款：扣除金錢，減去 `bank_loan`，若還清則清空 `loan_updated_at` | pg tx |

### 5.3 大會管理員端

| Function | 說明 | 交易需求 |
|----------|------|----------|
| `getLeaderboard(orderBy)` | 排行榜（依四項或最終分） | 無 |
| `setExchangeRate(rate)` | 設定福報→金錢匯率 | 無 |
| `upsertStation(payload)` | 新增/編輯關卡（含 `allow_rebirth` 旗標） | 無 |
| `deleteStation(stationId)` | 刪除關卡 | 無 |
| `assignCaptains(stationId, userIds)` | 指派關主（多位） | 無 |
| `updateGameSettings(payload)` | 統一更新參數設定（活動時間、匯率、比分權重、新手參數、重生參數；批次 upsert `AppSettings`） | 無 |
| `upsertStock(payload)` | 新增/編輯股市商品 | 無 |
| `setStockPrice(stockId, price)` | 即時手動調整單檔股價（不等回合，自動寫入歷史） | pg tx |
| `tickRound(overrides?)` | **主持人按「下一回合」**：拆兩個短 pg tx 完成 — Tx1 更新 10 檔股價 + `BoardConfig.current_round += 1`；Tx2 用**單條批次** UPDATE PlayerStats + INSERT…SELECT Transaction 結算所有借款玩家利息（每回合固定金額，不做比例計算）。30 秒 debounce 防誤點 | 兩個 pg tx |
| `setStockPriceRule(rule)` | 設定 `AppSettings.StockPriceRule`（下回合用的漲跌規則） | 無 |
| `resetStockHistory()` | **每場活動開場前手動觸發**：`DELETE FROM "StockHistory"`（清空股價歷史，避免上場活動的曲線殘留到本場）；同時將 `BoardConfig.current_round` 重置為 0；寫一筆 `Transaction`（`tx_type='settings_update'`，payload 註明 reset stock history）；**僅 admin 可執行，前端二次確認** | pg tx |
| `archiveStockHistory(label)` | （可選）將當前 `StockHistory` 全表搬到 `StockHistoryArchive` 表並打標籤；用於賽後保留稽核資料 | pg tx |
| `resetUsageCounters()` | **每場活動開場前手動觸發**：`TRUNCATE StationUsage, QuickActionUsage`；同步將所有 `Station.global_use_count` / `QuickAction.global_use_count` 歸 0；寫一筆 `Transaction`（`tx_type='settings_update'`）；**僅 admin、前端二次確認** | pg tx |
| `upsertItem(payload)` | 新增/編輯道具定義 | 無 |
| `setBoardGameEnabled(enabled)` | 開關整個遊戲 | 無 |
| `listAccounts(filter)` | 列出帳號（支援 role 篩選、姓名 / login_id 模糊搜尋、分頁） | 無 |
| `createAccount(payload)` | 建立帳號（payload 含 `role`：admin / player / captain）；player 自動建 `PlayerStats` 初始列 | pg tx |
| `updateAccount(userId, payload)` | 編輯姓名、login_id、`is_active`；不允許改 role（改 role 走 `changeRole`） | 無 |
| `changeRole(userId, newRole)` | 切換角色；player→captain 須先確認沒有未結清持股；captain→player 自動建立 `PlayerStats` | pg tx |
| `resetPassword(userId)` | 重設密碼（產生臨時密碼回傳一次，後續以 hash 儲存） | 無 |
| `deactivateAccount(userId)` | 停用帳號（軟下線；保留歷史交易） | 無 |
| `resetPlayerStats(userId)` | 重設玩家四項參數至初始值（僅 player） | pg tx |
| `clearPlayerInventory(userId)` | 清空玩家道具與持股（測試或誤發復原） | pg tx |
| `bulkImportAccounts(csv)` | CSV 批次匯入（活動前一次建好玩家／關主） | pg tx |
| `issueDisplayToken(payload)` | 發行活動看板的 display token（TTL、用途備註） | 無 |
| `revokeDisplayToken(token)` | 撤銷指定 display token | 無 |
| `setBoardLayout(layout)` | 設定活動看板版型（重點曲線商品、配色） | 無 |
| `upsertEvent(payload)` | 新增／編輯後台事件 | 無 |
| `deleteEvent(id)` | 刪除事件 | 無 |
| `listEvents(filter)` | 列出事件（含已過期；支援啟用狀態與時間區間過濾） | 無 |
| `publishMarquee(text, ttlMinutes)` | 臨時發布跑馬燈（寫 `BoardConfig.marquee_text` + `marquee_until`；`ttlMinutes` 上限讀 `AppSettings.BoardMarqueeMaxMinutes`） | 無 |
| `clearMarquee()` | 立即清除跑馬燈 | 無 |
| `triggerFinalScoring()` | 觸發最終計分：計算全部玩家的最終分數（`金錢×W_m + 福分×W_b − 業力×W_k`），產生排名，寫入 `BoardConfig.final_scoring_triggered_at`；看板透過 Realtime 推播自動切到「最終排行榜」畫面；玩家端則需自己刷新才看到分數 | pg tx |
| `getFinalScoreboard()` | 取得最終計分排行榜（供看板與玩家查看） | 無 |
| `upsertTemplate(payload)` | 新增/編輯新手初始值範本 | 無 |
| `deleteTemplate(id)` | 刪除範本 | 無 |
| `listTemplates()` | 列出所有初始值範本 | 無 |

### 5.4 活動看板端

| Function | 說明 | 交易需求 |
|----------|------|----------|
| `getBoardData(displayToken)` | 驗 token → 回傳行情總表、重點曲線、當前事件清單、`BoardConfig`（含跑馬燈與版型設定）；若 `BoardConfig.final_scoring_triggered_at` 不為 NULL 則額外回傳最終排行榜 | 無 |

> 涉及多筆寫入或庫存／餘額一致性的操作一律使用 pg 顯式交易（`BEGIN/COMMIT/ROLLBACK`）。
> **效能與快取**：
> - 關主的 `listMyQuickActions` 必須在前端使用 `SWR` 或 `localStorage` 暫存（高 `dedupingInterval`），避免頻繁刷新請求。
> - 大會看板的 `getBoardData` 應透過前端快取或狀態庫在輪詢時只做部分更新。

---

## 6. 系統設定

設定統一存於 `AppSettings` 表，採 upsert 策略。

| 鍵名 | 型別 | 說明 |
|------|------|------|
| `BoardGameEnabled` | `'true'` \| `'false'` | 系統總開關（手動覆蓋活動時間排程） |
| `EventStartAt` | TIMESTAMPTZ 字串 NULL | 活動預定開始時間（NULL = 不限，依 `BoardGameEnabled`） |
| `EventEndAt` | TIMESTAMPTZ 字串 NULL | 活動預定結束時間（NULL = 不限，依 `BoardGameEnabled`） |
| `ExchangeRate` | 數字字串 | 1 福報 = N 金錢 |
| `TransferFeeRate` | 數字字串 | 玩家互轉手續費比率（預設 `'0'`） |
| `ScoreWeightMoney` | 數字字串 | 最終計分：金錢權重（建議 `'0.05'`） |
| `ScoreWeightBlessing` | 數字字串 | 最終計分：福分權重（建議 `'200'`） |
| `ScoreWeightKarma` | 數字字串 | 最終計分：業力權重（建議 `'150'`，公式中為扣除） |
| `InitialMoney` | 數字字串 | 新玩家初始金錢 |
| `InitialHealth` | 數字字串 | 新玩家初始健康 |
| `InitialBlessing` | 數字字串 | 新玩家初始福分 |
| `InitialKarma` | 數字字串 | 新玩家初始業力 |
| `RebirthMoney` | 數字字串 | 重生後金錢初始值（與新玩家初始值分開管理） |
| `RebirthHealth` | 數字字串 | 重生後健康初始值 |
| `RebirthBlessing` | 數字字串 | 重生後福分初始值 |
| `RebirthKarma` | 數字字串 | 重生後業力初始值 |
| `ShowAllStats` | `'true'` \| `'false'` | 數值顯示開關（預設 `'true'`）。**`true` = 顯示四項（金錢／健康／福分／業力）；`false` = 只顯示金錢與健康**（隱藏福分、業力） |
| `BankLoanCapacityRatio` | 數字字串 | 銀行額度：1 福分可對應的金錢借款額度（預設 `'10'`） |
| `BankInterestIntervalMinutes` | 數字字串 | 銀行利息結算區間，單位分鐘（預設 `'10'`） |
| `BankInterestBlessingAmount` | 數字字串 | 每次結算區間，扣除的福分數量（預設 `'1'`） |
| `QRTokenTTL` | 數字字串（秒） | QR token 有效時間，預設 `'300'`（5 分鐘） |
| `ManualRefreshCooldownSeconds` | 數字字串（秒） | 玩家手動點「重新整理」按鈕的冷卻時間，預設 `'60'`；不分頁面共用同一個 cooldown |
| `BoardRefreshInterval` | 數字字串（秒） | 活動看板 fallback 輪詢間隔（救援漏推用），預設 `'60'`；變動本身靠 Realtime 推播即時更新 |
| `BoardMarqueeMaxMinutes` | 數字字串 | 跑馬燈 TTL 上限（分鐘），預設 `'120'`（單場 2 小時活動）；後端校驗 `publishMarquee` 的 `ttlMinutes` 不得超過此值 |
| `RoundIntervalMinutes` | 數字字串 | 預期回合間隔（分鐘），純提示用，預設 `'10'`；實際推進靠主持人手動按鍵 |
| `StockPriceRule` | JSON 字串 | 主持人按「下一回合」時的預設股價變化規則（每檔漲跌幅範圍、隨機種子等）；主持人可在當回手動覆寫 |

> 看板顯示相關（`title` / `featured_stock_ids` / `color_scheme` / `event_rotate_seconds` / `marquee_text` / `marquee_until` / `final_scoring_triggered_at` / `current_round` / `last_tick_at`）已搬到獨立的 `BoardConfig` 表（見 §3.4），看板 Realtime 訂閱該表避免被無關設定變更污染。

> 新增設定鍵時，於前端 `lib/settings.ts` 的 type 與預設值表中同步新增；讀取設定時走統一的 `getSetting(key)` helper，並對未設定的 key 回傳預設值。

---

## 7. 關鍵流程

### 7.1 入場流程（依 `Account.role` 三向分流）
1. 使用者於 `/login` 登入
2. 登入成功 → 後端依 `Account.role` 決定預設導向（**role 已在 JWT payload 內，middleware 不打 DB**）：
   - `admin` → `/admin`（大會後台，桌面優先）
   - `captain` → `/captain`（關主後台，手機優先）
   - `player` → `/`，但**先檢查命格抽卡前置條件**：
     - 若 `AppSettings.CardDrawMode === 'true'` 且玩家 `destiny_name` 為 NULL → middleware 重新導向至 `/onboarding`
     - 玩家在 `/onboarding` 點擊抽卡 → 後端從啟用的 `InitialValueTemplate` 隨機抽取一張，寫入 `destiny_name` 與四項初始值 → 完成後導回 `/`
     - 抽卡完成後再次進入 `/onboarding` 會被強制導回 `/`（防誤入）
     - 若 `CardDrawMode === 'false'` 或玩家已有 `destiny_name` → 略過 onboarding 直接進 `/`
3. middleware 強制保護路由（路由不符身份直接 302 回各自首頁），杜絕「直接打網址繞過」
4. 玩家首頁進入時呼叫 `getMyStats` **載入一次**（不輪詢）；關主首頁呼叫 `listMyQuickActions`（前端快取，不重撈）
5. **玩家頁的後續更新**：
   - 玩家自己執行任何 server action 後，由 action response 帶回最新 stats，前端更新本地 state
   - 被動變化（被關主套快捷、回合結算扣息）→ 玩家自行按右上角「🔄 重新整理」按鈕（節流秒數 = `AppSettings.ManualRefreshCooldownSeconds`，預設 60；機制詳見 §5.1 `getMyStats`）；看板顯示「第 N 回合」作為現場提示
6. 若活動在排程時間外（`EventStartAt` / `EventEndAt`）或 `BoardGameEnabled === 'false'`：玩家端顯示「活動尚未開始」或「活動已結束」遮罩、寫入按鈕停用；admin 不受限
7. 若玩家 `health ≤ 0 || blessing ≤ 0`：進入「地獄狀態」，App 鎖定為地獄畫面，僅顯示 QR Code，所有寫入操作停用

### 7.2 關主套用快捷模組（綁定與發放雙階段流程）
為支援關主同時帶領多位玩家進行遊戲，操作由「單次點擊即發放」改為「加入列表、完成後發放」的雙向階段。

1. **關主掃條碼**：關主進入 `/captain/scan` 啟動掃碼器掃描玩家 QR。
2. **顯示用戶資料**：解析玩家 token → 呼叫 `lookupPlayerByQR` → 系統顯示該玩家的四項參數與道具。
3. **點擊快捷鍵**：關主從快捷模組列表中選擇要套用的模組。
4. **檢查符合前提條件**：後端即時檢查該玩家是否滿足該模組設定的 `req_*` 門檻（如金錢、健康），以及是否達到 `player_max_uses` 或 `global_max_uses` 次數限額。
   - 若條件不符或達上限：前端彈窗提示阻擋（例如：金錢不足或已達次數上限），不允許綁定。
5. **執行活動（綁定進入列表）**：
   - 若條件符合，關主點擊『執行』按鈕。系統會將玩家與該模組**「綁定」**，並把該任務放入關主專屬的 **「進行列表 (In-Progress List)」** 之中。
   - *（ps. 此時關主不會被阻擋，可以繼續掃瞄下一位玩家；關主可以一次同時進行很多人在同一個關卡中。）*
6. **點擊完成才發放（正式結算作業）**：
   - 待玩家完成挑戰/活動後，關主於進行列表中對該玩家點擊『完成』。
   - 系統此時才正式執行後台 pg 交易（呼叫 `applyQuickAction`）：
     - 實際進行四項參數的增減（health cap 100）。
     - 發放綁定道具（`bound_item_id`）。
     - 同步增加各類使用計數器（`QuickAction.global_use_count`、`StationUsage` 等）。
     - INSERT `Transaction` 作為正式紀錄。
   - 結算後若玩家 `health ≤ 0 || blessing ≤ 0` → 玩家端下次刷新時將轉為下地獄畫面。

### 7.3 下地獄機制
1. 玩家 `health ≤ 0` 或 `blessing ≤ 0` 時觸發死亡狀態（**不額外儲存旗標，前後端皆即時計算**）
2. 玩家 App 鎖定為「地獄畫面」：隱藏所有功能模組，僅顯示「你已下地獄」提示 + QR Code，引導玩家找擁有重生鍵的關主
3. 後端對所有玩家寫入操作以 `assertPlayerAlive(stats)` helper 統一檢查（見 CLAUDE.md §4.2），未通過直接回 `PLAYER_DEAD`
4. 解除死亡的執行流程詳見 **§7.8 關主執行重生**

### 7.4 玩家互轉金錢
1. 玩家 A 輸入對方 UserID（或掃 QR）+ 金額
2. 確認彈窗 → 呼叫 `transferMoney(fromUserId, toUserId, amount)`
3. 後端 pg 交易：
   - 鎖定兩位玩家的 `PlayerStats` row（`SELECT ... FOR UPDATE`，固定 user_id 排序避免死鎖）
   - 檢查 A 餘額 ≥ amount + fee
   - 扣 A、加 B、INSERT 兩筆 `Transaction`
4. 回傳新餘額

### 7.5 股票買進
1. 玩家輸入代碼或點選商品 → 輸入股數
2. 確認彈窗顯示「當下價格 × 股數 = 應付金錢」
3. 呼叫 `buyStock(userId, stockId, shares)`
4. 後端 pg 交易：
   - `SELECT current_price FROM Stock WHERE id = $1`（**不加 `FOR UPDATE`**，依 §14.4 鎖策略：股價以呼叫當下價成交，避免買賣序列化）
   - 計算總價 = `current_price × shares`
   - `SELECT ... FROM PlayerStats WHERE user_id = $1 FOR UPDATE`（鎖玩家自己的 row）
   - 檢查 money ≥ 總價
   - 扣 money、UPSERT `StockHolding`（shares += N）
   - INSERT 交易紀錄
5. 回傳新餘額與持股

### 7.6 股票賣出
- 流程同買進，方向相反；總價以**當下** `current_price` 計算（非平均成本）
- 發生以下情況時直接拒絕：
  - 賣出超過持股數
  - 該股票屬性 `is_sellable = false`（不可賣回給系統）

### 7.7 主持人推進回合（股價 + 利息結算）
1. 主持人在 `/admin` 後台「回合控制」面板按「**下一回合**」按鈕
2. 前端顯示確認彈窗（避免誤觸），確認後呼叫 `tickRound(overrides?)`
3. 後端**拆兩個短 pg tx**（避免單長 tx 阻塞玩家寫入）：

   **Tx 1：股價更新**（很快，10 檔）
   - 驗 `session.role === 'admin'`；驗距離 `BoardConfig.last_tick_at` ≥ 30 秒（否則回 `TICK_TOO_FAST`，整個 action 中止）
   - 對每檔 `Stock`：依 `overrides.stockPrices` 或讀取 `AppSettings.StockPriceRule` 計算新價，UPDATE `current_price`、INSERT `StockHistory`
   - UPDATE `BoardConfig`：`current_round += 1`、`last_tick_at = now()`

   **Tx 2：利息結算**（一條批次 SQL，不逐筆 loop）
   - **單條** UPDATE 結算所有借款玩家：
     ```sql
     UPDATE "PlayerStats"
     SET blessing = blessing - $1,
         loan_updated_at = now(),
         updated_at = now()
     WHERE bank_loan > 0;
     ```
   - **單條** INSERT...SELECT 寫入所有 `bank_interest` Transaction：
     ```sql
     INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload, created_at)
     SELECT user_id, NULL, 'bank_interest',
            jsonb_build_object('amount', $1, 'round', $2, 'remaining_loan', bank_loan),
            now()
     FROM "PlayerStats"
     WHERE bank_loan > 0;
     ```
   - **每回合不論借多久都扣固定 `BankInterestBlessingAmount`**（不做比例計算；簡單可預期，玩家容易理解）
   - 玩家若 blessing 被扣至 ≤ 0：不額外標記，前端進頁面時即時計算為地獄狀態
4. **設計理由**：兩 tx 拆分的好處
   - Tx 1 只動 10 檔 `Stock` + 1 筆 `BoardConfig`，毫秒級完成；不會阻塞任何 `PlayerStats` 寫入
   - Tx 2 雖然動到 `PlayerStats`，但用單條批次 SQL（不是 loop），pg 內部短時間完成；活動高峰借款玩家最多估計 200 人，單 SQL ~50 ms 量級
   - 兩 tx 之間若有玩家正在 `transferMoney` / `applyQuickAction`，最多等 Tx 2 的 50 ms，遠優於把 200 筆 UPDATE 包成單一長 tx 的「卡 1-2 秒」情境
5. 看板透過 Realtime 收到 `BoardConfig` UPDATE → 顯示「第 N 回合」字樣 + 主動拉一次 `getBoardData` 整合最新行情（推→拉模式，見 §11）
6. 玩家**不會**自動收到推播；想看新狀態請玩家自行按「🔄 重新整理」（看板會作為現場提示）

### 7.8 關主執行重生

**前置條件（防呆）**：玩家必須**主動**在地獄畫面把 QR Code 拿給關主掃。任何情況下關主都無法對「未死亡的玩家」執行重生 —— 這是雙重防呆（前端按鈕不顯示 + 後端拒絕）。

1. **玩家死亡** → App 鎖定為地獄畫面，僅顯示 QR Code（其餘功能停用）
2. 關主進入 `/captain/scan` → 掃玩家 QR → `lookupPlayerByQR` 回傳玩家狀態**及該關卡 `allow_rebirth`**
3. 前端顯示「🔄 重生」按鈕的條件**同時**滿足以下三點：
   - `Station.allow_rebirth === true`（該站開放重生）
   - 玩家當前 `health ≤ 0 || blessing ≤ 0`（玩家確實在地獄狀態）
   - 已透過 QR 掃碼取得玩家身份（無法手動輸入 ID 跳過此步）
4. 關主點擊「重生」→ 確認彈窗（顯示「將重置該玩家：四項參數歸零為重生初始值、**清空所有持股**、**清空銀行借款**、**清空所有道具**，是否確認？」）
5. 確認 → 呼叫 `rebirthPlayer(captainUserId, targetUserId, stationId)`
6. 後端 pg 交易：
   - 驗 `Station.allow_rebirth = true` 且 `captainUserId ∈ Station.captain_user_ids`
   - **驗目標玩家 `health ≤ 0 || blessing ≤ 0`（讀 `PlayerStats` 即時判定，避免前端繞過）；不滿足直接 reject `PLAYER_NOT_DEAD`**
   - 讀取 `AppSettings`：`RebirthMoney`、`RebirthHealth`、`RebirthBlessing`、`RebirthKarma`
   - UPDATE `PlayerStats` 四項參數為重生初始值；同步清空 `bank_loan = 0` 與 `loan_updated_at = NULL`
   - **`DELETE FROM "StockHolding" WHERE user_id = $targetUserId`**（所有持股歸零，重新開始；持股不折現補償，因為重生本來就是懲罰／重置機制）
   - **`DELETE FROM "PlayerItem" WHERE user_id = $targetUserId`**（所有道具清空，含手術執照、財神爺 BUFF 等身份識別道具；不折現補償）
   - INSERT `Transaction`（`tx_type='rebirth'`，payload 含重設前的四項參數、被清空的借款餘額、被清空的持股清單 `[{stock_id, shares}, ...]`、被清空的道具清單 `[{item_id, quantity}, ...]` 供日後爭議追溯）
7. 回傳更新後的玩家狀態（含空持股、空道具），前端顯示「重生成功」

---

## 8. 回合控制與股市價格驅動

### 8.1 設計原則
- **不使用自動排程**（Supabase 免費版無內建 cron；自架 Vercel Cron 又增加部署複雜度）
- 改為**主持人按鈕推進回合**：管理員在 `/admin` 後台按下「**下一回合**」按鈕，後端**拆兩個短 pg tx** 完成（避免單長 tx 阻塞玩家寫入 — 詳見 §7.7）
  - **Tx 1**：10 檔股價更新 + `BoardConfig.current_round += 1`、`last_tick_at = now()`
  - **Tx 2**：單條批次 SQL 結算所有借款玩家利息 + 單條 INSERT…SELECT 寫入 `bank_interest` Transaction（不逐筆 loop）
- 利息採**固定金額**（每回合扣固定 `BankInterestBlessingAmount`，**不做時間比例計算**），簡單可預期

### 8.2 為什麼這樣設計
- **120 分鐘活動 / 10 分鐘 1 回合 = 12 回合**，主持人按鍵負擔極低
- 主持人可依現場節奏微調（致詞時延後、玩家投入時加速）— 比固定 cron 更有彈性
- 「下一回合」按下時看板會推播 `BoardConfig.current_round` 變動，**所有玩家透過看板就能感知本回合結束**，自然形成「該刷新自己頁面看新行情」的提示
- 借款利息與股價同步推進，玩家認知統一（「一回合一個結算」）

### 8.3 Server Action：`tickRound()`
詳見 §5.3；簽名 `tickRound(overrides?: { stockPrices?: { stockId: string; price: number }[] })`：
- `overrides.stockPrices` 不為 NULL → 用該值，否則套用 `StockPriceRule`
- 後端額外保險：兩次 `tickRound` 之間若間隔 < 30 秒，回 `TICK_TOO_FAST`（防誤點）

### 8.4 開場前清理（避免跨場曲線殘留）
- 一場活動 12 回合 × 10 檔 ≈ 120 筆 `StockHistory`，單場活動完全在「保留 200 筆」內，**不需要 cron prune**
- 但**跨場累積**會讓 sparkline 看到上場活動的軌跡，業務上不合理
- 解法：admin 後台「回合控制」面板提供「**重置股價歷史**」按鈕（呼叫 `resetStockHistory()`），主持人**每場開場前手動按一次**：
  - 清空 `StockHistory`
  - `BoardConfig.current_round` 歸 0
- 想保留歷史稽核 → 先按「歸檔本場」（`archiveStockHistory('2026-04-30 場次')`）再按「重置」

### 8.5 漲跌規則（`StockPriceRule`）建議格式
```json
{
  "default": { "min_pct": -10, "max_pct": 10 },
  "per_stock": {
    "<stock_id>": { "min_pct": -5, "max_pct": 15 }
  }
}
```
按下「下一回合」時，每檔股票依規則隨機抽一個百分比變動，向上 / 向下 cap 至合理區間（例 ≥ 1）。

---

## 9. QR Code 與掃碼流程

### 玩家 QR 內容
- 短期 token：`bg:{user_id}:{nonce}:{exp}`，伺服器以 HMAC-SHA256（`AUTH_SECRET`）簽章後 base64 編碼
- 預設有效期 5 分鐘（讀 `AppSettings.QRTokenTTL`），避免外流被冒用
- 前端定時刷新（每 60 秒重新請求 token）

### 掃描端
- 採用 `html5-qrcode` 或同類套件，`dynamic import` 避免 SSR
- 解碼後呼叫 `lookupPlayerByQR(token)`，伺服器驗章 + 過期檢查

### 道具發放 QR（替代方案）
- 若希望「道具卡片」可實體化發放，可由後台預先產生 `bg_item:{item_id}:{captain_id}:{nonce}`
- 玩家掃此 QR 自動領取（仍需該關主在線授權）

---

## 10. 安全性與授權

| 操作 | 後端必須驗證 |
|------|--------------|
| 套用快捷模組 | session `role==='captain'` 且 `userId ∈ Station.captain_user_ids`（該 quickAction 所屬站） |
| 發放道具 | session `role==='captain'` 且至少屬於一個啟用中 `Station` |
| **重生玩家** | session `role==='captain'` 且 `userId ∈ Station.captain_user_ids` 且 `Station.allow_rebirth = true`（該站未開放重生即使是該站關主也不能執行）；**且目標玩家當前處於地獄狀態（`health ≤ 0` 或 `blessing ≤ 0`）—— 防呆，未死亡的玩家不能被任意重置**。玩家必須在地獄畫面把 QR 拿給關主掃，重生鍵才會出現 |
| 玩家互轉 | session `role==='player'` 且 `fromUserId === session.userId` |
| 銀行借貸 / 還款 | session `role==='player'` 且 `userId === session.userId`；玩家未在地獄狀態 |
| 後台設定 | `session.role === 'admin'` |
| 股票下單 | session `role==='player'`；`userId === session.userId`；數量為正整數；股票買賣為玩家 ↔ 系統，無對手盤 |
| 活動看板讀取 | display token HMAC 簽章合法且未撤銷；只回傳唯讀資料 |
| 事件 / 跑馬燈寫入 | `session.role === 'admin'`；跑馬燈 TTL 以分鐘為單位，上限讀 `AppSettings.BoardMarqueeMaxMinutes`（預設 120 分鐘，對齊單場活動長度，防止跨場殘留） |
| 觸發最終計分 | `session.role === 'admin'`；`triggerFinalScoring` 為一次性操作（重複呼叫只更新 `BoardConfig.final_scoring_triggered_at`，不重新計算已凍結結果） |
| 推進回合（`tickRound`） | `session.role === 'admin'`；距離 `BoardConfig.last_tick_at` ≥ 30 秒（防誤點） |
| 重置股價歷史（`resetStockHistory`） | `session.role === 'admin'`；前端二次確認；通常只在「活動開場前」執行；不影響玩家當前持股，僅清空 `StockHistory` 繪圖資料 |
| 重置使用次數（`resetUsageCounters`） | `session.role === 'admin'`；前端二次確認；通常只在「活動開場前」執行；TRUNCATE `StationUsage` / `QuickActionUsage` 並把 `global_use_count` 歸 0 |

> 所有 server action 開頭以伺服器 session（讀 cookie / JWT）取得登入者，**禁止信任前端傳入的 actor**。
> 密碼以 bcrypt（cost ≥ 12）或 argon2id 雜湊；登入接口加上 rate limit。

### 環境變數
- `DATABASE_URL`：PostgreSQL 連線字串（pg 用）
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`：Supabase 讀取
- `SUPABASE_SERVICE_ROLE_KEY`：Supabase 寫入（伺服器端）
- `AUTH_SECRET`：JWT / HMAC 簽章金鑰
- `NEXT_PUBLIC_APP_URL`：前端 base URL（OAuth 回呼用）

---

## 11. 活動看板

### 用途
獨立可投放的公開資訊看板，**不需登入帳號**，僅以管理員預先發行的 **display token** 授權。
適合活動現場大屏、投影機、桌上副螢幕同步展示。
顯示內容包含：股市行情、後台預設事件、即時跑馬燈。

> **不顯示換匯所匯率**：匯率屬於玩家視野不可見的隱藏參數，不應在公開看板曝露。

### 路由與授權
- 路由：`/display/board?token={displayToken}`
- `displayToken` 由 `issueDisplayToken()` 產生，內容：`board:{nonce}:{exp}`，HMAC 簽章
- 預設 TTL：活動天數 + 1（避免活動中過期）；可手動撤銷
- 後端讀取時驗章 + 比對 `revoked_tokens` 黑名單；任何寫入請求一律拒絕

### 看板畫面結構

```
┌────────────────────────────────────────────────────────────────────┐
│  [LOGO]  開運大富翁 ── 大廳        ⏰ 14:23:45  📅 04/29   🟢      │
├──────────────────────────────┬─────────────────────────────────────┤
│   重點曲線（最多 4 檔）      │           行情總表                  │
│                              │                                     │
│   ┌──────┐ ┌──────┐          │ 代碼  名稱  價  漲跌                │
│   │ 大圖 │ │ 大圖 │          │ AAA   XXX  100  +5%                │
│   └──────┘ └──────┘          │ BBB   YYY   80  -2%                │
│   ┌──────┐ ┌──────┐          │ CCC   ZZZ  120  +8%                │
│   │ 大圖 │ │ 大圖 │          │ …                                  │
│   └──────┘ └──────┘          │                                     │
├──────────────────────────────┴─────────────────────────────────────┤
│  📢 事件：「股神就是你！下午茶時段加碼開始…」                       │
├────────────────────────────────────────────────────────────────────┤
│  📢 跑馬燈：「歡迎各位道友蒞臨開運大富翁活動會場…」                 │
└────────────────────────────────────────────────────────────────────┘
```

### 區塊定義

| 區塊 | 資料來源 | 更新時機 |
|------|----------|----------|
| 頁首（標題、時間、連線指示、回合數） | `BoardConfig.title` / `current_round` + 客戶端時鐘 | **`BoardConfig` 信號** → 拉 `getBoardData` 取得；客戶端時鐘每秒自走 |
| 重點曲線（左欄） | `Stock` + `StockHistory`，依 `BoardConfig.featured_stock_ids` 篩選 | **`BoardConfig.last_tick_at` 變動觸發** → 拉 `getBoardData`；60 秒 fallback |
| 行情總表（右欄） | 所有 `Stock` where `is_visible = true` + 最新 sparkline | 同上 |
| 事件列（底部上） | `Event` where active + 時間區間命中 | **Realtime 推**（Event INSERT/UPDATE）+ 客戶端每秒比對 `[start_at, end_at]` 觸發上下檔；多筆依 `BoardConfig.event_rotate_seconds` 輪播 |
| 跑馬燈（底部下） | `BoardConfig.marquee_text`（過期則空） | **`BoardConfig` 信號** → 拉新值；客戶端每秒比對 `BoardConfig.marquee_until` 自動清除 |

---

## 12. 玩家與關主介面結構

### 12.1 玩家頁面結構（Mobile 優先）
玩家介面設計以手機直立瀏覽為主。根據 `app/page.tsx` 原型設計，採用流暢的玻璃擬物態（Glassmorphism）卡片佈局與底部導覽列。

```text
┌──────────────────────────────┐
│ 📌 王小明 (U-1234)  [ 📷 ] [ 🔄 ] [ ⚙️ ] │
├──────────────────────────────┤
│ 💰 金錢 (12,500)│ ❤️ 健康 (80) │
│ ✨ 福分 (隱/顯) │ 💀 業力 (隱/顯)│
├──────────────┴───────────────┤
│ [ 💱 換匯所 ]   [ 🏦 銀行借貸 ]│
│                              │
├──────────────────────────────┤
│ 🎒 我的道具 (2)               │
│ 🏥 手術執照 (關主A發放於14:20) │
│ 🧧 財神爺 BUFF               │
├──────────────────────────────┤
│ ⬇️ 底部導覽 (Bottom Nav)      │
│ [ 🏠 我的狀態 ]  [ 📈 股市大廳 ]│
└──────────────────────────────┘
```
> **注意**：福分與業力顯示由 `ShowAllStats` 控制。地獄狀態（健康/福分≤0）下，只會顯示 `[ 📷 我的 QR ]` 與「你已下地獄」提示，其餘板塊全數停用遮蔽。

### 12.2 關主頁面結構（Mobile 優先）
關主在此為機動操作，根據 `app/captain/page.tsx` 原型設計，首頁焦點為巨大的掃碼入口，下方列出已設定的模組。

```text
┌──────────────────────────────┐
│ 👑 關主 01 (站點: 命運大轉盤)[⏻]│
├──────────────────────────────┤
│                              │
│    [ 📷 巨大掃描 QR 入口 ]     │
│   (進入掃描器發放點數或道具)   │
│                              │
├──────────────────────────────┤
│ ⚡ 快捷功能模組          [管理] │
│ ──────────────────────────── │
│ 🎯 任務通關獎勵                │
│   [💰 +50] [✨ +2]           │
│ 🎯 任務失敗扣除                │
│   [❤️ -5]                    │
├──────────────────────────────┤
│ ► 掃描玩家成功後展開操作：      │
│ - 檢視目標狀態 (💰/❤️/✨/💀/🎒)│
│ - 點擊上述模組一鍵套用         │
│ - 🎁 獨立下拉發放道具          │
│ - 🌱 執行重生 (若該站具備權限) |
└──────────────────────────────┘
```
> **注意**：關主的快捷模組清單應在前端快取（如 SWR / localStorage），避免現場網路不穩時頻繁重新加載這份固定選單。掃碼後再進入執行套用（Tx）階段。

### 12.3 主題系統（ThemeProvider）

實作於 `src/components/ThemeProvider.tsx`，掛在 `app/layout.tsx` 的 `<body>` 內，根據 localStorage 偏好與當前 pathname 動態套用 `<html data-theme>` 與 `<html data-font-size>`。

#### 規則總表

| 路由前綴 | 主題 | 字級 |
|---------|------|------|
| `/admin/*` | **強制深色** | **強制 md (16px)** |
| `/display/*` | **強制深色** | **強制 md (16px)** |
| 其他（玩家、`/captain/*`、`/login`、`/onboarding` 等） | 跟 `pref_theme` localStorage（`'dark'` / `'light'`） | 跟 `pref_font_size` localStorage（`sm` / `md` / `lg` / `xl`） |

```ts
// ThemeProvider.tsx 核心
const FORCE_DARK_PREFIXES = ['/admin', '/display'];
```

#### 字級對應

| pref_font_size | 對應 px | 用途 |
|----------------|---------|------|
| `sm` | 14px | 視力佳、想看更多資訊 |
| `md` | 16px | 預設 |
| `lg` | 18px | 中老年友善 |
| `xl` | 21px | 視障輔助 |

寫入 `<html style="font-size: Npx">`，所有 rem-based class 會自動縮放。

#### 開發守則
- **禁止** 在前台路由頁面用 `text-[Npx]` 寫死像素字級 — Tailwind v4 會編譯成絕對 px，不會跟字級設定縮放
- **必須** 改用 `text-[Nrem]` 形式（10px → `text-[0.625rem]`、11px → `text-[0.6875rem]`）
- 後台 / 看板因為強制 md，可不受此限，但仍建議統一風格

#### 淺色模式 CSS 策略
`globals.css` 對 `[data-theme="light"]` 套用以下覆蓋：
- 背景色 zinc-950 / 900 / 800 / 700（含 `/40` `/60` `/80` `/50` 等透明度變體）對應到 zinc-50/100/200 系列
- 強調色 amber-400 / teal-400 / emerald-400/500 / rose-400 / blue-400 改用 `-600/700` 深色版以維持對比
- `panel` / `glass-panel` 改成白底
- Input 元素 bg / border / placeholder 全套淺色
- 詳見 `globals.css` `[data-theme="light"]` 區塊

#### 偏好儲存
- 存於玩家瀏覽器 `localStorage`，**不上傳後端**
- key：`pref_theme`、`pref_font_size`
- 切換入口：`/settings`
- 看板（`/display/*`）以 display token 進入，無 localStorage 持久化（永遠深色）

### 事件 vs 跑馬燈

| 項目 | 事件（Event） | 跑馬燈（Marquee） |
|------|---------------|-------------------|
| 儲存位置 | `Event` 表 | `BoardConfig.marquee_text` + `marquee_until` |
| 設定流程 | 後台「事件管理」CRUD + 排程 | 後台「跑馬燈」單一輸入框 + 持續時間 |
| 顯示時機 | `[start_at, end_at]` 區間內、`is_active = true`，多筆輪播 | 即時生效；到 `BoardConfig.marquee_until` 自動清除 |
| 用途定位 | 遊戲內劇情、活動節奏、加碼時段 | 現場營運訊息、突發公告、致詞 |
| 清除方式 | 設 `is_active = false` 或調整 `end_at` | `clearMarquee()` 立即清除 |

### 資料更新策略（混合：Realtime 推播 + 60 秒 fallback 輪詢）

採用「**push 為主、pull 為輔**」的混合架構。後台變更立即推到看板（< 1 秒），同時保留低頻輪詢救援漏推與時間觸發事件。

#### 1. 初始載入
- 看板開啟 → 驗證 display token → 一次性呼叫 `getBoardData(token)` 拿完整快照
- 後端回傳：
  - 所有 `is_visible = true` 的 `Stock`（current_price、is_tradable）
  - 每檔最近 N 筆 `StockHistory`（用於 sparkline；重點曲線給更多筆）
  - 當前命中的 `Event` 清單（依 `priority DESC` 排序）
  - 整列 `BoardConfig`（含 `title` / `featured_stock_ids` / `color_scheme` / `event_rotate_seconds` / `marquee_text` / `marquee_until` / `current_round`；過期跑馬燈由前端比對 `marquee_until` 後不顯示）
  - 若 `BoardConfig.final_scoring_triggered_at` 不為 NULL → 含最終排行榜
  - **不含 `ExchangeRate`**（看板刻意不顯示匯率）

#### 2. 即時推播（**推→拉混合模式**）
- 看板拿到初始快照後建立 Realtime channel，但**只訂閱單一信號表 `BoardConfig`**：
  - `BoardConfig` UPDATE（含 `last_tick_at` 變動 / `marquee_*` / `title` / 配色等）→ 看板**主動拉一次** `getBoardData(token)` 重新整合最新行情、事件、跑馬燈
  - `Event` INSERT/UPDATE/DELETE → 重算命中事件（事件單獨訂閱 OK，量低）
- **為什麼推→拉**：避免 `tickRound` 一次推 21 條事件（10 檔 Stock UPDATE + 10 筆 StockHistory INSERT + 1 筆 BoardConfig UPDATE）讓看板 React 重渲染 21 次；改成「收到單一 `BoardConfig` 信號 → 拉一次完整快照」既保 < 1 秒延遲、又把多事件合 1
- **不訂閱 `Stock` / `StockHistory`**：減少前端事件量、簡化 RLS 範圍（看板的 anon role 只需要 SELECT `BoardConfig` / `Event` / `Stock` / `StockHistory`，但訂閱層只要前兩張）
- **獨立 `BoardConfig` 表的好處**：Supabase Realtime 不支援 server-side filter by key；專用表避免訂閱 `AppSettings` 整表時被 `ScoreWeight*` / `InitialMoney` 等無關 key 變更污染
- **RLS**：建立看板專用 anon role，**僅 SELECT** `Stock` / `StockHistory` / `Event` / `BoardConfig` 四張表的公開欄位（不含 `Account`、`Transaction`、`AppSettings` 等敏感表）
- **延遲目標**：變更瞬間 → 看板更新 < 1 秒（信號推 → fetch 快照 ≈ 200-500 ms）

#### 3. 時間觸發（純客戶端，不打後端）
有些變化不會觸發任何 INSERT / UPDATE，必須在客戶端比對時鐘：
- `Event.start_at` 到了 → 自動上檔
- `Event.end_at` 到了 → 自動下檔
- `BoardConfig.marquee_until` 過了 → 跑馬燈自動清空

→ 看板用 `setInterval(1000)` 每秒比對本地 events / marquee 與當前時間，命中即更新 UI（不發 API）。

#### 4. Fallback 輪詢（漏推救援，每 60 秒一次）
即使 Realtime 機制再可靠，仍可能在斷線重連縫隙漏推；因此保留一條低頻保險：
- 每 `BoardRefreshInterval` 秒（預設 **60 秒**）呼叫 `getBoardData(token)` 重新整份快照
- 與 Realtime 收到的局部更新合併（拉取結果為準，覆蓋本地狀態以校正）
- 60 秒一次 × 3 台看板 = 0.05 req/s，幾乎無成本

#### 5. 連線降級
- Realtime channel 斷線 → 右上角顯示 🟡，指數 backoff 重連（1s → 2s → 4s → ... 最大 30s）
- 連續 3 次重連失敗 → 切到「應急輪詢模式」：fallback 輪詢從 60 秒縮為 5 秒，並持續嘗試重建 Realtime
- 完全斷網 → 🔴；最後一次成功的快照保留在畫面上不消失

#### 效益重估
| 模式 | 變動延遲 | 平常負載（3 台看板）|
|------|---------|--------------------|
| 純輪詢 5 秒（舊） | 最壞 5 秒 | 0.6 req/s |
| 純輪詢 60 秒 | 最壞 60 秒 | 0.05 req/s |
| **混合（推 + 60 秒 fallback）** | **< 1 秒** | **0.05 req/s + Realtime 訂閱** |

> **建議**：MVP 即可實作此混合模式（Supabase Realtime 已在 stack 內，多寫的程式碼有限）；第二場活動之後再依現場觀察微調 debounce 時間與 fallback 間隔。

### 樣式與排版需求
- **解析度優先**：1920×1080（16:9）；以 vw / vh 排版確保 4K 等比放大，無滾動條
- **字級**：總表行高 ≥ 60px、字級 ≥ 24px；重點曲線標題 ≥ 48px；事件 / 跑馬燈 ≥ 36px；遠距至少 5 公尺可讀
- **配色**：高對比深底（建議 `bg-zinc-950`）+ 紅綠強調；色盲友善加 ↑↓ 箭頭符號
- **動畫**：價格跳動短暫 highlight（背景閃爍 200ms）；事件切換淡入淡出；跑馬燈以 CSS `@keyframes` 從右往左捲動
- **斷線處理**：右上角顯示 🟢 已連線 / 🟡 重連中 / 🔴 已斷線，自動 backoff 重試
- **禁止互動**：滑鼠 / 觸控事件不觸發任何動作（`pointer-events-none`），避免現場誤觸

### 後台管理（Admin → 活動看板）

#### 看板版型
- 選擇重點曲線商品（拖拉排序，最多 4 檔）
- 編輯頁首標題 `BoardConfig.title`
- 切換配色方向（紅漲綠跌 / 綠漲紅跌）
- 設定事件輪播間隔 `BoardConfig.event_rotate_seconds`

#### 事件管理
- 列表 + 「新增事件」表單：`title`、`text`、`start_at`、`end_at`、`priority`、`is_active`
- 支援排程：可預先建立未來事件，到時間自動上檔
- 「測試播放」按鈕：在後台預覽該事件在看板上的顯示效果

#### 跑馬燈
- 單一文字輸入框 + 顯示分鐘數下拉，選項依 `BoardMarqueeMaxMinutes` 動態產生（預設 120 時：5 / 15 / 30 / 60 / 120 分鐘 + 自訂 1 ～ MAX）
- 自訂輸入若超過 `BoardMarqueeMaxMinutes`：前端禁用送出按鈕並顯示「最多 N 分鐘」；後端再次校驗，超過則回 400
- 「立即發布」按鈕 → `publishMarquee(text, minutes)`，後端寫 `BoardConfig.marquee_until = now() + minutes * 60s`
- 「立即清除」按鈕 → `clearMarquee()`
- 顯示目前生效中的跑馬燈文字與剩餘分鐘數
- 上限值由「看板版型」區提供獨立輸入框調整 `BoardMarqueeMaxMinutes`（不同活動場次可改）

#### 顯示連結
- 「產生顯示連結」按鈕：呼叫 `issueDisplayToken` → 顯示 QR + 短連結，現場掃碼即可開啟看板
- 「已發行 token 列表」：顯示用途備註、發行時間、剩餘 TTL，可撤銷

---

## 13. 傳輸加密與資料安全

### 13.1 傳輸層 TLS
- 全站強制 HTTPS（Vercel / Supabase 預設啟用 TLS 1.3）
- 啟用 HSTS 標頭：`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- WebSocket / Supabase Realtime 一律走 WSS
- 自訂網域走 Vercel 自動 TLS（Let's Encrypt）；不允許 HTTP fallback

### 13.2 Cookie 與 Session
| 項目 | 設定 |
|------|------|
| Session cookie | `HttpOnly`、`Secure`、`SameSite=Lax`、`Path=/` |
| JWT 演算法 | HS256（密鑰 `AUTH_SECRET`，至少 32 bytes 隨機） |
| **JWT payload** | `{ userId, role, name, iat, exp }` — **role 寫進 token**，middleware 純解碼即可路由保護，**省下每個 protected route hit 一次 `Account` 查詢** |
| Access token TTL | 30 分鐘 |
| Refresh token TTL | 7 天，存於另一個 HttpOnly cookie |
| 登出 | 後端撤銷 refresh token；前端清 cookie |
| **role 變更時** | admin 透過 `changeRole` 改某人 role 時，被改者的舊 JWT 仍會帶舊 role 直到 access token TTL 到期（30 分鐘）；可透過撤銷該 user 的 refresh token 強制重登 |

### 13.3 應用層加密／簽章
| 用途 | 演算法 | 金鑰來源 |
|------|--------|----------|
| 玩家 QR token | HMAC-SHA256 | `AUTH_SECRET` |
| 活動看板 display token | HMAC-SHA256 | `AUTH_SECRET` |
| 道具發放 QR | HMAC-SHA256 | `AUTH_SECRET` |
| 密碼雜湊 | bcrypt（cost ≥ 12）或 argon2id | per-user salt |

> 所有 token 內容包含 `nonce` + `exp`；伺服器先驗章再比對過期時間與撤銷黑名單。
> `AUTH_SECRET` 每場活動結束後可考慮輪替；輪替時保留舊 key 一段重疊期供尚未過期 token 驗證。

### 13.4 資料庫連線
- Supabase 預設要求 SSL；自架 PostgreSQL 必須 `sslmode=require` 並驗 CA 憑證
- pg 連線字串：`postgres://user:pass@host:6543/db?sslmode=require`
- `SUPABASE_SERVICE_ROLE_KEY` 僅放 server-side env，**禁止打進 client bundle**（Next.js 不要用 `NEXT_PUBLIC_` 前綴）
- 玩家／看板的 anon key 受 RLS 限制，僅能 SELECT 公開資料

### 13.5 HTTP 安全標頭
於 `next.config.js` 的 `headers()` 套用全站：

| 標頭 | 設定值 | 目的 |
|------|--------|------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | 強制 HTTPS |
| `Content-Security-Policy` | `default-src 'self'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; script-src 'self'` | 限制資源來源 |
| `X-Frame-Options` | `DENY` | 防 iframe 嵌入 |
| `X-Content-Type-Options` | `nosniff` | 防 MIME sniff |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | 限縮 referrer |
| `Permissions-Policy` | `camera=(self), geolocation=()` | 僅關主前台 / 玩家頁可用相機 |

### 13.6 敏感資料處理
- 密碼、token、QR 內容**一律不入 log**（在 logger 套件層攔截欄位名稱）
- 對外錯誤訊息只回通用文案；詳細堆疊只送 server-side log
- 玩家 UserID 在 QR 中以 token 包裝，不直接外露明碼
- 資料庫每日自動快照（Supabase 內建；自架走 `pg_dump` cron），保留 7 天

### 13.7 攻擊防護
| 風險 | 對策 |
|------|------|
| 暴力登入 | 登入 endpoint rate limit（Vercel KV / Upstash 計數）— **per-account：同一 `login_id` 5 次失敗 / 分鐘，連續錯 10 次鎖該帳號 15 分鐘**；**per-IP：120 次 / 分鐘**（會場 500 人共用 NAT egress IP，per-IP 不能用 5/分鐘，否則整場鎖死）。主防線 per-account、副防線 per-IP |
| QR 攔截重放 | nonce + exp 短 TTL（5 分鐘）；nonce 入伺服器 cache 拒絕重用 |
| display token 外流 | 黑名單即時撤銷 + TTL；發行時帶用途備註可追溯 |
| SQL injection | 全用 pg parameterized query / Supabase JS 鏈式 API；**禁止字串拼接 SQL** |
| XSS | React 預設轉義；`dangerouslySetInnerHTML` 嚴禁套到玩家輸入；事件 / 跑馬燈文字僅渲染為純文字 |
| CSRF | Server Actions 受 Same-Origin 保護；外部 webhook 走 HMAC 簽章驗證 |
| 越權操作 | 每個 server action 開頭重新驗 session，**禁止信任前端傳入的 actor user_id** |

---

## 14. 效能與容量規劃

### 14.1 預期負載（單場 2 小時活動）
- 同時在線玩家：≤ 500 人
- 大屏幕看板：1 ～ 3 台投放
- 關主：≤ 30 人，每人每分鐘掃碼 1 ～ 2 次（關主不參與遊戲，純發分數工具人）
- 股市操作峰值：≤ 120 req/s（玩家 ↔ 系統，無 P2P 撮合）
- 股票檔數：≤ 10 檔；每檔保留近 200 筆 `StockHistory` 用於繪圖

### 14.2 看板效能策略（混合：Realtime + 60 秒 fallback）
| 層級 | 做法 |
|------|------|
| 客戶端 | Supabase Realtime channel 訂閱 `Stock` / `StockHistory` / `Event` / `BoardConfig`；**60 秒 fallback** 輪詢 `getBoardData` 救援漏推；斷線指數 backoff，連續 3 次失敗才切到 5 秒應急輪詢 |
| 邊緣快取 | **訊號驅動 fetch**（`BoardConfig` UPDATE 觸發）：URL 帶 `?t=${last_tick_at}` 作 cache buster，`Cache-Control: public, max-age=60`，每個 `last_tick_at` 值對應一張獨立快取，新訊號永遠拉到新版本，**避免覆蓋已被 Realtime 更新的本地狀態**。**60 秒 fallback** 拉取走 `Cache-Control: no-store`（量低，每分鐘 1 次直接打 DB 沒壓力） |
| 應用層 | 訊號驅動 fetch 共享同一個 `last_tick_at` URL → 自然合併 3 台看板的請求；fallback 路徑因為 no-store 不快取 |
| 資料庫 | `Stock` 全表掃描可接受（≤ 10 檔）；`StockHistory` 走索引 `(stock_id, recorded_at DESC) LIMIT N` |
| Realtime quota | 1～3 台看板 = 1～3 條 WS（玩家端不開 Realtime，避免 500 條打爆 quota） |

> **負載重估**：
> - **拉取（fallback）**：3 台看板 × 每 60 秒 1 次 = 0.05 req/s。邊緣快取命中率 ≥ 90%，DB 實際被打的頻率 < 0.005 req/s，幾乎為零。
> - **推播（Realtime）**：主持人按「下一回合」→ 一次 UPDATE Stock × 10 檔 + INSERT StockHistory × 10 + UPDATE BoardConfig，Supabase 推給 3 台看板。每 10 分鐘只發生一次，平均負載趨近於 0。
> - **變動延遲**：< 1 秒（後台 UPDATE 到看板顯示）。
> - **結論**：股價 10 分鐘變一次、玩家不輪詢，整個系統幾乎沒有「輪詢瓶頸」這回事。

### 14.3 必建索引清單
```sql
-- 看板曲線：每檔取最近 N 筆
CREATE INDEX idx_stockhistory_stock_recorded
  ON "StockHistory"(stock_id, recorded_at DESC);

-- 排行榜 / 稽核
CREATE INDEX idx_transaction_user_created
  ON "Transaction"(user_id, created_at DESC);
CREATE INDEX idx_transaction_actor_created
  ON "Transaction"(actor_user_id, created_at DESC);

-- 關主後台
CREATE INDEX idx_quickaction_station ON "QuickAction"(station_id);
CREATE INDEX idx_quickaction_owner ON "QuickAction"(owner_user_id);

-- 玩家持有道具查詢
CREATE INDEX idx_playeritem_user ON "PlayerItem"(user_id);

-- 使用次數限額檢查（PK 已隱含主索引；列出顯式索引以提醒）
-- StationUsage / QuickActionUsage 的 PK (station_id/qa_id, user_id) 即為查詢索引

-- 看板事件命中查詢
CREATE INDEX idx_event_active_window
  ON "Event"(is_active, start_at, end_at);

-- 帳號登入
CREATE UNIQUE INDEX uniq_account_login
  ON "Account"(login_id) WHERE login_id IS NOT NULL;
```

### 14.4 交易型操作的鎖策略
| 操作 | 鎖類型 | 衝突處理 |
|------|--------|----------|
| 玩家互轉金錢 | 兩列 `PlayerStats` `FOR UPDATE`，固定 `user_id` 排序 | 死鎖 retry 一次後回前端 |
| 股票買賣 | `SELECT current_price FROM Stock`（不鎖）→ 鎖 `PlayerStats`（單列）→ UPSERT `StockHolding` | 玩家僅鎖自己的 row，跨玩家無衝突 |
| 套用快捷模組 | 鎖 `PlayerStats`（單列） | 不會跨關主衝突 |
| 換匯（福報→現金） | 鎖 `PlayerStats`（單列） | — |

> **不鎖 Stock row** 的決定：股價以呼叫當下 `current_price` 成交，後台改價是非同步事件；若鎖 Stock 會把所有買賣序列化、效能更差。
> 玩家會偶爾遇到「按下時 100，成交時也是 100」的微小不一致，活動情境可接受。

### 14.5 連線池與 Serverless
- Supabase **PgBouncer transaction mode**（port `6543`）— 適合 Vercel serverless 短連線
- **500 人時 PgBouncer 為強制要求**（直連 5432 會在尖峰瞬間爆連線數）
- pg.Pool 設 `max: 10`（per Vercel function instance）；超過用 PgBouncer 排隊
- 兩條環境變數：
  - `DATABASE_URL`（pooled，6543）— Server Actions 走這條
  - `DIRECT_URL`（直連，5432）— migration 才用
- Vercel function 設 `maxDuration: 10`（多數操作 < 1s，給點餘裕避免冷啟動踩線）

### 14.6 前端效能
- Next.js App Router 自動 code-split（每個 route 一包）
- 掃碼器：`dynamic(() => import('@/components/shared/Scanner'), { ssr: false })`
- 行情總表 sparkline：用 `<canvas>` 而非 SVG（檔數多時明顯快）
- 股票 row 與事件元件用 `React.memo` 包，`key` 用 ID
- 圖示走 `next/image` + Vercel Image Optimization；icon emoji 直接渲染不走 image
- 看板頁可加 `export const runtime = 'edge'` 進一步降低延遲（但要確認 pg client 相容）

### 14.7 Realtime vs 輪詢決策
| 條件 | 建議 |
|------|------|
| 活動看板（1～3 台） | **推→拉混合**（詳見 §11）：訂閱 `BoardConfig` 信號 + `Event` Realtime；收到信號後拉 `getBoardData` 取整合快照；60 秒 fallback 拉取救援漏推 |
| 玩家股市介面 / 玩家頁 | **完全不輪詢、不訂閱**：進頁面拉一次、自身 action response 帶回新值、按「🔄 重新整理」手動拉（60 秒節流，詳見 §5.1） |
| 關主前台掃碼後讀玩家狀態 | 一次性 `lookupPlayerByQR`，不需 Realtime |
| 關主快捷模組清單 | 一次性載入後 `localStorage` / SWR 快取，不重撈（活動中極少變動） |

> **設計核心**：500 人 + Supabase 免費版，刻意設計為**事件驅動 + 主動刷新**而非輪詢。整場活動 DB 寫入量峰值在「玩家股市買賣 ≤ 120 req/s」與「主持人按下一回合（每 10 分鐘 1 次）」這兩處。
>
> **附註：為什麼 `getMyStats` 不拆 stats / inventoryHash 兩段**
> 這種拆分（stats 高頻輪詢 + inventory hash 比對只在變動時抓詳情）是為了「30 秒輪詢」設計的省頻寬模式。本系統玩家**完全不輪詢**，每次呼叫 `getMyStats` 都是「進頁面 / 下拉刷新 / action 後」的單次動作 — 一次拉完整快照（四項參數 + 道具 + 持股）反而最簡單，沒有頻寬浪費問題，也不必維護 hash 比對邏輯。

### 14.8 監控與壓測
- **上線前壓測**：用 k6 / artillery 模擬：
  - **開場雪崩**：開賽前 30 秒內 500 人陸續推門 → 模擬 500 條 `getMyStats` + 500 條 `getStockMarket` 在 30 秒內均勻發出（峰值 ≈ 33 req/s）；驗證冷啟動 + 連線池能否吸收
  - 500 人「進頁面 / 重新整理按鈕」混合腳本（活動進行中）：每 60 秒隨機 1 人觸發一次 `getMyStats`（≈ 8 req/s）
  - 120 req/s 股市買賣（玩家主動下單峰值；主要壓力點）
  - 主持人每 10 分鐘按一次「下一回合」（`tickRound`，拆兩個短 tx）
  - 3 台看板每 60 秒 fallback `getBoardData`（變動走 `BoardConfig` 信號 → 拉，不在壓測腳本中）

- **抗開場雪崩策略**：
  - `getMyStats` / `getStockMarket` 加 **5 秒 in-memory cache**（per server instance，per userId 為 key），同一玩家 5 秒內重複呼叫直接回快取，不打 DB
  - 玩家頁前端用 SWR 帶 `revalidateIfStale: false`（拿到一次後不主動重抓）
  - Vercel function 設 `runtime: 'nodejs'` 讓實例熱起來後可重用（`edge` runtime 的 in-memory cache 命中率會差）
- **指標門檻**：
  - p95 latency < 300ms
  - DB 連線池使用率 < 80%
  - Vercel function duration < 1s
  - 5xx 率 < 0.1%
- **告警**：Vercel Analytics 看 5xx 與 p95；Supabase Dashboard 看連線數、慢查詢

### 14.9 防止 N+1 查詢

「N+1」指：先用 1 次查詢取得列表，再為**每筆**結果額外發 1 次查詢取關聯資料，總共 1+N 次往返。10 筆 = 11 次查詢，100 筆 = 101 次。Server Action 看似只執行幾秒，背後可能在跟 DB 來回幾十次，是最常見的隱性效能殺手。

#### 本系統易踩 N+1 的場景
| 場景 | 危險寫法 | 影響規模 |
|------|----------|----------|
| 玩家持有道具列表 | 查 `PlayerItem` → for-loop 查每個 `Item` | 每筆道具 +1 次 |
| 玩家持股列表 | 查 `StockHolding` → for-loop 查每檔 `Stock` | 每檔股票 +1 次 |
| 排行榜（含 inventory） | 查 `PlayerStats` → for-loop 各別取 inventory | 500 玩家 = 500+ 次 |
| 關主快捷模組（含綁定道具） | 查 `QuickAction` → for-loop 查 `Item` | 每筆快捷模組 +1 次 |
| 看板行情總表 + sparkline | 查 `Stock` 列表 → for-loop 各取近 N 筆 `StockHistory` | 10 檔股票 = 10+ 次 |
| 交易紀錄含玩家姓名 | 查 `Transaction` → for-loop 查 `Account.name` | 100 筆紀錄 = 100+ 次 |

#### 三種防範模式

##### 模式 A：Supabase 嵌套 select（讀取首選）
PostgREST 自動 JOIN，回傳即為一次查詢。

```ts
// ❌ N+1
const { data: items } = await supabase
  .from('PlayerItem').select('*').eq('user_id', uid)
for (const pi of items) {
  const { data: item } = await supabase
    .from('Item').select('*').eq('id', pi.item_id).single()
  pi.item = item
}

// ✅ 一次嵌套
const { data } = await supabase
  .from('PlayerItem')
  .select('*, item:Item(name, icon, description)')
  .eq('user_id', uid)
```

##### 模式 B：批次 IN 查詢（與 N 無關，固定 2 次）
適合需要精細控制 SELECT 欄位、或在 pg 交易裡的場景。

```ts
// ✅ 兩次查詢，與 N 無關
const playerItems = await pool.query(
  `SELECT * FROM "PlayerItem" WHERE user_id = $1`, [uid]
)
const itemIds = playerItems.rows.map(r => r.item_id)
const items = await pool.query(
  `SELECT * FROM "Item" WHERE id = ANY($1)`, [itemIds]
)
const itemMap = new Map(items.rows.map(i => [i.id, i]))
const result = playerItems.rows.map(pi => ({
  ...pi, item: itemMap.get(pi.item_id),
}))
```

##### 模式 C：原生 JOIN（寫入路徑或複雜聚合）
最少往返、效能最好；缺點是 SQL 較難維護。

```ts
// ✅ 一次查詢
const result = await pool.query(`
  SELECT
    pi.id, pi.granted_at,
    i.name AS item_name, i.icon AS item_icon
  FROM "PlayerItem" pi
  JOIN "Item" i ON i.id = pi.item_id
  WHERE pi.user_id = $1
`, [uid])
```

#### 看板行情總表 + sparkline 的特殊解法
要為**每檔股票**取近 N 筆 `StockHistory` 無法用普通 JOIN（會笛卡爾積爆炸）。用 `LATERAL JOIN`：

```sql
SELECT
  s.id, s.code, s.name, s.current_price,
  h.price_array
FROM "Stock" s
LEFT JOIN LATERAL (
  SELECT array_agg(price ORDER BY recorded_at DESC) AS price_array
  FROM (
    SELECT price, recorded_at
    FROM "StockHistory"
    WHERE stock_id = s.id
    ORDER BY recorded_at DESC
    LIMIT 30
  ) sub
) h ON true
WHERE s.is_visible = true;
```

回傳即為「一筆一檔股票，含 price_array」，前端直接畫 sparkline，一次查詢搞定。

#### Code review 檢查清單
- [ ] 函式內出現 `for (...) { await db.query(...) }` → 紅旗
- [ ] `await Promise.all(items.map(i => db.query(...)))` → **還是 N+1**（只是平行化），仍要改批次或嵌套
- [ ] 取列表後又對「每筆」做 `.select()` / `pool.query()` → 紅旗
- [ ] Supabase select 沒用嵌套語法、自己分兩次拼 → 改嵌套或 IN
- [ ] 關聯欄位（FK）是否在 §14.3 索引清單內

> **準則**：函式內的 DB 查詢次數應與資料筆數**無關**，只與「查詢類型數」有關。

### 14.10 容量瓶頸與擴展
| 瓶頸 | 觸發條件 | 解法 |
|------|----------|------|
| Vercel function 冷啟動 | 流量低谷後突然回升 | 看板與玩家首頁設 `revalidate` 或 ISR，常駐熱實例 |
| Supabase 連線數爆 | 同時 > 100 個 pg 連線 | 改走 PgBouncer 6543；確認 `max: 10`/instance |
| Realtime 連線數爆 | > 500 條 WS | 玩家端一律輪詢；Realtime 只給看板 |
| 排行榜慢查詢 | `PlayerStats` ORDER BY 全表掃，500 列以上明顯變慢 | **本系統不需要物化視圖**：排行榜只在 `triggerFinalScoring` 終局結算時計算一次（500 列 × 一次 ORDER BY，O(n log n) 完全沒問題）；活動進行中**不公開即時排行**（避免玩家偏離劇情） |

---

## 15. 部署與環境

### 推薦架構
- **前端 + Server Actions**：Vercel
- **資料庫**：Supabase（PostgreSQL + Auth + Realtime）
- **靜態資源**：Vercel CDN

### 部署檢查清單
- [ ] 執行資料庫初始化 migration（`supabase/migrations/0001_init.sql`）
- [ ] 設定環境變數（見上節）
- [ ] 建立首位管理員帳號（種子腳本或 SQL 直接 INSERT）
- [ ] 設定 `AppSettings` 預設值（匯率、初始參數、QR TTL）
- [ ] 開啟 `BoardGameEnabled='true'` 進行驗收測試

### 開發指令
```bash
npm run dev      # 開發伺服器（localhost:3000）
npm run build    # 正式建置
npm run lint     # ESLint 檢查
```

### 程式碼配置

詳見 §4「元件目錄結構」（本文件單一正本）。本節保留為部署檢查項，不再重複列樹。

### UI 規範
- **每個 UI 變更同時考慮桌面與手機**：使用 Tailwind 響應式 prefix（`md:`、`lg:`）
- 觸控目標 ≥ 44px（手機可用性）
- 避免 `fixed` / `absolute` 元素在小螢幕互相覆蓋
- 掃碼前台是手機優先介面，需特別測試直立／橫式切換、權限取得、相機釋放
