# 寫實活動模擬報告（10 分鐘真實窗）

> 由 `scripts/load-test-realistic.ts` 產出
> 執行時間：2026-05-05 12:28:50（UTC）

## 模擬設定

| 項目 | 值 |
|------|----|
| 模擬情境 | 真實活動 10 分鐘窗 / 500 玩家 / 1 次 tickRound |
| 時間 | 不壓縮，真實窗 10 分鐘 |
| 玩家平均間隔 | exponential mean 180s（真實 3 min/op） |
| tickRound | 第 5 分鐘觸發 1 次（真實間隔 10 分鐘）|
| 平均到達率 | 2.78 ops/s |
| 預期 ops 量 | ≈ 1667 |
| Op 分佈 | apply 50% / buy 25% / sell 25% |
| pg pool size | 50 |
| PgBouncer 6543 | ✅ |
| sell 預先發股 | 100 股 / 玩家 |

## 為什麼這是「最接近真實」的測試

- **真實到達率 2.78 ops/s**（不壓縮、不放大）
- **服務速率 ~60 ops/s**（B/C 純 buy/sell 實測）→ 隊列基本是空的
- **Poisson 隨機**：玩家不是 deterministic 均勻分佈，是 exponential 抖動
- **mix op**：apply / buy / sell 三向同時跑，反映真實玩家在現場的多樣行為
- **tick 中段觸發**：模擬 admin 喊「下一回合」對玩家 op 的瞬間影響

## 整體結果

| 指標 | 值 |
|------|----|
| 總 ops | 1898 |
| 成功 / 失敗 | 1898 / 0 |
| 錯誤率 | 0.00% |
| Deadlock | 0 |
| wallclock | 601333ms = 10.02 min |
| 實際 throughput | 3.16 ops/s |

## 各 op latency

| op | total | ok | fail | avg | p50 | p95 | p99 | min | max |
|----|-------|----|----|-----|-----|-----|-----|-----|-----|
| apply | 922 | 922 | 0 | 943 | 780 | **1982** | 3334 | 412 | 5383 |
| buy | 501 | 501 | 0 | 580 | 519 | **1005** | 1630 | 287 | 2242 |
| sell | 475 | 475 | 0 | 633 | 526 | **1333** | 2822 | 284 | 3100 |

## tickRound 影響分析

| 指標 | 值 |
|------|----|
| tick 觸發次數 | 1 |
| tick 成功 / 失敗 | 1 / 0 |
| tick avg latency | 1573ms |
| apply **tick 期間**（前後 5s 窗）p95 | 1194ms（樣本 16）|
| apply **非 tick 期間** p95 | 1987ms（樣本 906）|
| tick 影響倍率 | 0.60× |

## 結論

✅ **零失敗 / 零 deadlock**，但部分 op p95 偏高。看是否 tick 期間影響。
真實活動可預期 p95 接近此測試水位。

對應 [testspeed_0505_s.md](testspeed_0505_s.md) 的 14400ms 間隔測試（每位玩家獨立、不混合）：
- 14400ms 是「平均到達率」最寬鬆的測試（0.07 ops/s 整場平均）
- 本檔加上「玩家不是 deterministic spread、是 Poisson 隨機」+「tick 干擾」+「mixed op」
- → 比 14400ms 嚴苛、比 25ms 寬鬆，最接近現實工作量

