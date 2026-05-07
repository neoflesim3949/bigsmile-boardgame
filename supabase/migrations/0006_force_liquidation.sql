-- 強制平倉事件：每回合可設定一個全域比例，推進時所有玩家持股按比例強制以 $0 售出
-- 詳見 CLAUDE.md「強制平倉」與 ARCH §3 StockRoundEvent / §5 tickRound

ALTER TABLE "StockRoundEvent"
  ADD COLUMN IF NOT EXISTS force_liquidation_ratio INTEGER NOT NULL DEFAULT 0
    CHECK (force_liquidation_ratio BETWEEN 0 AND 100);
