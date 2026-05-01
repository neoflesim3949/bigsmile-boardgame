-- 開運大富翁 V2 — 初始 schema
-- 對齊 docs/BOARD_GAME_V2_ARCHITECTURE.md §3 資料模型 + §14.3 必建索引

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- 帳號
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Account" (
  user_id        TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  login_id       TEXT,
  password_hash  TEXT,
  role           TEXT NOT NULL CHECK (role IN ('admin', 'player', 'captain')),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_account_login
  ON "Account"(login_id) WHERE login_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 玩家四項參數
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PlayerStats" (
  user_id                 TEXT PRIMARY KEY REFERENCES "Account"(user_id) ON DELETE CASCADE,
  destiny_name            TEXT,
  money                   INTEGER NOT NULL DEFAULT 0,
  health                  INTEGER NOT NULL DEFAULT 0 CHECK (health BETWEEN 0 AND 100),
  blessing                INTEGER NOT NULL DEFAULT 0,
  karma                   INTEGER NOT NULL DEFAULT 0,
  rebirth_count           INTEGER NOT NULL DEFAULT 0,
  bank_loan               INTEGER NOT NULL DEFAULT 0,
  loan_updated_at         TIMESTAMPTZ,
  last_manual_refresh_at  TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 關卡
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Station" (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  captain_user_ids    TEXT[] NOT NULL DEFAULT '{}',
  allow_rebirth       BOOLEAN NOT NULL DEFAULT false,
  player_max_uses     INTEGER,
  global_max_uses     INTEGER,
  global_use_count    INTEGER NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 命格範本
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "InitialValueTemplate" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label        TEXT NOT NULL UNIQUE,
  emoji        TEXT NOT NULL DEFAULT '🀄',
  description  TEXT NOT NULL DEFAULT '',
  -- 色系（影響卡片邊框 / 文字漸層 / 發光）。由後台選擇，前端有對應的 Tailwind palette
  theme        TEXT NOT NULL DEFAULT 'zinc'
                 CHECK (theme IN ('amber', 'teal', 'purple', 'rose', 'sky', 'zinc')),
  rarity_label TEXT NOT NULL DEFAULT '普通',
  money        INTEGER NOT NULL DEFAULT 0,
  health       INTEGER NOT NULL DEFAULT 0 CHECK (health BETWEEN 0 AND 100),
  blessing     INTEGER NOT NULL DEFAULT 0,
  karma        INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 道具
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Item" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PlayerItem" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES "Account"(user_id) ON DELETE CASCADE,
  item_id     UUID NOT NULL REFERENCES "Item"(id) ON DELETE CASCADE,
  granted_by  TEXT REFERENCES "Account"(user_id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_playeritem_user ON "PlayerItem"(user_id);

-- ─────────────────────────────────────────────────────────────
-- 快捷模組
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "QuickAction" (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id        UUID NOT NULL REFERENCES "Station"(id) ON DELETE CASCADE,
  owner_user_id     TEXT NOT NULL REFERENCES "Account"(user_id) ON DELETE CASCADE,
  label             TEXT NOT NULL,
  delta_money       INTEGER NOT NULL DEFAULT 0,
  delta_health      INTEGER NOT NULL DEFAULT 0,
  delta_blessing    INTEGER NOT NULL DEFAULT 0,
  delta_karma       INTEGER NOT NULL DEFAULT 0,
  bound_item_id     UUID REFERENCES "Item"(id) ON DELETE SET NULL,
  req_money         INTEGER,
  req_health        INTEGER,
  req_blessing      INTEGER,
  req_karma         INTEGER,
  req_item_id       UUID REFERENCES "Item"(id) ON DELETE SET NULL,
  player_max_uses   INTEGER,
  global_max_uses   INTEGER,
  global_use_count  INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quickaction_station ON "QuickAction"(station_id);
CREATE INDEX IF NOT EXISTS idx_quickaction_owner   ON "QuickAction"(owner_user_id);

CREATE TABLE IF NOT EXISTS "StationUsage" (
  station_id  UUID NOT NULL REFERENCES "Station"(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES "Account"(user_id) ON DELETE CASCADE,
  count       INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (station_id, user_id)
);

CREATE TABLE IF NOT EXISTS "QuickActionUsage" (
  quickaction_id  UUID NOT NULL REFERENCES "QuickAction"(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES "Account"(user_id) ON DELETE CASCADE,
  count           INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (quickaction_id, user_id)
);

-- ─────────────────────────────────────────────────────────────
-- 股市
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Stock" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  current_price   INTEGER NOT NULL DEFAULT 0,
  is_visible      BOOLEAN NOT NULL DEFAULT true,
  is_sellable     BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "StockHistory" (
  id           BIGSERIAL PRIMARY KEY,
  stock_id     UUID NOT NULL REFERENCES "Stock"(id) ON DELETE CASCADE,
  price        INTEGER NOT NULL,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stockhistory_stock_recorded
  ON "StockHistory"(stock_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS "StockHolding" (
  user_id     TEXT NOT NULL REFERENCES "Account"(user_id) ON DELETE CASCADE,
  stock_id    UUID NOT NULL REFERENCES "Stock"(id) ON DELETE CASCADE,
  shares      INTEGER NOT NULL DEFAULT 0,
  avg_cost    INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, stock_id)
);

-- ─────────────────────────────────────────────────────────────
-- 看板
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Event" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  text        TEXT NOT NULL,
  start_at    TIMESTAMPTZ,
  end_at      TIMESTAMPTZ,
  priority    INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_active_window
  ON "Event"(is_active, start_at, end_at);

CREATE TABLE IF NOT EXISTS "BoardConfig" (
  id                          INTEGER PRIMARY KEY CHECK (id = 1),
  title                       TEXT NOT NULL DEFAULT '開運大富翁 ── 大廳',
  featured_stock_ids          UUID[] NOT NULL DEFAULT '{}',
  color_scheme                TEXT NOT NULL DEFAULT 'red_up' CHECK (color_scheme IN ('red_up', 'green_up')),
  event_rotate_seconds        INTEGER NOT NULL DEFAULT 8,
  marquee_text                TEXT NOT NULL DEFAULT '',
  marquee_until               TIMESTAMPTZ,
  final_scoring_triggered_at  TIMESTAMPTZ,
  current_round               INTEGER NOT NULL DEFAULT 0,
  last_tick_at                TIMESTAMPTZ,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 交易日誌
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Transaction" (
  id              BIGSERIAL PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES "Account"(user_id) ON DELETE CASCADE,
  actor_user_id   TEXT REFERENCES "Account"(user_id) ON DELETE SET NULL,
  tx_type         TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transaction_user_created
  ON "Transaction"(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transaction_actor_created
  ON "Transaction"(actor_user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 系統設定
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AppSettings" (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT REFERENCES "Account"(user_id) ON DELETE SET NULL
);

-- ─────────────────────────────────────────────────────────────
-- Refresh token（廢除 / 撤銷用）
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RefreshToken" (
  jti         TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES "Account"(user_id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refreshtoken_user ON "RefreshToken"(user_id);

-- ─────────────────────────────────────────────────────────────
-- 登入失敗節流（per-account 主防線）
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "LoginThrottle" (
  login_id        TEXT PRIMARY KEY,
  fail_count      INTEGER NOT NULL DEFAULT 0,
  first_fail_at   TIMESTAMPTZ,
  locked_until    TIMESTAMPTZ
);
