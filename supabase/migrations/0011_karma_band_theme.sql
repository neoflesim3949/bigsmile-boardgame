-- KarmaBand 加 theme 色系（與 InitialValueTemplate.theme 共用 6 色 enum）
-- 玩家首頁狀態卡會依此 theme 套色，不再從 karma 值動態推算
-- 詳見 CLAUDE.md「業力影響」與 ARCH §3.2 KarmaBand

ALTER TABLE "KarmaBand"
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'zinc'
    CHECK (theme IN ('amber','teal','purple','rose','sky','zinc'));

-- backfill 預設 6 band 的 theme（admin 可自行調）
UPDATE "KarmaBand" SET theme = 'teal'   WHERE label = '光明' AND theme = 'zinc';
UPDATE "KarmaBand" SET theme = 'amber'  WHERE label = '渙散' AND theme = 'zinc';
UPDATE "KarmaBand" SET theme = 'purple' WHERE label = '迷失' AND theme = 'zinc';
UPDATE "KarmaBand" SET theme = 'rose'   WHERE label = '墮落' AND theme = 'zinc';
-- 平凡 / 微濁 維持 zinc（中性）
