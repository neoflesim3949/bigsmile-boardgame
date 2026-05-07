# 部署手冊：GitHub + Supabase + Vercel

按順序做。每個步驟結束時應該都能看到「綠色勾」或可點選的下一步。

---

## A. GitHub（10 分鐘）

### A1. 建 GitHub repo

1. 打開 https://github.com/new
2. **Repository name**：`bigsmile-boardgame`（或你想要的名字）
3. **Visibility**：Private 或 Public 皆可
4. **不要**勾「Initialize with README / .gitignore / license」（本地已有）
5. 按 **Create repository**

GitHub 會給你一個指令清單，先別急著跑，留著 repo URL（例如 `https://github.com/你的帳號/bigsmile-boardgame.git`）。

### A2. 把本地推上去

回 terminal，在專案目錄下：

```bash
git remote add origin https://github.com/你的帳號/bigsmile-boardgame.git
git branch -M main
git push -u origin main
```

> 第一次 push 會跳出登入流程。建議用 GitHub 的 [Personal Access Token](https://github.com/settings/tokens) 當密碼（Classic token，勾 `repo` scope，複製貼上即可）。

完成後重整 GitHub 頁面，應該能看到所有檔案。

---

## B. Supabase（15 分鐘）

### B1. 建 Supabase 專案

1. 打開 https://supabase.com/dashboard 登入（用 GitHub 登入最快）
2. **New project**
3. 填：
   - **Name**：`bigsmile-boardgame`
   - **Database Password**：點 **Generate a password** 產一組強密碼，**馬上複製貼到密碼管理工具**（之後找不回來）
   - **Region**：選 `Northeast Asia (Tokyo)` 或 `Southeast Asia (Singapore)`，看活動辦在哪
   - **Pricing Plan**：Free 即可
4. 按 **Create new project**，等 1–2 分鐘 provisioning 完成

### B2. 取得連線字串

Supabase 提供兩種 connection URL，我們都要用：

1. 進專案 → 左側 **Project Settings**（齒輪圖示）→ **Database**
2. 滑到 **Connection string** 區塊
3. 切到 **URI** 分頁，會看到三組：

| 模式 | 用途 | 端口 |
|------|------|------|
| **Direct connection** | 跑 migration 用 | `5432` |
| **Transaction pooler** | Vercel runtime 用 | `6543` |
| **Session pooler** | 用不到 | `5432` (pooler) |

兩條都複製下來，把 `[YOUR-PASSWORD]` 換成 B1 那組密碼。長這樣：

```
# Direct（migration 用）
postgresql://postgres.xxxxxxxxxxxxxxxx:你的密碼@aws-0-ap-northeast-1.compute.amazonaws.com:5432/postgres

# Transaction pooler（Vercel 用）
postgresql://postgres.xxxxxxxxxxxxxxxx:你的密碼@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
```

### B3. 跑 migration（從本機推到 Supabase）

在本機專案目錄：

```bash
# 暫時把 DATABASE_URL 指到 Supabase Direct（5432）跑 migration
DATABASE_URL='貼上 Direct connection URL' npx tsx scripts/migrate.ts
```

成功會看到：
```
→ Applying 0001_init.sql
  ✓ 0001_init.sql
```

> ⚠️ migration **必須走 Direct（5432）**，不能走 Transaction pooler。pooler 不支援 prepared statements，跑 DDL 會失敗。

### B4. 塞 production seed（admin 帳號 + 命格範本 + AppSettings）

```bash
DATABASE_URL='貼上 Direct connection URL' \
ADMIN_LOGIN_ID='admin' \
ADMIN_PASSWORD='你的強密碼至少12字元' \
npx tsx scripts/seed-prod.ts
```

> 不要跑 `npm run db:seed`（那會塞測試 player / captain，不適合上線）。
> `ADMIN_PASSWORD` 是你之後登入後台用的密碼，不是 Supabase DB 密碼。

### B5. 在 Supabase Table Editor 確認

進 Supabase → 左側 **Table editor**，應該能看到 17 張表（Account / PlayerStats / Stock / …）。
打開 `Account` 表應該有一筆 `admin001`，`AppSettings` 表應該有 18 筆預設值。

---

## C. Vercel（10 分鐘）

### C1. 產 secret

```bash
# 各產一組 64 字 hex secret
openssl rand -hex 32   # 拿來當 AUTH_SECRET
openssl rand -hex 32   # 拿來當 QR_SECRET
```

兩組都複製下來。

### C2. 連 Vercel

1. 打開 https://vercel.com/new
2. 用 GitHub 登入授權
3. **Import Git Repository** 找你的 `bigsmile-boardgame` repo，按 **Import**

### C3. 設定環境變數

Vercel 會跳到專案設定頁。展開 **Environment Variables**，逐筆貼上：

| Key | Value | 哪裡來 |
|-----|-------|--------|
| `DATABASE_URL` | Supabase **Transaction pooler**（6543）連線字串 | B2 |
| `AUTH_SECRET` | 64 字 hex | C1 |
| `QR_SECRET` | 64 字 hex（與 AUTH_SECRET 不同） | C1 |
| `ACCESS_TOKEN_TTL_SECONDS` | `1800` | 預設 30 分鐘 |
| `REFRESH_TOKEN_TTL_SECONDS` | `604800` | 預設 7 天 |

> **重點**：Vercel 用的是 **Transaction pooler（6543）**，不是 Direct（5432）。serverless function 每次冷啟都會開新連線，pooler 才能撐得住。

### C4. Deploy

按 **Deploy**，等 2–3 分鐘 build。

成功後 Vercel 會給你一個 `*.vercel.app` 網址。打開試登入：

- 帳號：你在 B4 設的 `ADMIN_LOGIN_ID`
- 密碼：你在 B4 設的 `ADMIN_PASSWORD`

成功登入應該會被導到 `/admin`。

---

## D. 驗收 checklist

- [ ] GitHub repo 上有所有 commit
- [ ] Supabase Table editor 看得到 17 張表 + `Account` 有 admin 一筆
- [ ] Vercel 部署成功，`https://你的-app.vercel.app/login` 能打開
- [ ] 用 admin 帳密能登入並導到 `/admin`
- [ ] 登出後重 login 仍正常

---

## E. 常見問題

### Q：登入時跳「INTERNAL_ERROR」
通常是 `DATABASE_URL` 沒設或設錯。Vercel → 你的專案 → **Logs** → 點失敗的 request 看詳細錯誤。
最常見：把 Direct URL（5432）填到 Vercel 而非 Pooler URL（6543），或密碼有特殊字元沒 URL-encode。

### Q：Vercel build 失敗 `Module not found`
檢查 `package.json` 的 deps 都已 commit。本地跑 `npm run build` 先確認能 build 成功。

### Q：可以後續推 commit 嗎
可以，每次 `git push origin main` Vercel 會自動 redeploy。

### Q：之後加新 migration 怎麼辦
1. 在 `supabase/migrations/` 加新檔（檔名要遞增，例：`0002_xxx.sql`）
2. commit + push 到 GitHub
3. 在本機跑 `DATABASE_URL='Direct URL' npx tsx scripts/migrate.ts`（Vercel 不會自動跑 migration）

### Q：如何切換 production / preview 的 env
Vercel **Settings → Environment Variables** 每筆都有三個勾選：Production / Preview / Development。先全勾就好。
