# 開運大富翁活動前 — 可能殘留 bug 評估

> 撰寫日期：2026-05-05
> 範圍：本次 session（perf 優化 + 4 輪 code review + 5 輪壓測 + UX 修補）後的整體狀態
> 目的：誠實列出**已驗證 vs 還沒測**的範圍 + 活動前最後一輪手動 smoke test checklist

---

## TL;DR 風險評估

| 風險類別 | 機率 | 影響 |
|---------|------|------|
| **崩潰級 bug**（系統當機 / 資料壞）| **< 5%** | 災難 |
| **資料一致性 bug**（金錢 / 持股錯亂）| **< 1%** | 災難 |
| **UI / UX 小毛病**（按鈕沒反應 / 訊息怪 / 跳錯頁）| **30-50%** | 玩家煩躁但能玩 |
| **體感卡頓**（latency 偏高）| 已知（free tier 規格內）| 可接受 |
| **看板 Realtime SLO 違反**（< 1s）| **未驗證** | 看板更新延遲到 60s |

→ **整體上線可行性：✅** 但建議活動前手動 smoke 30 分鐘抓 UI 細節。

---

## ✅ 已徹底驗證（不太會出包）

| 項目 | 驗證方式 | 信心 |
|------|---------|------|
| 玩家寫入 ACID（buy / sell / apply）| 4 輪 review + 6 情境壓測 + Poisson 真實 | ⭐⭐⭐⭐⭐ |
| Row lock 行為 | 跨多輪 testspeed 0 deadlock | ⭐⭐⭐⭐⭐ |
| Login + retry（exp backoff + jitter）| 4 retry 策略實測 production | ⭐⭐⭐⭐⭐ |
| 抽命格 + 配額算法 | hot-path A 純 apply 壓測 + review | ⭐⭐⭐⭐ |
| 終局結算 + 揭曉 modal | review + UI 4 次修補迭代 | ⭐⭐⭐⭐ |
| 強制平倉 / 業力 / 利息 CTE | P4/P5 + tickRound 真實流程 | ⭐⭐⭐⭐⭐ |
| Auth 規則（role / TourMode / final scoring）| 多輪 review + assertNotFrozen 重構 | ⭐⭐⭐⭐⭐ |
| Connection pool / round-trip 數字 | testspeed 多輪實測對齊 | ⭐⭐⭐⭐⭐ |

對應的證據：
- [testspeed_raw_0505.md](testspeed_raw_0505.md)：P1-P5 全 0 error
- [testspeed_0505.md](testspeed_0505.md)：6 情境 hot-path 0 deadlock
- [testspeed_0505_s.md](testspeed_0505_s.md)：18 組合 spaced 0 deadlock
- [testspeed_0505_realistic.md](testspeed_0505_realistic.md)：1898 ops Poisson 0 fail
- [testspeed_login_prod_0505.md](testspeed_login_prod_0505.md)：production login 6 情境
- [skill_code_review_0505_1.md](skill_code_review_0505_1.md)：第 4 輪 review 結案 0 條

---

## ⚠️ 可能有邊角 bug（建議手動測）

### 1. 玩家動線完整 smoke test 從沒走過

每個 server action 單測過、UI 元件單獨修過，但**完整流程串起來沒手動跑過**。可能潛在 bug：
- 跳轉時機（buy 完該 revalidate 哪些頁面）
- 連續操作的 spinner / disabled 狀態
- 錯誤 toast 顯示時機 / 內容
- 各按鈕在地獄 / TourMode / 結算狀態下的 disabled 是否一致

### 2. 不同裝置 / 瀏覽器

| 環境 | 已測？ | 風險 |
|------|-------|------|
| 桌面 Chrome | 開發過程 ✅ | 低 |
| iPhone Safari | ❌ 沒測 | 中（揭曉 modal 截圖、QR scanner、`useTransition` spinner）|
| Android Chrome | ❌ 沒測 | 中（同上）|
| iOS 大字體（Accessibility）| ❌ | 低（已加 `text-[Nrem]` 規則）|
| 玩家 settings xl 字級 | ❌ | 低（同上）|
| Captain 直立 / 橫屏切換 | ❌ | 中（相機釋放）|

### 3. 慢網路情境

未實測：
- 4G 弱訊號 / 會場 Wi-Fi 擁擠
- 連線中斷瞬間 fetch 卡死（玩家點按鈕後背景切走 → iOS 可能殺 fetch）
- Wi-Fi 切到行動網路瞬間

可能的 bug：spinner 卡住不消失、錯誤 toast 跑出兩次、按鈕 disabled 沒解開

### 4. 邊緣計時

理論正確但沒實測：
- QR token 5 分鐘 TTL 邊界（4:59 vs 5:00 vs 5:01）
- LoginThrottle 15 分鐘 lock 邊界
- Tick 30 秒節流邊界（admin 連按）

### 5. 多人並發 UI

- 兩個 captain 同時掃同一玩家 → 玩家 row lock 序列化保證一致性，但 UI 是否會顯示 stale 資料？
- 玩家自己在 admin 推進回合 1 秒前送 buy → 預期成功（30 秒節流是 admin → admin），但玩家會先看到舊股價？

---

## 🔴 還沒驗證的 SLO（**最高優先 5 分鐘可解**）

### 看板 Realtime < 1 秒

[CLAUDE.md §9 / §12](../CLAUDE.md) 規定：admin 推進回合 / 設跑馬燈 → 看板 < 1 秒看到。

**已部署的 code**：
- `migration 0015` 把 BoardConfig 加入 supabase_realtime publication
- `BoardClient.tsx` 訂閱 postgres_changes
- 60s `setInterval` fallback

**沒實機驗**：可能 publication 沒生效（要看 Supabase Dashboard 的 Replication 設定），結果走 60s fallback → SLO 失敗但功能不爆。

**怎麼測（5 分鐘）**：
1. Vercel deployed 環境開兩個瀏覽器 tab：
   - Tab A：admin / 玩家中心 → admin dashboard
   - Tab B：display board（用 token 看板路徑）
2. Tab A 點「推進下一回合」
3. **碼錶**看 Tab B 多久後股價更新
4. 預期：< 1 秒
5. 若 > 5 秒 → publication 沒生效 → 去 Supabase Dashboard → Database → Replication → 確認 BoardConfig 在 supabase_realtime 內

---

## 📋 活動前 30 分鐘 smoke test checklist

### 階段 1：看板 SLO（5 min）

- [ ] 兩 tab：admin + display board
- [ ] admin 推進回合 → display 多久收到（碼錶）
- [ ] admin 設跑馬燈 → display 顯示時間
- [ ] 預期都 < 1 秒；> 5 秒 = publication 問題

### 階段 2：玩家動線（10 min）

- [ ] 全新帳號登入
- [ ] 抽命格（CardDrawMode 開啟）
- [ ] home 看四項數值
- [ ] 進股市買 1 股
- [ ] 賣回該股
- [ ] 進銀行借錢
- [ ] 還款（部分還、全還）
- [ ] 換匯（exchange）
- [ ] 轉帳給另一玩家（transfer）
- [ ] 關主端配發 quick action（含道具發放）
- [ ] 玩家進入地獄（health/blessing 歸零）
- [ ] 關主執行重生
- [ ] admin 觸發終局結算
- [ ] 玩家看到揭曉 modal + 排名 + 截圖下載
- [ ] history 各 tab（金錢 / 健康 / 福分 / 業力）顯示正確

### 階段 3：跨裝置（10 min）

- [ ] iPhone Safari：home + stock + scan
- [ ] Android Chrome：同上
- [ ] iOS 開大字體 → 看 layout 不破
- [ ] 玩家 settings 切 xl 字級 → 看 layout 不破

### 階段 4：慢網路（5 min）

- [ ] Chrome DevTools → Network → Slow 4G
- [ ] 重跑「進股市買 1 股」→ 看 spinner 表現
- [ ] 中途 reload → 確認沒留 zombie state
- [ ] Login 慢 4G → 看 retry 觸發 + 錯誤訊息友善

---

## 還沒做但 CP 值低（規模到位才考慮）

| 項目 | 為什麼不做 |
|------|----------|
| Final scoring trigger 壓測 | 單條 CTE 重算 500 玩家 final_score，預估 < 500ms |
| restartGameCycle 壓測 | 一次性 op，admin 願意等 1-3 秒 |
| Bank loan / repay 壓測 | 結構同 buy/sell，已類比可推 |
| Captain sell with multiplier 壓測 | 同 sellStock + 1 multiplier 查詢 |
| QR scan 壓測 | scan 端 5 read query 已測 spaced 25ms 過 |

---

## 結論

**Backend / 後端正確性**：✅ **生產級可上線**
- 4 輪 review、5 輪壓測、所有 Critical/High 全修
- ACID / row lock / connection pool 全驗證
- Login 含 retry + jitter，95% sync burst 救援

**前端 UI / UX**：🟡 **建議手動 smoke**
- 邊角 bug 機率 30-50%（spinner / disabled / 跳轉時機）
- 不影響核心遊戲性、但影響玩家體感

**規格 SLO**：⚠️ **看板 Realtime 未驗**
- 5 分鐘可驗、若失敗手動加 publication 即可

**最後一道工**：活動前 30 分鐘按本檔 [§ 階段 1-4 checklist](#-活動前-30-分鐘-smoke-test-checklist) 走一輪，找到的 UI bug 即時修。
