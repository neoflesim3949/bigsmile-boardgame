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
    await requireRole('admin');

    // ─── Tx 1：股價 + 回合計數（含 30 秒節流，原子 SQL 防誤點）───
    const tx1 = await withTx(async (client) => {
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
            newPrice = Math.max(1, script.change_value);
          } else {
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
      return newRound;
    });

    // ─── Tx 2：借款利息結算（批次 SQL，不逐筆 loop）───
    const tx2 = await withTx(async (client) => {
      // 用單條 SQL：UPDATE PlayerStats 同時扣金錢與福分（依 PlayerLoan + BankLoanOption 聚合）
      // 並把結算量寫進 Transaction（INSERT...SELECT）
      const settled = await client.query<{ user_id: string }>(
        `WITH owed AS (
           SELECT pl.user_id,
                  SUM(pl.units * blo.interest_money_per_round) AS money_due,
                  SUM(pl.units * blo.interest_blessing_per_round) AS blessing_due
           FROM "PlayerLoan" pl
           JOIN "BankLoanOption" blo ON blo.id = pl.loan_option_id
           WHERE pl.units > 0
           GROUP BY pl.user_id
         ),
         updated AS (
           UPDATE "PlayerStats" ps
             SET money = ps.money - o.money_due,
                 blessing = GREATEST(0, ps.blessing - o.blessing_due),
                 loan_updated_at = now(),
                 updated_at = now()
           FROM owed o
           WHERE ps.user_id = o.user_id
           RETURNING ps.user_id, o.money_due, o.blessing_due
         )
         INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         SELECT user_id, NULL, 'bank_interest', jsonb_build_object('money_due', money_due, 'blessing_due', blessing_due)
         FROM updated
         RETURNING user_id`,
      );
      return settled.rowCount ?? 0;
    });

    revalidatePath('/admin');
    revalidatePath('/admin/board');
    revalidatePath('/display/board');
    return ok({ round: tx1, players_settled: tx2 });
  } catch (err) {
    return fail(err);
  }
}
