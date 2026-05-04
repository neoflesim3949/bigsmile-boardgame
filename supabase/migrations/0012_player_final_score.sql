-- 排行榜分數存 DB（方案 B）：每回合 tickRound 結束 + 改 ScoreWeight + 終局結算 各觸發一次重算
-- 詳見 CLAUDE.md「排行榜」與 ARCH §3.2 PlayerStats / §5.3 recomputeAllPlayerScores

ALTER TABLE "PlayerStats"
  ADD COLUMN IF NOT EXISTS final_score INTEGER NOT NULL DEFAULT 0;

-- 給 leaderboard ORDER BY DESC LIMIT 用的索引
CREATE INDEX IF NOT EXISTS "idx_PlayerStats_final_score_desc"
  ON "PlayerStats" (final_score DESC);

-- 一次性 backfill：用當前 ScoreWeight 設定算所有玩家分數
UPDATE "PlayerStats" ps
SET final_score = ROUND(
  ps.money::float * COALESCE((SELECT value FROM "AppSettings" WHERE key = 'ScoreWeightMoney'), '0.05')::float
  + ps.blessing::float * COALESCE((SELECT value FROM "AppSettings" WHERE key = 'ScoreWeightBlessing'), '200')::float
  - ps.karma::float * COALESCE((SELECT value FROM "AppSettings" WHERE key = 'ScoreWeightKarma'), '150')::float
)::int;
