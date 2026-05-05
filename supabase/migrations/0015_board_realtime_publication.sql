-- 看板靠 BoardConfig postgres_changes 推播（CLAUDE.md §9 / ARCH §14.7）
-- 必須加入 supabase_realtime publication 才會收到事件，否則 BoardClient 訂閱「成功」但永遠收不到推播
-- code review 0505 H1 修補
--
-- IF EXISTS 守衛：本地 Postgres（無 Supabase Realtime extension）跑此 migration 不會失敗
-- duplicate_object 容錯：重複執行（已加入過）也不報錯

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE "BoardConfig";
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
