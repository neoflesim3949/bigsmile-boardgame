-- ─────────────────────────────────────────────────────────────
-- 借款合約化（每筆借款獨立 row、可指定還款 / 按比例算利息）
--
-- 舊設計問題：PlayerLoan PRIMARY KEY (user_id, loan_option_id)，
-- 同方案多次借款會累加 units；還款只動 PlayerStats.bank_loan
-- 沒有同步減 units → 還清後仍持續被結算利息
--
-- 新設計：每筆 borrow 都新建一張獨立合約 row，部分還款只減 balance；
-- 利息按 balance/principal 比例扣金錢與福分。
-- ─────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "PlayerLoan";

CREATE TABLE "PlayerLoan" (
  id                                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                           TEXT NOT NULL REFERENCES "Account"(user_id) ON DELETE CASCADE,
  -- option 可被刪除；保留歷史合約用 SET NULL
  loan_option_id                    UUID REFERENCES "BankLoanOption"(id) ON DELETE SET NULL,

  -- 凍結當下方案參數（即使方案被刪 / 改，合約仍按原始參數結算利息）
  loan_label                        TEXT NOT NULL,
  principal                         INTEGER NOT NULL CHECK (principal > 0),     -- 借款本金（金錢）
  balance                           INTEGER NOT NULL CHECK (balance >= 0),      -- 剩餘本金；balance=0 視為還清
  blessing_paid_at_borrow           INTEGER NOT NULL DEFAULT 0,                  -- 借款當下扣的福分（已扣，記錄用）
  base_interest_money_per_round     INTEGER NOT NULL DEFAULT 0,                  -- 完整本金時的金錢利息
  base_interest_blessing_per_round  INTEGER NOT NULL DEFAULT 0,                  -- 完整本金時的福分扣

  borrowed_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_off_at                       TIMESTAMPTZ,                                  -- balance 歸零的時間（NULL = 仍未還清）
  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 結算利息時用：只篩 balance > 0 的合約
CREATE INDEX idx_playerloan_user_active ON "PlayerLoan"(user_id) WHERE balance > 0;
-- 玩家查歷史合約用
CREATE INDEX idx_playerloan_user ON "PlayerLoan"(user_id);
