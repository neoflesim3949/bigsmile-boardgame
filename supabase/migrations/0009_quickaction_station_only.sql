-- 快捷模組改為「只綁關卡」：移除 owner_user_id，同關卡多位關主共用同一份清單
-- 詳見 CLAUDE.md「快捷模組」與 ARCH §3.2

DROP INDEX IF EXISTS "idx_quickaction_owner";

ALTER TABLE "QuickAction"
  DROP COLUMN IF EXISTS owner_user_id;
