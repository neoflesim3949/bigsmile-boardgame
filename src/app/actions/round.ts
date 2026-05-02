'use server';

import { revalidatePath } from 'next/cache';
import { ActionError, fail, ok, type ActionResult } from '@/lib/error';
import { withTx } from '@/lib/db';
import { requireRole } from '@/lib/auth';

/**
 * tickRound：主持人按「下一回合」。
 * 拆兩個 pg tx（避免長 tx 阻塞玩家寫入）：
 *   Tx1：股價更新 + BoardConfig.current_round +=1 + last_tick_at = now()
 *   Tx2：批次結算所有 PlayerLoan 利息 + INSERT…SELECT 寫 Transaction
 * 30 秒節流：BoardConfig.last_tick_at 距今 < 30 秒則拒絕。
 */
export async function tickRound(): Promise<
  ActionResult<{ round: number; players_settled: number }>
> {
  try {
    const session = await requireRole('admin');

    // ─── Tx 1：股價 + 回合計數（含 30 秒節流，原子 SQL 防誤點）───
    const tx1 = await withTx(async (client) => {
      // 遊戲未開始 / 已結算 不允許推進回合
      const flagsR = await client.query<{ key: string; value: string }>(
        `SELECT key, value FROM "AppSettings" WHERE key = 'BoardGameEnabled'`,
      );
      if (flagsR.rows[0]?.value !== 'true') {
        throw new ActionError('FORBIDDEN', '遊戲尚未開始，請先按「遊戲開始」');
      }
      const finalR = await client.query<{ final_scoring_triggered_at: string | null }>(
        `SELECT final_scoring_triggered_at FROM "BoardConfig" WHERE id = 1`,
      );
      if (finalR.rows[0]?.final_scoring_triggered_at) {
        throw new ActionError('FORBIDDEN', '終局結算已觸發，無法再推進回合');
      }

      const upd = await client.query<{ current_round: number }>(
        `UPDATE "BoardConfig"
         SET current_round = current_round + 1,
             last_tick_at = now(),
             updated_at = now()
         WHERE id = 1
           AND (last_tick_at IS NULL OR now() - last_tick_at >= interval '30 seconds')
         RETURNING current_round`,
      );
      if (upd.rows.length === 0) {
        throw new ActionError('TICK_RATE_LIMITED', '距上次推進不足 30 秒，請稍後再試');
      }
      const newRound = upd.rows[0].current_round;

      // 取得本回合的腳本（若有）
      const scripts = await client.query<{
        stock_id: string; change_type: 'percent' | 'fixed'; change_value: number;
      }>(
        `SELECT stock_id, change_type, change_value
         FROM "StockRoundScript" WHERE round = $1`,
        [newRound],
      );
      const scriptMap = new Map(scripts.rows.map((s) => [s.stock_id, s] as const));

      // 預設規則 fallback：±5% 隨機波動
      const rule = await client.query<{ value: string }>(
        `SELECT value FROM "AppSettings" WHERE key = 'StockPriceRule'`,
      );
      let percentRange = 5;
      try {
        const parsed = JSON.parse(rule.rows[0]?.value ?? '{}');
        if (typeof parsed.percent_range === 'number') percentRange = parsed.percent_range;
      } catch { /* 用預設 */ }

      const stocks = await client.query<{ id: string; current_price: number }>(
        `SELECT id, current_price FROM "Stock"`,
      );
      for (const s of stocks.rows) {
        const script = scriptMap.get(s.id);
        let newPrice: number;
        if (script) {
          if (script.change_type === 'fixed') {
            // fixed 允許設 0（admin 故意安排的暴跌劇情）— 但 buyStock 端會擋玩家買 price=0 的股票
            newPrice = Math.max(0, script.change_value);
          } else {
            // percent 漲跌 floor=1 防止向下無限
            newPrice = Math.max(1, Math.round(s.current_price * (1 + script.change_value / 100)));
          }
        } else {
          // fallback 隨機
          const factor = 1 + (Math.random() * 2 - 1) * (percentRange / 100);
          newPrice = Math.max(1, Math.round(s.current_price * factor));
        }
        await client.query(`UPDATE "Stock" SET current_price = $1 WHERE id = $2`, [newPrice, s.id]);
        await client.query(
          `INSERT INTO "StockHistory" (stock_id, price) VALUES ($1, $2)`,
          [s.id, newPrice],
        );
      }

      // 推送本回合事件文字至看板（marquee_until = 5 分鐘）
      const ev = await client.query<{ event_text: string }>(
        `SELECT event_text FROM "StockRoundEvent" WHERE round = $1`,
        [newRound],
      );
      const evText = ev.rows[0]?.event_text?.trim();
      if (evText) {
        await client.query(
          `UPDATE "BoardConfig"
           SET marquee_text = $1,
               marquee_until = now() + interval '5 minutes',
               updated_at = now()
           WHERE id = 1`,
          [evText],
        );
      }

      // 推進歷史紀錄（讓 admin dashboard 撈最近 N 筆顯示「時間 | 遊戲時間」）
      // 用 BoardGameStartedAt 做 game_time 基準（admin.ts 旗標）
      const startR = await client.query<{ value: string }>(
        `SELECT value FROM "AppSettings" WHERE key = 'BoardGameStartedAt'`,
      );
      const startedAt = startR.rows[0]?.value || null;
      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $1, 'round_tick', $2)`,
        [session.userId, JSON.stringify({
          round: newRound,
          event_text: evText || null,
          game_started_at: startedAt,
        })],
      );

      return newRound;
    });

    // ─── Tx 2：借款利息結算（按合約 balance/principal 比例）───
    const tx2 = await withTx(async (client) => {
      // 算法：每張未還清合約 → ROUND(base_interest * balance / principal) 個別利息
      //      → SUM by user_id 一次扣 PlayerStats.money / blessing
      //      → 每張合約寫一筆 'bank_interest' Transaction（含 loan_id 方便歷史追蹤）
      const settled = await client.query<{ user_id: string }>(
        `WITH per_loan AS (
           SELECT pl.id AS loan_id,
                  pl.user_id,
                  pl.loan_label,
                  pl.balance,
                  pl.principal,
                  ROUND(pl.base_interest_money_per_round * pl.balance::numeric / pl.principal)::int AS money_due,
                  ROUND(pl.base_interest_blessing_per_round * pl.balance::numeric / pl.principal)::int AS blessing_due
           FROM "PlayerLoan" pl
           WHERE pl.balance > 0
         ),
         agg AS (
           SELECT user_id, SUM(money_due)::int AS money_due, SUM(blessing_due)::int AS blessing_due
           FROM per_loan
           GROUP BY user_id
         ),
         updated_ps AS (
           UPDATE "PlayerStats" ps
             SET money = ps.money - a.money_due,
                 blessing = GREATEST(0, ps.blessing - a.blessing_due),
                 loan_updated_at = now(),
                 updated_at = now()
             FROM agg a
             WHERE ps.user_id = a.user_id
             RETURNING ps.user_id
         ),
         logged AS (
           INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
           SELECT pl.user_id, NULL, 'bank_interest',
                  jsonb_build_object(
                    'loan_id', pl.loan_id,
                    'loan_label', pl.loan_label,
                    'balance', pl.balance,
                    'principal', pl.principal,
                    'money_due', pl.money_due,
                    'blessing_due', pl.blessing_due
                  )
           FROM per_loan pl
           JOIN updated_ps u ON u.user_id = pl.user_id
           RETURNING user_id
         )
         SELECT DISTINCT user_id FROM updated_ps`,
      );
      return settled.rowCount ?? 0;
    });

    revalidatePath('/admin');
    revalidatePath('/admin/events');
    revalidatePath('/display/board');
    return ok({ round: tx1, players_settled: tx2 });
  } catch (err) {
    return fail(err);
  }
}
