-- 移除「預設新手初始值」設定 keys：規格改為「每位玩家都必須抽命格」，無 fallback 路徑
-- 詳見 CLAUDE.md §1 / V2 §3.2 命格抽卡 / ARCH §3.7 AppSettings

DELETE FROM "AppSettings"
WHERE key IN ('InitialMoney', 'InitialHealth', 'InitialBlessing', 'InitialKarma');
