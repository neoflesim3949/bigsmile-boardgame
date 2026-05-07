-- 股市回合腳本：管理員可預設每回合各檔股票的漲跌規則 + 事件跑馬燈
-- 對應 /admin/stocks 的「股市大盤回合腳本總表」UI
-- tickRound 推進時若該回合有腳本，依腳本套用；否則 fallback 為隨機波動

CREATE TABLE IF NOT EXISTS "StockRoundScript" (
  round         INTEGER NOT NULL,
  stock_id      UUID NOT NULL REFERENCES "Stock"(id) ON DELETE CASCADE,
  -- 'percent' = 百分比漲跌（change_value 為 ±N，代表 ±N%）
  -- 'fixed'   = 直接設定價格（change_value 為新價格絕對值）
  change_type   TEXT NOT NULL CHECK (change_type IN ('percent', 'fixed')),
  change_value  INTEGER NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (round, stock_id)
);
CREATE INDEX IF NOT EXISTS idx_stockroundscript_round ON "StockRoundScript"(round);

CREATE TABLE IF NOT EXISTS "StockRoundEvent" (
  round       INTEGER PRIMARY KEY,
  event_text  TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
