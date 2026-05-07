# 開運大富翁 V2

獨立部署的活動型小遊戲系統。詳見 [`docs/BOARD_GAME_V2.md`](docs/BOARD_GAME_V2.md)（功能規格）與 [`docs/BOARD_GAME_V2_ARCHITECTURE.md`](docs/BOARD_GAME_V2_ARCHITECTURE.md)（系統架構）。
協作規範與紅旗清單見 [`CLAUDE.md`](CLAUDE.md)。

## 技術棧

| 層 | 工具 |
|---|---|
| 前端 | Next.js 16（App Router）、React 19、Tailwind 4 |
| 後端 | Next.js Server Actions |
| 寫入 | `pg` 連線池 + 顯式交易 |
| 認證 | JWT (HS256, `jose` for edge / `jsonwebtoken` for node) |
| 資料庫 | PostgreSQL 16（Supabase 上線） |
| 部署 | Vercel + Supabase |

## 部署

照著 [`DEPLOY.md`](DEPLOY.md) 一步步走。

## 本機開發

```bash
cp .env.local.example .env.local
# 編輯 .env.local 填 AUTH_SECRET / QR_SECRET（用 openssl rand -hex 32 各產一組）

npm install
npm run db:up        # 啟動 Docker Postgres
npm run db:migrate   # 套用 schema
npm run db:seed      # 塞測試資料（admin/admin1234、captain1/captain12、player001/player001）
npm run dev          # http://localhost:3000
```

需要 Docker Desktop 或本機 Postgres。

## 常用指令

| 指令 | 用途 |
|---|---|
| `npm run db:up` / `db:down` | 啟 / 關本機 Postgres |
| `npm run db:migrate` | 套用 `supabase/migrations/*.sql` |
| `npm run db:seed` | 開發環境 seed（含測試帳號） |
| `npm run db:seed:prod` | 上線 seed（只塞 admin、命格範本、AppSettings） |
| `npm run db:reset` | docker down -v + up + migrate + seed（炸掉重來） |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | TypeScript 檢查 |
