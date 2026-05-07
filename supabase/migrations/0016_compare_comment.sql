-- /compare 頁公開留言表（Neo V2 vs 體系版功能比對的條目逐項討論用）
-- 任何人可寫入，故用 CHECK 限制長度避免濫用
-- item_key 預期格式 "1.1" ~ "4.10"，但 schema 只擋過長字串、合法格式由 server action regex 驗證

CREATE TABLE IF NOT EXISTS "CompareComment" (
  id           BIGSERIAL PRIMARY KEY,
  item_key     TEXT NOT NULL CHECK (length(item_key) BETWEEN 1 AND 30),
  author_name  TEXT NOT NULL CHECK (length(trim(author_name)) BETWEEN 1 AND 30),
  content      TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 1000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compare_comment_item_time
  ON "CompareComment" (item_key, created_at);
