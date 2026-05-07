-- 業力影響：依玩家當下業力區間，每推進回合對四項值套一組 delta
-- 詳見 CLAUDE.md「業力影響」與 ARCH §5 tickRound

CREATE TABLE IF NOT EXISTS "KarmaBand" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  karma_min integer,                       -- NULL = 不設下限（≤ karma_max）
  karma_max integer,                       -- NULL = 不設上限（≥ karma_min）
  money_delta integer NOT NULL DEFAULT 0,
  health_delta integer NOT NULL DEFAULT 0,
  blessing_delta integer NOT NULL DEFAULT 0,
  karma_delta integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,   -- 重疊區間以小者優先
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_KarmaBand_active_sort"
  ON "KarmaBand" (is_active, sort_order);

-- 預設 6 個 band（對齊圖表，但 delta 一律保守，admin 自行調整）
-- 排序由「最光明」到「最墮落」
INSERT INTO "KarmaBand" (label, karma_min, karma_max, money_delta, health_delta, blessing_delta, karma_delta, sort_order)
VALUES
  ('光明', NULL,  -200,    0,  0,  10,  0,  0),  -- ≤ -200
  ('平凡',   -199,    0,    0,  0,   0,  0, 10),
  ('微濁',      1,   99,    0,  0,   0,  0, 20),
  ('渙散',    100,  199, -10000,  0, -3,  0, 30),
  ('迷失',    200,  299,  -2000,  0, -2,  0, 40),
  ('墮落',    300, NULL,    0, -2, -2,  0, 50)   -- ≥ 300
ON CONFLICT DO NOTHING;
