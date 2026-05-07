'use server';

import { revalidatePath } from 'next/cache';
import { ActionError, fail, ok, type ActionResult } from '@/lib/error';
import { withTx } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { setSetting } from '@/lib/settings';
import { recomputeAllPlayerScores } from '@/lib/score';

/**
 * tickRound：主持人按「下一回合」。
 * **單一 pg tx**（problem_0507.md §6.2）：股價 + 回合 +1 + 強制平倉 + 業力影響 + 借款利息結算
 * + 重算 final_score。原本拆兩 tx 是想縮短 lock window，但會留半完成狀態（tx1 commit + tx2 fail
 * → 回合 +1 但利息沒扣、下次按又進下個回合）。改成單 tx 後一致性 100%，admin tick 鎖
 * PlayerStats 行多 ~100ms × 12 ticks = 整場 ~1.2 秒（可接受）。
 *
 * 30 秒節流：BoardConfig.last_tick_at 距今 < 30 秒則拒絕（atomic SQL 防主持人連按）。
 */
export async function tickRound(): Promise<
  ActionResult<{ round: number; players_settled: number }>
> {
  try {
    const session = await requireRole('admin');

    // ─── 單一 tx：股價 + 回合計數 + 強制平倉 + 業力 + 利息結算 + 重算分數 ───
    // 含 30 秒節流（原子 SQL 防主持人連按）
    const result = await withTx(async (client) => {
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

      // 第 1 回合推進後自動關閉導覽模式（admin 已從 demo 進入正式遊戲）
      // 走 setSetting helper（傳 client 跑同 tx）— 自動補 settings_update 稽核 row
      if (newRound === 1) {
        await setSetting('TourMode', 'false', session.userId, client);
      }

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

      // 推送本回合事件文字至看板（marquee_until = 5 分鐘）+ 拉強制平倉比例
      const ev = await client.query<{ event_text: string; force_liquidation_ratio: number }>(
        `SELECT event_text, force_liquidation_ratio FROM "StockRoundEvent" WHERE round = $1`,
        [newRound],
      );
      const evText = ev.rows[0]?.event_text?.trim();
      const forceLiqRatio = ev.rows[0]?.force_liquidation_ratio ?? 0;
      if (evText) {
        // 加 WHERE marquee_until <= now() 避免覆寫 admin 仍生效中的 publishMarquee 公告
        // （admin 重要訊息不該被 5 分鐘自動到期的事件秒殺）— code review #0504 #10
        await client.query(
          `UPDATE "BoardConfig"
           SET marquee_text = $1,
               marquee_until = now() + interval '5 minutes',
               updated_at = now()
           WHERE id = 1 AND (marquee_until IS NULL OR marquee_until <= now())`,
          [evText],
        );
      }

      // 強制平倉（事件性懲罰）：所有玩家持股按 ratio 強制以 $0 售出
      // 規格詳見 CLAUDE.md「強制平倉」/ ARCH §5 tickRound
      // 賣價 0、不發回金錢、只動 shares + 寫 Transaction
      if (forceLiqRatio > 0) {
        await client.query(
          `WITH liquidated AS (
             SELECT sh.user_id, sh.stock_id, s.code AS stock_code, s.name AS stock_name,
                    FLOOR(sh.shares * $1::int / 100)::int AS shares_sold,
                    sh.shares AS shares_before
             FROM "StockHolding" sh
             JOIN "Stock" s ON s.id = sh.stock_id
             WHERE FLOOR(sh.shares * $1::int / 100) > 0
           ),
           del AS (
             DELETE FROM "StockHolding" sh
             USING liquidated l
             WHERE sh.user_id = l.user_id AND sh.stock_id = l.stock_id
               AND l.shares_sold = l.shares_before
             RETURNING 1
           ),
           upd AS (
             UPDATE "StockHolding" sh
             SET shares = sh.shares - l.shares_sold,
                 updated_at = now()
             FROM liquidated l
             WHERE sh.user_id = l.user_id AND sh.stock_id = l.stock_id
               AND l.shares_sold < l.shares_before
             RETURNING 1
           )
           INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
           SELECT user_id, NULL, 'forced_liquidation',
                  jsonb_build_object(
                    'round', $2::int,
                    'ratio', $1::int,
                    'event_text', $3::text,
                    'stock_id', stock_id,
                    'stock_code', stock_code,
                    'stock_name', stock_name,
                    'shares_sold', shares_sold,
                    'money_gain', 0
                  )
           FROM liquidated`,
          // event_text 空時 fallback `回合事件`（不傳 null）— 玩家明細顯示「因『回合事件』股票...被售出」
          // code review 0505 L6
          [forceLiqRatio, newRound, evText || '回合事件'],
        );
      }

      // 業力影響：依當下 karma 對應到啟用的 KarmaBand，套用四項值 delta
      // 條件：health > 0 AND blessing > 0（地獄狀態玩家不影響）
      // 跳過全 0 delta 的 band（如「平凡」），避免污染 Transaction
      // health cap [0, 100]、money / blessing floor 0、karma 不限
      // 重疊區段以 sort_order 小者優先（LATERAL LIMIT 1）
      // 單條 CTE：affected → upd → INSERT，500 玩家也只一次 round-trip
      await client.query(
        `WITH affected AS (
           SELECT ps.user_id,
                  kb.label AS band_label,
                  kb.money_delta, kb.health_delta, kb.blessing_delta, kb.karma_delta
           FROM "PlayerStats" ps
           JOIN LATERAL (
             SELECT label, money_delta, health_delta, blessing_delta, karma_delta
             FROM "KarmaBand"
             WHERE is_active = true
               AND (karma_min IS NULL OR ps.karma >= karma_min)
               AND (karma_max IS NULL OR ps.karma <= karma_max)
             ORDER BY sort_order ASC
             LIMIT 1
           ) kb ON true
           WHERE ps.health > 0 AND ps.blessing > 0
             AND (kb.money_delta != 0 OR kb.health_delta != 0
                  OR kb.blessing_delta != 0 OR kb.karma_delta != 0)
         ),
         upd AS (
           UPDATE "PlayerStats" ps
           SET money    = GREATEST(0, ps.money    + a.money_delta),
               health   = LEAST(100, GREATEST(0, ps.health + a.health_delta)),
               blessing = GREATEST(0, ps.blessing + a.blessing_delta),
               karma    = ps.karma + a.karma_delta,
               updated_at = now()
           FROM affected a
           WHERE ps.user_id = a.user_id
           RETURNING ps.user_id
         )
         INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         SELECT a.user_id, NULL, 'karma_band_effect',
                jsonb_build_object(
                  'round', $1::int,
                  'band_label', a.band_label,
                  'money_delta', a.money_delta,
                  'health_delta', a.health_delta,
                  'blessing_delta', a.blessing_delta,
                  'karma_delta', a.karma_delta
                )
         FROM affected a
         JOIN upd u ON u.user_id = a.user_id`,
        [newRound],
      );

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

      // ─── 借款利息結算（同 tx 內、原本是獨立 tx2、合併避免半完成狀態）───
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

      // 重算所有玩家 final_score（同 tx：反映業力 / 強制平倉 + 利息結算後的最新狀態）
      await recomputeAllPlayerScores(client);

      return { round: newRound, players_settled: settled.rowCount ?? 0 };
    });

    revalidatePath('/admin');
    revalidatePath('/admin/events');
    revalidatePath('/display/board');
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}
