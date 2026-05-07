# 活動現場 Runbook — 出現 bug / 死機處理流程

> 撰寫日期：2026-05-06
> 目標：活動進行中遇到問題 → 30 秒判斷等級 → 對應處置
> 使用方式：手機開著、按 Ctrl-F 找症狀、跟著步驟做

---

## 🎯 30 秒急救決策樹

```
有人回報問題
     ↓
是「個別玩家自己一人」？───→ ✅ 等級 A：請玩家重整 / 重連 / 換裝置
     ↓ 否
是「多人都有同樣症狀」？───→ ⚠️ 等級 B：看 dashboard 找根因（1-3 min）
     ↓ 否
整站 503 / 寫不進 DB？───→ 🚨 等級 C：升級 Compute / Vercel rotate / SQL 救
     ↓ 否
資料毀損 / 整 region 掛？──→ ☠️ 等級 D：停玩、轉紙本、找 Supabase support
```

---

## 活動前準備（活動前一天做）

### ✅ 必備清單

- [ ] Vercel `LOAD_TEST_ENABLED` env var **已移除**（curl probe 應回 403）
- [ ] Vercel deploy 是最新 main commit
- [ ] Supabase Dashboard → Database → 確認沒被 paused（Free tier 1 週不活動會 pause）
- [ ] Supabase Dashboard → Replication → 確認 `BoardConfig` 在 `supabase_realtime` publication 內（看板 < 1s 推送）
- [ ] AppSettings 確認設好：`BoardGameEnabled='false'`（活動開始前是 false、開幕按下去才轉 true）
- [ ] 至少 1 個 admin 帳號 + 5 個 captain 帳號可登入
- [ ] 500 個玩家帳號已建立（admin/accounts 頁確認）

### ✅ 開好 4 個 tab（手機）

1. Vercel Dashboard：https://vercel.com/dashboard
2. Supabase Dashboard：https://supabase.com/dashboard/project/qtlxhhuajkpoakusmkme
3. 你的 admin：https://bigsmile-boardgame.vercel.app/admin
4. 紙本備用記分表（活動 backup）

### ✅ 急救 SQL 存到記事本（可隨時貼到 Supabase SQL Editor）

#### A. 緊急停止全部寫入（保護資料）
```sql
-- 玩家 / 關主寫入會被 assertNotFrozen 擋下
INSERT INTO "AppSettings" (key, value) VALUES ('TourMode', 'true')
ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now();
```
記得活動恢復時要：
```sql
UPDATE "AppSettings" SET value = 'false' WHERE key = 'TourMode';
```

#### B. 修單一玩家四項數值（金錢 / 健康 / 福分 / 業力）
```sql
UPDATE "PlayerStats"
SET money = 1000, health = 100, blessing = 50, karma = 0
WHERE user_id = '<玩家_user_id>';
-- 順手補一筆 audit
INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
VALUES ('<玩家_user_id>', '<admin_user_id>', 'manual_fix',
  '{"reason":"runbook fix","fields":["money","health","blessing","karma"]}'::jsonb);
```

#### C. 強制讓玩家重生（admin 直接做、不用 captain 掃 QR）
```sql
UPDATE "PlayerStats"
SET money = 500, health = 50, blessing = 5, karma = 0,
    rebirth_count = rebirth_count + 1, bank_loan = 0, loan_updated_at = NULL
WHERE user_id = '<玩家_user_id>';
DELETE FROM "StockHolding" WHERE user_id = '<玩家_user_id>';
DELETE FROM "PlayerLoan" WHERE user_id = '<玩家_user_id>';
DELETE FROM "PlayerItem" WHERE user_id = '<玩家_user_id>';
```

#### D. 看最近 Transaction（debug）
```sql
SELECT created_at, user_id, actor_user_id, tx_type, payload
FROM "Transaction"
WHERE user_id = '<玩家_user_id>'
ORDER BY created_at DESC LIMIT 20;
```

#### E. 解登入鎖（玩家連錯 5 次密碼被鎖 15 分鐘）
```sql
DELETE FROM "LoginThrottle" WHERE login_id = '<玩家_login_id>';
```

---

## 等級 A — 個別玩家問題（最常見）

> 不需要工程介入，請玩家做以下動作即可解決。

### A1. 「我登不進去」

| 症狀 | 處置 |
|------|------|
| 看到「目前登入人潮較多」訊息 | 等 3 秒再點「登入」即可（自動 retry 已內建）|
| 看到「帳號或密碼錯誤」 | 確認帳密；連錯 5 次會鎖 15 分鐘 → 找 admin 跑 SQL E |
| 看到「登入嘗試過多」 | 已被鎖、找 admin 跑 SQL E 解鎖 |
| 完全沒反應 / spinner 卡住 | 重整頁面再試；換 4G / wifi；換手機 |

### A2. 「我買股 / 賣股按下去沒反應」

| 處置 | 為什麼 |
|------|-------|
| 1. 重整頁面 | 帶回最新狀態，沒資料丟失 |
| 2. 看「庫存市值」是不是更新 | 可能已成功只是頁面沒刷新 |
| 3. 點右上角 🔄 重新整理 | 強制拉新 stats（60s 冷卻內看不到變動）|
| 4. 看錯誤訊息 | 「金錢不足」/「持股不足」是預期、不是 bug |

### A3. 「我看不到自己的分數 / 數值是 0」

- 玩家可能還沒抽命格 → 引導去 `/onboarding`
- 看 `ShowAllStats` 是不是 false（admin 自己關過）→ admin 後台 `/admin/settings` 切回 true

### A4. 「掃 QR 一直失敗」

- QR 5 分鐘 TTL，過期 → 玩家點自己 home 的 QR icon **重新生成**
- 鏡頭模糊 / 反光 → 換手機距離、找好光源
- 還不行 → 關主用「手動輸入 ID」路徑（玩家報自己 user_id）

### A5. 「我進入地獄畫面動不了」

- 玩家 health ≤ 0 或 blessing ≤ 0 = 進入地獄
- 找關主（必須是 `allow_rebirth=true` 的關卡）幫他重生
- 玩家**主動**把 QR 拿給關主掃（手動輸入 ID **不行**，前後端雙重防呆）
- 還不行 → admin 跑 SQL C

---

## 等級 B — 多人同症狀（需查 dashboard）

### B1. 「多人說登入慢 / 失敗」

**檢查順序**：

1. **Vercel Dashboard → Functions** → 看 invocations / errors / latency
2. **Supabase Dashboard → Database → Connection Pooler** → 看 active connections（撞 200 = 撞 pool ceiling）
3. **看時段**：剛開幕的 5 分鐘登入潮是預期的、自動 retry + jitter 救到 95%
4. **真的撞牆**：臨時升 Supabase Compute MICRO（pool 200 → 200 但 CPU 強 2x）→ 5 分鐘改善

### B2. 「多人說買賣 spinner 卡住」

**檢查順序**：

1. **Supabase Dashboard → Database → Health** → CPU / RAM 使用率
2. **Logs → Recent Errors** → 看 deadlock / EMAXCONN
3. **Vercel Dashboard → Logs → Realtime** → 看 5xx 比例
4. **如果 CPU > 80%** → 升 Supabase Compute SMALL（按比例 ~$0.5/小時）
5. **如果只是偶發**：retry 已內建、不用動

### B3. 「看板不更新 / 跑馬燈沒出來」

| 檢查 | 動作 |
|------|------|
| 看板頁面 F5 | 重新訂閱 Realtime |
| `BoardConfig` 在 publication 內？ | Supabase Dashboard → Database → Replication 確認 |
| Migration 0015 跑過嗎？ | SQL editor 跑 `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'BoardConfig'` 應有 1 row |
| 跑馬燈過期 | admin 重新發送一次（看板 marquee_until 已過）|
| 看板 token 過期 | 去 admin/events 重發 token、看板用新 URL |

### B4. 「多人說頁面跳轉錯 / 進不去 admin」

- 通常 cookie 問題，請對方用瀏覽器隱身模式
- 還不行 → admin 自己 logout / login

---

## 等級 C — 系統級問題（admin 介入）

### C1. 整站 503 / 502

1. 開 https://vercel-status.com 看 Vercel 是不是出事
2. 開 https://status.supabase.com 看 Supabase 是不是出事
3. 都正常 → 看 Vercel Deployments 是不是有 deploy fail / runtime error
4. 都不是 → 看 Vercel function logs 找 stack trace

### C2. 整站變慢但還能用（每個 op > 5 秒）

**立即處置（5 分鐘內可解）**：

1. Supabase Dashboard → Database → Compute Add-on
2. 升 Compute SMALL（$15/月，按比例 ~$0.5/小時）
3. 即時生效（不需 redeploy）
4. 活動完降回 NANO（總成本 < $5）

### C3. 多人說數值不對（金錢 / 持股不對）

**先停寫入，再查根因**：

1. 跑 SQL A（TourMode='true'）→ 立即停止所有玩家寫入
2. 廣播：「系統暫停 5 分鐘，請大家先休息」
3. 跑 SQL D 看出問題玩家的最近 Transaction → 找出哪個 op 出錯
4. 跑 SQL B 修數值
5. 跑 SQL A 反向（TourMode='false'）→ 恢復寫入
6. 廣播：「恢復遊玩、剛才受影響的玩家數值已修復」

### C4. admin dashboard 進不去

1. 用瀏覽器**隱身模式**試（多半是 cookie 問題）
2. 還不行 → 直接到 Supabase SQL Editor 操作
3. SQL Editor 在 Dashboard → SQL Editor 分頁、有 admin 權限可跑任何 SQL

---

## 等級 D — 災難級（中止活動）

### D1. Supabase 整個 region 掛掉

- 沒辦法救（不是你的問題）
- 廣播：「系統暫時無法使用，請等候 / 改用紙本記錄」
- 5-15 分鐘觀察 status.supabase.com，等服務恢復
- 恢復後檢查資料是否有缺失（可能要從紙本補）

### D2. 資料庫被 DROP / 大量資料毀損

**Free tier 沒有 daily backup**（Pro plan 才有 7 天）。

緊急步驟：
1. 立即停玩（SQL A）
2. 開 Supabase support ticket（Dashboard → Help → Submit ticket）
3. 即使 Free tier，他們可能能從某個快照救（不保證）
4. **同時**準備紙本 fallback、把活動繼續完
5. 活動結束後人工從紙本重建資料

### D3. AUTH_SECRET 外洩

1. Vercel Dashboard → Environment Variables → 重新生成 `AUTH_SECRET`（用 `openssl rand -hex 32`）
2. Save → redeploy
3. 所有人 session 失效 → 廣播「請所有人重新登入」
4. 玩家重新登入後狀態保留（DB 沒動）

---

## 紙本 Backup 流程（D 級啟動時）

### 預先準備

5 個關卡每個關主一張：

```
關卡名：______________   關主：______________

時間 | 玩家姓名 | 玩家ID(後4碼) | 動作 | 金錢±  健康±  福分±  業力±  道具
─────┼──────────┼─────────────┼─────┼────────────────────────────────
     |          |             |     |
     |          |             |     |
```

### 活動結束後人工輸入

跑 SQL：
```sql
INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload, created_at)
VALUES (
  '<玩家_user_id>', '<admin_user_id>', 'manual_offline_recovery',
  '{"money_delta": 100, "blessing_delta": 5, "source":"paper_log"}'::jsonb,
  '<紙本記錄的時間>'
);

UPDATE "PlayerStats"
SET money = money + 100, blessing = blessing + 5
WHERE user_id = '<玩家_user_id>';
```

---

## 必備聯絡資訊與工具

| 角色 | 任務 |
|------|------|
| **主持人** | 廣播訊息、引導玩家 |
| **admin（你）** | dashboard 監控、SQL 救援 |
| **5 位關主** | 站點操作、回報異常 |
| **1 位 backup 工程師（如有）** | 待命處理 D 級 |

| 工具 | URL |
|------|-----|
| Vercel Dashboard | https://vercel.com/dashboard |
| Supabase Dashboard | https://supabase.com/dashboard/project/qtlxhhuajkpoakusmkme |
| Vercel status | https://vercel-status.com |
| Supabase status | https://status.supabase.com |
| Admin 入口 | https://bigsmile-boardgame.vercel.app/admin |

---

## 緊要時的廣播詞 template

### 短暫變慢（B 級）
> 「系統有點忙，請大家稍等 1-2 分鐘，不要連續按按鈕。會自動恢復。」

### 暫停修復（C 級）
> 「系統暫停 5 分鐘進行修復，請各位先聊天 / 休息，5 分鐘後恢復。受影響的玩家數值會被回復。」

### 中止改紙本（D 級）
> 「系統遇到較大問題暫停。從現在起改用紙本記錄，請大家到關主處用紙筆記分。活動結束後我們會把分數補回系統。」

---

## 活動結束後

1. SQL editor 跑 `SELECT * FROM "Transaction" WHERE tx_type = 'manual_fix'` → 看活動中手動修了哪些（檢討用）
2. 跑 admin 「遊戲結束(計分)」→ 觸發 final scoring → 玩家看揭曉
3. 排行榜結算後：admin 拍照存證 / 截圖排行榜
4. 隔天：admin → restartGameCycle 重置場次（保留帳號）
5. 一週內 Vercel / Supabase 都不要動（保留 log 給回顧）

祝活動順利 🎉
