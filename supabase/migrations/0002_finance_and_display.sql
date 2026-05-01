-- 財務方案、玩家借貸、display token
-- 對應 BOARD_GAME_V2.md §「換匯所」「銀行借貸」與架構文件 §5.3 issueDisplayToken / revokeDisplayToken

-- ─────────────────────────────────────────────────────────────
-- 換匯所方案
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ExchangeOption" (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label                    TEXT NOT NULL,
  blessing_cost_per_unit   INTEGER NOT NULL CHECK (blessing_cost_per_unit > 0),
  money_gain_per_unit      INTEGER NOT NULL CHECK (money_gain_per_unit > 0),
  display_order            INTEGER NOT NULL DEFAULT 0,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exchangeoption_active_order
  ON "ExchangeOption"(is_active, display_order);

-- ─────────────────────────────────────────────────────────────
-- 銀行借貸方案
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BankLoanOption" (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label                         TEXT NOT NULL,
  blessing_collateral_per_unit  INTEGER NOT NULL CHECK (blessing_collateral_per_unit > 0),
  money_per_unit                INTEGER NOT NULL CHECK (money_per_unit > 0),
  -- 每回合扣的「金錢利息」與「福分扣除」（後台靜默扣除，前台不顯示福分扣除）
  interest_money_per_round      INTEGER NOT NULL DEFAULT 0 CHECK (interest_money_per_round >= 0),
  interest_blessing_per_round   INTEGER NOT NULL DEFAULT 0 CHECK (interest_blessing_per_round >= 0),
  display_order                 INTEGER NOT NULL DEFAULT 0,
  is_active                     BOOLEAN NOT NULL DEFAULT true,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bankloanoption_active_order
  ON "BankLoanOption"(is_active, display_order);

-- ─────────────────────────────────────────────────────────────
-- 玩家當前借貸（多方案）
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PlayerLoan" (
  user_id         TEXT NOT NULL REFERENCES "Account"(user_id) ON DELETE CASCADE,
  loan_option_id  UUID NOT NULL REFERENCES "BankLoanOption"(id) ON DELETE CASCADE,
  units           INTEGER NOT NULL DEFAULT 0 CHECK (units >= 0),
  borrowed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, loan_option_id)
);
CREATE INDEX IF NOT EXISTS idx_playerloan_user ON "PlayerLoan"(user_id);

-- ─────────────────────────────────────────────────────────────
-- Display token（活動看板用，可撤銷）
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DisplayToken" (
  jti          TEXT PRIMARY KEY,
  label        TEXT NOT NULL DEFAULT '',
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_by   TEXT REFERENCES "Account"(user_id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_displaytoken_active
  ON "DisplayToken"(revoked_at, expires_at);
