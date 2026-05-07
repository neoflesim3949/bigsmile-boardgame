import type { PoolClient } from 'pg';
import { query } from './db';

/**
 * 重算所有玩家的 PlayerStats.final_score（依當前 ScoreWeight* 設定）
 *
 * 觸發時機：
 * - tickRound（Tx2 結尾，反映本回合所有變動）
 * - updateAppSettings 改 ScoreWeight*（admin 調整權重立即生效）
 * - triggerFinalScoring（鎖定終局快照）
 * - rebirthPlayer（單玩家可用 recomputePlayerScore 較省）
 *
 * SQL 全在 PG 端做 cast（避免 CLAUDE.md §11 提到的 int * float-text-param 推導失敗）。
 * 500 人單 SQL ~50ms 級。
 */
export async function recomputeAllPlayerScores(client?: PoolClient): Promise<void> {
  const sql = `
    WITH w AS (
      SELECT
        COALESCE((SELECT value FROM "AppSettings" WHERE key = 'ScoreWeightMoney'), '0.05')::float AS wm,
        COALESCE((SELECT value FROM "AppSettings" WHERE key = 'ScoreWeightBlessing'), '200')::float AS wb,
        COALESCE((SELECT value FROM "AppSettings" WHERE key = 'ScoreWeightKarma'), '150')::float AS wk
    )
    UPDATE "PlayerStats" ps
    SET final_score = ROUND(
          ps.money::float * w.wm
          + ps.blessing::float * w.wb
          - ps.karma::float * w.wk
        )::int,
        updated_at = now()
    FROM w
  `;
  if (client) {
    await client.query(sql);
  } else {
    await query(sql);
  }
}

/**
 * 重算單一玩家的 final_score（rebirthPlayer 等單筆變動用）
 */
export async function recomputePlayerScore(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `WITH w AS (
       SELECT
         COALESCE((SELECT value FROM "AppSettings" WHERE key = 'ScoreWeightMoney'), '0.05')::float AS wm,
         COALESCE((SELECT value FROM "AppSettings" WHERE key = 'ScoreWeightBlessing'), '200')::float AS wb,
         COALESCE((SELECT value FROM "AppSettings" WHERE key = 'ScoreWeightKarma'), '150')::float AS wk
     )
     UPDATE "PlayerStats" ps
     SET final_score = ROUND(
           ps.money::float * w.wm
           + ps.blessing::float * w.wb
           - ps.karma::float * w.wk
         )::int,
         updated_at = now()
     FROM w
     WHERE ps.user_id = $1`,
    [userId],
  );
}
