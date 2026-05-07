# Supabase Error Log 分析

> 撰寫日期：2026-05-06
> 來源：Supabase Dashboard → Logs（資料庫錯誤）
> 結論：**兩個錯誤都不影響活動**，列出來避免日後誤判為新 bug

---

## Error 1: `relation "supabase_migrations.schema_migrations" does not exist`

### 出現時間
2026-05-05 07:39 UTC

### 完整訊息

```
SET statement_timeout='58s'; SET idle_session_timeout='58s';
    select *
    from supabase_migrations.schema_migrations sm
    order by sm.version desc

-- source: dashboard
-- user: session:f33de6c8-8bbc-4446-af98-5fb2053148fb
```

| 欄位 | 值 |
|------|----|
| `application_name` | supabase/dashboard |
| `error_severity` | ERROR |
| `sql_state_code` | `42P01`（undefined_table）|
| `command_tag` | SELECT |
| `database_name` | postgres |
| `user_name` | postgres |

### 來源與性質

**Supabase Dashboard 自己發出的查詢**，不是專案 code。Dashboard 嘗試讀取 migration history 顯示在 UI，但失敗。

### 為什麼會發生

本專案的 `supabase/migrations/*.sql` 是**手動管理**（直接 SQL apply），**沒用 Supabase CLI（`supabase db push`）接管**。所以 `supabase_migrations.schema_migrations` 這個 schema 表從未被建立。

Dashboard 抓不到表 → log 一個 ERROR → 它知道這是正常情境 → 繼續顯示「No migrations」介面 → 功能完全不受影響。

### 影響評估

- 對玩家：0 影響（dashboard 是 admin 自己用的）
- 對 admin：dashboard 顯示「No migrations」（純資訊缺失）
- 對 server：0 影響（不是 application code 觸發的）
- 對 log noise：每次 admin 開 dashboard 的 migrations 頁就一筆 ERROR

### 處置

**不必修**。如果希望消音：

```bash
# Option A: 用 Supabase CLI 接管 migration（會建立 schema 表）
supabase init
supabase db push

# Option B: 手動建立空表（純消音）
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version TEXT PRIMARY KEY
);
```

**Option B 不推薦**（變成「假裝有」反而誤導）。

---

## Error 2: Deadlock on `PlayerStats` (karma_band_effect CTE)

### 出現時間
2026-05-05 03:05 UTC

### 完整訊息（節錄）

```
ERROR:  deadlock detected
DETAIL:  Process 240753 waits for ShareLock on transaction 8488; blocked by process 240756.
         Process 240756 waits for ShareLock on transaction 8451; blocked by process 240753.
CONTEXT: while rechecking updated tuple (0,10) in relation "PlayerStats"

Process 240753 query:
  WITH affected AS (
    SELECT ps.user_id, kb.label AS band_label, ...
    FROM "PlayerStats" ps JOIN LATERAL (...) kb ON true
    WHERE ps.health > 0 AND ps.blessing > 0
      AND ps.user_id LIKE 'loadtest_%'   ← 重要識別碼
  ),
  upd AS (UPDATE "PlayerStats" ps SET ... ),
  INSERT INTO "Transaction" ... 'karma_band_effect',
    jsonb_build_object('round', 999, 'band_label', ...,
      'mixed_test', true)               ← 重要識別碼
```

| 欄位 | 值 |
|------|----|
| `application_name` | Supavisor（PgBouncer 6543）|
| `error_severity` | ERROR |
| `sql_state_code` | `40P01`（deadlock_detected）|
| `command_tag` | INSERT |

### 來源識別

兩個關鍵字確認來源：
- `WHERE ps.user_id LIKE 'loadtest_%'` → 只有 load test 才會這樣篩
- `'mixed_test', true` payload 標記 → 來自 [scripts/load-test-mixed.ts](../scripts/load-test-mixed.ts) 早期版本

→ **早期 mixed test 跑時觸發**，不是 production code、不是真實玩家活動。

### 為什麼會發生

`karma_band_effect` CTE 對 500 個 active player 一次 UPDATE。**兩個 process 並發跑同一 CTE** 時：

1. Process A：UPDATE 順序鎖 row 1 → 想鎖 row 3
2. Process B：UPDATE 順序鎖 row 3 → 想鎖 row 1
3. A 等 B 釋放 row 3、B 等 A 釋放 row 1 → 迴圈等待
4. PG 偵測到迴圈 → 主動 abort 一邊（這次是 240753 / transaction 8451）

PG 內建的 deadlock detection 自動回滾被 abort 的那筆，**資料不會壞**，只是該筆 query 失敗。

### 為什麼後來不再發生

| 場景 | 是否會 deadlock |
|------|----------------|
| **早期 mixed test**（Phase 4 強制平倉 + Phase 5 業力 同時並發）| ✅ **會**（測試人造極端）|
| **真實生產環境** | ❌ **不會**（tickRound 由 admin 序列觸發，30s 節流硬性序列化）|
| 後續 hot-path / spaced / realistic 測試 | ❌ **不會**（這些測試不模擬同 op 自己並發）|

### 對活動的影響

**0 影響**：
- tickRound 在生產上由 admin 手動觸發、有 30 秒節流（[round.ts:38-49](../src/app/actions/round.ts#L38-L49)）
- 一場活動只有 1 個 admin
- 即使 admin 連按，30s 節流會擋住 → karma_band CTE 永遠不會兩個並發
- 規格上「兩個 admin 同時按下一回合」是設計上不允許的情境

### 處置（已實作 2026-05-06）

✅ **`withTx` 已內建 deadlock auto-retry**（[src/lib/db.ts](../src/lib/db.ts)）：

- 偵測 PG SQLState `40P01` 或 message 含 `deadlock detected`
- 最多 retry 2 次（總共 3 次嘗試），每次間隔 50ms
- 換新 client + 新 BEGIN/COMMIT，避免重用 abort 過的連線狀態
- **不重試業務錯誤**（INSUFFICIENT_FUNDS / NOT_FOUND / 其他 ActionError 直接 throw）

CLAUDE.md §3.2 已加規則。

對抗：環境差異 / 並發抖動 / PG 版本邊角差。對你這場活動沒實質收益（生產上 tickRound 30s 節流序列化），但是廉價保險。

---

## 結論

| Error | 來源 | 影響活動？ | 處置 |
|-------|------|----------|------|
| schema_migrations 不存在 | Supabase Dashboard 內建查詢 | ❌ 無 | **不必修** |
| karma_band CTE deadlock | 早期 mixed test 人造並發 | ❌ 無（生產不會發生）| **不必修**，可選做 `withTx` retry 作環境抖動保險 |

兩者都是**已知 / 預期 / 無害**的 ERROR，列在 Supabase log 是正常現象。

### 識別 future 真實問題的判斷標準

未來若 Supabase log 出現 ERROR，請先檢查：

1. **`application_name` 是 `supabase/dashboard`？** → 多半是 Dashboard 內建查詢、無害
2. **query 含 `loadtest_%` / `mixed_test` / `hot_path_test`？** → 是壓測腳本觸發、跟生產無關
3. **錯誤 SQL state？**
   - `40P01` deadlock：偶發可接受、頻發要查
   - `42P01` undefined_table：通常 Dashboard / 工具導致、檢查 schema 名
   - `23505` unique_violation：可能是真實 bug
   - `42703` undefined_column：必修（schema 跟 code 對不上）
4. **頻率？** 一天幾次 vs 每分鐘 → 後者必查根因

如果上述都正常但 production 玩家回報問題 → 那才是真的 bug。
