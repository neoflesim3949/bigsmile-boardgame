# 安全性稽核報告 — 開運大富翁 V2

> 稽核日期：2026-05-02
> 範圍：傳輸加密、靜態資料、認證 / Token、Cookie、Secret 管理、攻擊面
> 結論：**對 2 小時活動小遊戲的安全性是合理的**。網路傳輸全程 TLS，密碼 bcrypt。DB 直接外洩會看到玩家姓名 / 四項值 / 交易歷史明文（但屬遊戲內虛擬數值，無真實金流）。

---

## 1. 已加密的部分（駭客**拿不到**明文）

### 1.1 傳輸層（Network in transit）

| 路徑 | 加密 | 註 |
|------|------|----|
| **瀏覽器 → Vercel** | TLS 1.2/1.3（HTTPS）✅ | Vercel 自動配 Let's Encrypt |
| **Vercel → Supabase** | TLS（`sslmode=require`）✅ | pooler.supabase.com 強制 TLS |
| **看板 Realtime（WebSocket）** | WSS（TLS）✅ | Supabase Realtime 走 wss:// |

**結論**：網路層任何人在 wifi / ISP 抓封包都拿到亂碼。

### 1.2 密碼

| 資料 | 處理 | 駭客拿到 |
|------|------|---------|
| **登入密碼** | `bcrypt cost=12`（單向 hash）| ❌ 拿不到原密碼，要暴力破解每組 ~10 秒 |

實作位置：[src/app/actions/admin.ts](../src/app/actions/admin.ts)（`bcrypt.hash(password, 12)`）。

### 1.3 Token

| Token | 演算法 | 防偽裝 |
|-------|-------|------|
| **JWT (access / refresh)** | HMAC-SHA256（`AUTH_SECRET`）| 駭客沒 AUTH_SECRET 偽造不出 |
| **玩家 QR token** | HMAC-SHA256（`QR_SECRET`）+ nonce + 5 分鐘 exp | 同上 |
| **看板 display token** | HMAC-SHA256 + 可撤銷（`DisplayToken` 表）| 同上 |

實作位置：[src/lib/auth.ts](../src/lib/auth.ts)、[src/lib/qr.ts](../src/lib/qr.ts)。

### 1.4 Cookie

```ts
{ httpOnly: true, secure: production, sameSite: 'lax' }
```

| 防禦 | 結果 |
|------|------|
| **XSS 偷 cookie** | ✅ httpOnly 阻擋 JS 讀取 document.cookie |
| **HTTPS 強制** | ✅ secure flag（production） |
| **CSRF** | ✅ Server Action 是 POST + sameSite=lax 雙保險 |

### 1.5 機密設定（Secrets）

| Secret | 暴露位置 | 註 |
|--------|---------|----|
| `AUTH_SECRET` | server-side only ✅ | 沒 `NEXT_PUBLIC_` 前綴 |
| `QR_SECRET` | server-side only ✅ | 同上 |
| `DATABASE_URL`（含 DB 密碼）| Vercel env（at-rest 加密）+ 本地 .env.local（已 .gitignore）| ✅ 不在 repo |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side only ✅ | 同上 |

---

## 2. 駭客**能拿到**明文的情境

### 情境 A：DB 直接被入侵 / DATABASE_URL 外洩 ⚠️

如果 `DATABASE_URL` 不小心外洩（commit 到 public repo、Vercel 環境變數被偷、開發者電腦被入侵），駭客直接連 DB：

| 資料 | 明文程度 |
|------|---------|
| **玩家姓名、user_id** | ❌ **明文** |
| **金錢 / 健康 / 福分 / 業力** | ❌ **明文** |
| **命格、持股、借貸、道具** | ❌ **明文** |
| **Transaction 歷史 payload** | ❌ **明文**（含每筆交易細節） |
| **登入密碼** | ✅ 仍是 bcrypt hash（要暴力破解） |
| **QR / JWT / Display token** | ✅ 都是 transient，DB 沒存 |

> Supabase 預設只有 **storage-level 加密**（AES-256 at rest），**沒有 column-level 加密**。一旦 DB 被入侵，玩家 stats / 交易歷史都是明文。

**緩解**：
- `.env.local` 已 `.gitignore`，不會 commit 到 GitHub
- Vercel 環境變數有 at-rest 加密
- 不公開 DB 連線字串給非開發者

### 情境 B：Supabase / Vercel 平台被入侵

機率極低，但理論上平台員工或被 root 的服務可能看到：
- DB 內所有 plaintext data
- Vercel function 的環境變數（包含 secrets）

**無法防禦** — 仰賴平台廠商安全控制（Vercel SOC2 / Supabase SOC2）。

### 情境 C：客戶端 JS 被改包（XSS）

- HttpOnly cookie 阻擋偷 JWT ✅
- 但若駭客成功 XSS（玩家輸入沒被擋住的 `<script>`），可以代替玩家發 server action

**防禦**：
- 玩家輸入**沒套 dangerouslySetInnerHTML**（CLAUDE.md §11 紅旗清單）✅
- 跑馬燈渲染為純文字 ✅
- 命格名 / 玩家姓名走 React 預設 escape ✅

### 情境 D：MITM 攻擊（中間人）

- TLS 1.2+ 已大致防住
- ⚠️ 但 `pg` ssl 用 `rejectUnauthorized: false`（接受任何 cert）— 理論上若有人能在 Vercel ↔ Supabase 之間插件，可做 MITM
- 實務上：兩個平台間走 AWS 內網，要插件難度極高
- **這是配置缺陷**，不是嚴重 bug

實作位置：[src/lib/db.ts:19](../src/lib/db.ts#L19)。

---

## 3. 風險矩陣

| 攻擊面 | 風險度 | 防禦現況 | 建議 |
|--------|-------|---------|------|
| 網路抓包（wifi / ISP）| 🟢 低 | TLS 全程加密 | 無需改 |
| XSS 偷 token | 🟢 低 | HttpOnly + 無 dangerouslySetInnerHTML | 無需改 |
| CSRF | 🟢 低 | sameSite=lax + POST | 可升 `strict` 更穩 |
| SQL Injection | 🟢 低 | 全 parameterized | 無需改 |
| 暴力登入 | 🟡 中 | rate limit per-account 5 次 / 分鐘（CLAUDE.md §4.5）| ✅ 已防 |
| **DB 外洩** | 🟡 中 | bcrypt 保護密碼，其餘**明文** | 升級加密見 §4 |
| Supabase pg cert 不驗證 | 🟢 低 | TLS 仍加密；只是 cert 不驗 | 補 cert 驗證 |
| 玩家姓名 / 持股**隱私** | 🟡 中 | DB 明文 | 活動性質低敏感，可接受 |

---

## 4. 建議的加固項（按 ROI 排序）

### 4.1 🟡 補 Supabase pg 連線 cert 驗證（5 分鐘工作）

**現況**：
```ts
// src/lib/db.ts
ssl: isLocal ? undefined : { rejectUnauthorized: false }
```

**改成**：
```ts
ssl: isLocal ? undefined : { rejectUnauthorized: true, ca: SUPABASE_CA_CERT }
```

**效益**：阻擋 MITM 攻擊（理論性，實務發生率極低）
**成本**：1 行 code + 維護 cert（Supabase 旋轉時要更新）

### 4.2 🟢 sameSite cookie 升級到 'strict'（可選）

**收益**：防 cross-site GET CSRF（目前 lax 已防 POST CSRF，僅是 belt-and-suspenders）
**成本**：跨站連結登入流程 UX 略差（活動現場分享連結時要求要在 app 內登入）

### 4.3 🔴 column-level 加密（不建議）

對 `Account.name`、`Transaction.payload` 用 pgcrypto AES 加密。

**收益**：DB 外洩仍看不到敏感欄位
**成本**：
- 改 schema
- 每次 query 要 ENCRYPT/DECRYPT
- 索引 / WHERE 比對失效（搜尋姓名得全表 decrypt）
- 看板 / 排行榜每次都要 decrypt 500 列 → 效能 -10x

**結論**：對虛擬遊戲數值不值得。

### 4.4 🟢 Supabase Vault 存 token secret（可選）

把 `AUTH_SECRET` / `QR_SECRET` 從 env 搬到 Supabase Vault。

**收益**：DB 外洩看不到 secret（但 env 也沒外洩風險）
**成本**：app 啟動時多查一次 vault
**結論**：marginal improvement，不急。

---

## 5. 已驗證通過的安全原則（CLAUDE.md §4 / §11）

- ✅ **後端是唯一真相**：所有 server action 開頭以 session 取得登入者，**禁止信任前端傳入 actorUserId**
- ✅ **JWT payload 含 role**：middleware 純解碼即可路由保護，不打 DB
- ✅ **bcrypt cost ≥ 12**：抗暴力破解
- ✅ **HMAC-SHA256 token**：含 nonce + exp，防 replay
- ✅ **環境變數無 NEXT_PUBLIC_ 前綴包敏感值**
- ✅ **DB 連線帶 sslmode=require**
- ✅ **rate limit 主防線 per-account**：500 人共用 NAT IP 場景考量
- ✅ **SQL parameterized query**：禁字串拼接
- ✅ **玩家輸入禁套 dangerouslySetInnerHTML**：跑馬燈 / 事件文字渲染為純文字
- ✅ **重生雙保險**：手動輸入 ID 路徑前端不顯示重生鍵 + 後端 `rebirthPlayer` 只收 `qrToken`
- ✅ **assertNotTourMode + assertNotDuringFinalScoring**：所有玩家 / 關主寫入 action 都套了

---

## 6. 結論

> **「資料是加密狀態下被傳輸的嗎？」**
> 是。瀏覽器 ↔ Vercel ↔ Supabase 全程 TLS。看板 Realtime 走 WSS。任何網路節點抓包只看到亂碼。

> **「駭客能直接撈到明文嗎？」**
>
> | 攻擊路徑 | 拿到明文？ |
> |---------|----------|
> | 網路抓包（wifi / ISP / 公司代理） | ❌ 拿不到（TLS 加密） |
> | XSS 偷 token | ❌ 拿不到（HttpOnly cookie） |
> | SQL injection | ❌ 拿不到（全 parameterized） |
> | DB 直接入侵 / DATABASE_URL 外洩 | ⚠️ 玩家姓名 / 四項值 / 交易歷史是**明文**；密碼是 bcrypt 不是明文 |
> | Supabase / Vercel 平台被入侵 | ⚠️ 仰賴平台 SOC2 控制 |

### 對活動規格的安全結論

| 評估面向 | 結論 |
|---------|------|
| **2 小時活動小遊戲** | ✅ 安全配置合理，無真實金流或敏感個資 |
| **遊戲內虛擬數值（金錢/健康/福分/業力）** | ✅ DB 外洩風險可接受（沒實質損失） |
| **玩家姓名 / 命格** | 🟡 算個資但不敏感（活動可公開） |
| **登入密碼** | ✅ bcrypt 強加密 |
| **必要的小加固** | 補 pg SSL cert 驗證（5 分鐘工作）|

---

## 7. 後續行動

| 項目 | 優先 | 估時 |
|------|------|------|
| 補 Supabase pg cert 驗證 | P2 | 5 分鐘 |
| sameSite cookie 升 strict | P3 | 1 分鐘（可選）|
| Supabase Vault 存 secret | P4 | 30 分鐘（可選）|
| Column-level 加密 | ❌ 不建議 | — |

---

*本報告由 [`/security-review`](../../.claude/agents) skill 概念執行（手動稽核 + 程式 grep）。*
