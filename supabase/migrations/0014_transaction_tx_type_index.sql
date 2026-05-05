-- code review #0504 #11：Transaction.tx_type 高頻 query（如 dashboard tickHistory `WHERE tx_type='round_tick'`）
-- 沒有索引時走 (user_id, created_at) 索引 + 二次 filter，500 人 × 12 round 一場 ~20-30k row 後變慢
-- 加複合索引 (tx_type, created_at DESC) — 對 admin dashboard / restartGameCycle 清理 SQL 都有幫助

CREATE INDEX IF NOT EXISTS "idx_Transaction_tx_type_created"
  ON "Transaction" (tx_type, created_at DESC);
