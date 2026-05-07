-- 股票加乘賣出（關主限定功能）：admin 在站開關旗標、captain 在自己站設倍率
-- 詳見 CLAUDE.md「股票加乘賣出」與 ARCH §3.2 / §5.2

ALTER TABLE "Station"
  ADD COLUMN IF NOT EXISTS allow_stock_sell_multiplier BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "StationSellMultiplier" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES "Station"(id) ON DELETE CASCADE,
  label text NOT NULL,
  money_multiplier numeric(5,2) NOT NULL CHECK (money_multiplier >= 0),
  blessing_penalty_multiplier numeric(5,2) NOT NULL CHECK (blessing_penalty_multiplier >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_StationSellMultiplier_station_active"
  ON "StationSellMultiplier" (station_id, is_active, sort_order);
