-- 命格抽卡：比例 + 滾動 cycle 配額
-- 規格詳見 CLAUDE.md「命格抽卡比例與配額」與 ARCH §3 InitialValueTemplate / §6 AppSettings

ALTER TABLE "InitialValueTemplate"
  ADD COLUMN IF NOT EXISTS draw_ratio INTEGER NOT NULL DEFAULT 0
    CHECK (draw_ratio BETWEEN 0 AND 100);

-- 預設值寫入 AppSettings（若不存在才插）
INSERT INTO "AppSettings" (key, value)
VALUES ('MaxDestinyDraws', '100')
ON CONFLICT (key) DO NOTHING;
