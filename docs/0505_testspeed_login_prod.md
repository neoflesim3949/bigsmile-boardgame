# Production Login 壓測報告

> 由 `scripts/load-test-login-prod.ts` 對 deployed Vercel URL 直測
> 執行時間：2026-05-05（UTC）
> 環境：Vercel hnd1（Hobby）+ Supabase Tokyo NANO（Free tier）

## 共同設定

| 項目 | 值 |
|------|----|
| 目標 URL | `https://bigsmile-boardgame.vercel.app` |
| 並發 | 500 |
| 帳號 | `loadtest_1..500`（共用 bcrypt cost=12 hash）|
| 路徑 | POST `/api/loadtest-login`（不 set cookies、純測 latency）|
| Vercel | hnd1（Tokyo Hobby plan）|
| Supabase | ap-northeast-1 / NANO / Pooler max 200 |

---

## 六個情境完整對照

### A1. 同步 500 並發（無 retry）— baseline

| 指標 | 值 |
|------|----|
| 對應現實 | 不可能（同毫秒）|
| arrival 速率 | 瞬間爆發 |
| wallclock | 2703ms |
| **成功 / 失敗** | **211 / 289（42.2%）** ❌ |
| client p95 | 2567ms |
| server p95 | 532ms |
| bcrypt p95 | 422ms |
| 失敗原因 | EMAXCONN × 289 |

### A2. 同步 500 + 1s flat retry

| 指標 | 值 |
|------|----|
| arrival 速率 | 瞬間爆發 + 1 秒後 retry |
| wallclock | 4395ms |
| **成功 / 失敗** | **305 / 195（61.0%）** |
| 改善 vs A1 | +94 救回 |
| client p95 | 3846ms |
| 失敗原因 | EMAXCONN × 195（同步 retry 又撞牆）|

### A3. 同步 500 + 3s flat retry

| 指標 | 值 |
|------|----|
| wallclock | 6963ms |
| **成功 / 失敗** | **328 / 172（65.6%）** |
| 改善 vs A2 | +23 救回（多救 4.6%）|
| client p95 | 5619ms |
| 觀察 | 拉長等待只延緩、不解決同步問題 — flat retry 上限 ~65% |

### A4. 同步 500 + exp backoff + full jitter（最多 3 次 retry）🎯

| 指標 | 值 |
|------|----|
| arrival 速率 | 瞬間爆發 + 隨機 jitter retry |
| retry 策略 | base 500 × 2^(n-1)、full jitter [0, 2×base]：第 1 次 0-1s / 第 2 次 0-2s / 第 3 次 0-4s |
| wallclock | 9569ms |
| **成功 / 失敗** | **477 / 23（95.4%）** 🎯 |
| 改善 vs A3 | +149 救回（**突破 65% 上限**）|
| client p95 | 6531ms（含 jitter 等待）|
| server p95 | 2682ms |
| bcrypt p95 | 1584ms |
| 失敗原因 | EMAXCONN × 23（極不幸 4 次都沒搶到的）|

### B. spaced 600ms 間隔（5 分鐘 500 人到場）— 最現實

| 指標 | 值 |
|------|----|
| 對應現實 | ✅ 開幕 5 分鐘陸續到場 |
| arrival 速率 | 1.67 logins/s |
| wallclock | 301s（5 分鐘）|
| **成功 / 失敗** | **498 / 2（99.6%）** ✅ |
| client p95 | 689ms |
| server p95 | 485ms |
| bcrypt p95 | 456ms |

### C. spaced 2ms 間隔（極限 500/s）

| 指標 | 值 |
|------|----|
| arrival 速率 | 500 logins/s |
| wallclock | 4115ms |
| **成功 / 失敗** | **204 / 296（40.8%）** ❌ |
| client p95 | 3327ms |
| bcrypt p95 | **2197ms** 🚨（CPU saturation）|

---

## 完整總結表

| 情境 | retry 策略 | 成功率 | client p95 | bcrypt p95 |
|------|----------|--------|-----------|-----------|
| **A1** sync | 無 | 42.2% ❌ | 2567ms | 422ms |
| **A2** sync | 1s flat | 61.0% | 3846ms | 1640ms |
| **A3** sync | 3s flat | 65.6% | 5619ms | 1779ms |
| **A4** sync | **exp backoff + jitter** | **95.4%** 🎯 | 6531ms | 1584ms |
| **B** spaced 600ms | 無（不需要）| **99.6%** ✅ | **689ms** | 456ms |
| **C** spaced 2ms | 無 | 40.8% ❌ | 3327ms | 2197ms |

---

## 結論

### 1. Pool 200 是硬牆（A1/C 印證）

每個 login 占連線 ~400ms（bcrypt hold 期間），500 並發 × 0.4s ≈ 200 條同時 → 撞滿 NANO Pooler 上限。

### 2. CPU 是隱藏瓶頸（C 才看到）

C 持續壓 500 logins/s 時 Vercel function CPU contention，bcrypt 從 ~410ms 拖到 859ms / 2197ms p95（2-5× 慢）。

### 3. Flat retry 上限 ~65%（A2/A3 印證）

第一輪 fail 的 ~300 個同時 retry → 又一起撞同一 pool ceiling。**等待時間長短只是延緩、無法突破**：
- 1s retry → 61%
- 3s retry → 66%（差 4.6%）

### 4. **Exp backoff + full jitter 突破到 95%**（A4 印證）🎯

關鍵不是「等多久」是「**讓 retry 不要同步**」：
- 第 1 次 retry 隨機等 0-1s
- 第 2 次 retry 隨機等 0-2s  
- 第 3 次 retry 隨機等 0-4s

每個失敗的 op 在隨機時間點 retry → 第二輪不再同時撞牆 → pool 有空隙服務 → 連續 3 輪 retry 救回 ~95%。

### 5. 對真實活動的意義

| 真實情境 | logins/s | 預期成功率 | 撐得住？ |
|---------|----------|-----------|--------|
| 開幕 10 分鐘到場 500 人 | 0.83 | ~100% | ✅ |
| 開幕 5 分鐘到場 500 人 | 1.67 | **99.6%（實測）** | ✅ |
| 開幕 1 分鐘到場 500 人 | 8.3 | ~99% 估 | ✅ |
| 主持人喊「現在登入」5 秒擠 100 人 | 20 | ~99% 估 | ✅ |
| 主持人喊「現在登入」1 秒擠 100 人 | 100 | ~95-99% 估 | 🟡 接近 CPU 上限 |
| 同毫秒 500 人 + 無 retry | ∞ | 42% | ❌（不可能發生）|
| 同毫秒 500 人 + **exp backoff retry** | ∞ | **95%** 🎯 | ✅（極端 burst 保險）|

**真實到場速率 1.67-20 logins/s** → 不需要 retry 也 ✅。**極端尖峰時 retry 是保險**。

### 6. 玩家體感

**正常情境**（B 600ms spaced）：p95 689ms — 沒人等超過 1 秒，體感「即時」 ✅

**極端尖峰**（A4 sync 500 + exp backoff）：
- p50 2947ms：一半玩家 ~3 秒
- p95 6531ms：5% 玩家最久 ~7 秒
- 體感：「轉圈一下、登入成功」可接受
- 95% 玩家會進、5% 看到「請稍後再試」

---

## 已落地的修補

### 自動 retry — exp backoff + full jitter

[LoginForm.tsx](../src/app/login/LoginForm.tsx) 的 `loginAction`：

```tsx
const MAX_RETRIES = 3;
let last = await login(_prev, formData);
if (last.ok) return last;
if (last.error?.code !== 'INTERNAL_ERROR') return last;

for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  const baseMs = 500 * Math.pow(2, attempt - 1);
  const waitMs = Math.random() * baseMs * 2;  // full jitter
  await new Promise((r) => setTimeout(r, waitMs));
  last = await login(_prev, formData);
  if (last.ok) return last;
  if (last.error?.code !== 'INTERNAL_ERROR') return last;
}
return last;
```

**只重試** `INTERNAL_ERROR`（包含 EMAXCONN / pg pool / 連線層問題）。
**不重試** `LOGIN_FAILED`（密碼錯）/ `LOGIN_LOCKED`（鎖帳）/ `INVALID_INPUT`（form 錯）。

實證效益：sync 500 burst 從 42% 救成 **95%**。

---

## 不必做（CP 值低）

- 升 Pro plan：對 login 沒幫助（Pool 200 → 200，沒升）
- 升 Compute SMALL：Pool 200 → 400（救 EMAXCONN）但對真實活動 1.67/s 沒實質差別
- 換 GCP/AWS：完全 overkill
- 4-5 次 retry：A4 95% 已夠，再加只是延長 client wait

## 引導入場（成本 0）

主持人開幕引導：「請在前 10 分鐘陸續登入、不要全部同一秒按」— 自然錯開即可。

---

## 安全注意

跑完壓測後**必須**移除 Vercel `LOAD_TEST_ENABLED` env var → redeploy。否則 `/api/loadtest-login` 永遠開放，攻擊者可暴力 brute force 任何 `loadtest_*` 帳號。
