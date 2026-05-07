-- 股票加乘賣出 — 前置道具條件（AND 語意：玩家須持有全部 req_item_ids 才可使用）
-- 詳見 CLAUDE.md「股票加乘賣出」§前置條件 與 ARCH §3.2 StationSellMultiplier

ALTER TABLE "StationSellMultiplier"
  ADD COLUMN IF NOT EXISTS req_item_ids UUID[] NOT NULL DEFAULT '{}';
