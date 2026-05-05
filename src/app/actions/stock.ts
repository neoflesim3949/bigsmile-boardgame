'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { ActionError, fail, ok, type ActionResult } from '@/lib/error';
import { query, withTx } from '@/lib/db';
import { assertNotFrozen, assertPlayerAlive, requireRole } from '@/lib/auth';
import { getSetting } from '@/lib/settings';

export interface StockMarketRow {
  id: string;
  code: string;
  name: string;
  current_price: number;
  is_visible: boolean;
  is_sellable: boolean;
  /** 玩家持有 — null 代表沒持股 */
  shares: number;
  avg_cost: number;
  /** 預期賣出利潤 = (current_price - avg_cost) * shares */
  expected_profit: number;
  /** 與 30 分鐘前比較的漲跌方向（提供箭頭用） */
  trend: 'up' | 'down' | 'flat';
}

/**
 * 取得股市總表（含玩家自己的持股）。
 * - is_visible=false 仍會回傳給該玩家若已持股；列表時前端依 is_visible 過濾，搜尋時可繞過
 * - 用單條 LEFT JOIN，避免 N+1
 */
export async function getStockMarket(manual = false): Promise<ActionResult<{
  stocks: StockMarketRow[];
  myMoney: number;
  totalHoldingValue: number;
  isDead: boolean;
  gameEnabled: boolean;
  finalScoringAt: string | null;
}>> {
  try {
    const session = await requireRole('player');

    // 與 getMyStats 共用 last_manual_refresh_at 節流（CLAUDE.md §11 紅旗）
    // 用 atomic UPDATE 防前端繞過：rowCount=0 = 冷卻中
    if (manual) {
      const cooldownStr = await getSetting('ManualRefreshCooldownSeconds');
      const cooldown = Math.max(1, Number(cooldownStr) || 60);
      const upd = await query(
        `UPDATE "PlayerStats"
         SET last_manual_refresh_at = now()
         WHERE user_id = $1
           AND (last_manual_refresh_at IS NULL OR now() - last_manual_refresh_at >= make_interval(secs => $2))
         RETURNING user_id`,
        [session.userId, cooldown],
      );
      if ((upd.rowCount ?? 0) === 0) {
        throw new ActionError('REFRESH_RATE_LIMITED', `刷新冷卻中（${cooldown} 秒一次）`);
      }
    }

    const stocks = await query<StockMarketRow & { trend_old: number | null }>(
      `WITH old_prices AS (
         SELECT DISTINCT ON (sh.stock_id) sh.stock_id, sh.price AS trend_old
         FROM "StockHistory" sh
         WHERE sh.recorded_at < now() - interval '30 minutes'
         ORDER BY sh.stock_id, sh.recorded_at DESC
       )
       SELECT s.id, s.code, s.name, s.current_price, s.is_visible, s.is_sellable,
              COALESCE(h.shares, 0) AS shares,
              COALESCE(h.avg_cost, 0) AS avg_cost,
              COALESCE((s.current_price - h.avg_cost) * h.shares, 0) AS expected_profit,
              o.trend_old,
              'flat'::text AS trend
       FROM "Stock" s
       LEFT JOIN "StockHolding" h ON h.stock_id = s.id AND h.user_id = $1
       LEFT JOIN old_prices o ON o.stock_id = s.id
       ORDER BY s.code ASC`,
      [session.userId],
    );

    const ps = await query<{ money: number; health: number; blessing: number }>(
      `SELECT money, health, blessing FROM "PlayerStats" WHERE user_id = $1`,
      [session.userId],
    );
    const me = ps.rows[0];
    const isDead = !me ? false : (me.health <= 0 || me.blessing <= 0);

    const settings = await query<{ key: string; value: string }>(
      `SELECT key, value FROM "AppSettings" WHERE key IN ('BoardGameEnabled')`,
    );
    const enabled = settings.rows.find((r) => r.key === 'BoardGameEnabled')?.value === 'true';

    const board = await query<{ final_scoring_triggered_at: string | null }>(
      `SELECT final_scoring_triggered_at FROM "BoardConfig" WHERE id = 1`,
    );

    const out = stocks.rows.map((s) => {
      let trend: 'up' | 'down' | 'flat' = 'flat';
      if (s.trend_old !== null && s.trend_old !== undefined) {
        if (s.current_price > s.trend_old) trend = 'up';
        else if (s.current_price < s.trend_old) trend = 'down';
      }
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        current_price: s.current_price,
        is_visible: s.is_visible,
        is_sellable: s.is_sellable,
        shares: s.shares,
        avg_cost: s.avg_cost,
        expected_profit: s.expected_profit,
        trend,
      };
    });

    const totalHoldingValue = out.reduce((sum, s) => sum + s.shares * s.current_price, 0);

    return ok({
      stocks: out,
      myMoney: me?.money ?? 0,
      totalHoldingValue,
      isDead,
      gameEnabled: enabled,
      finalScoringAt: board.rows[0]?.final_scoring_triggered_at ?? null,
    });
  } catch (err) {
    return fail(err);
  }
}

const buySchema = z.object({
  stockId: z.uuid(),
  shares: z.number().int().positive().max(1_000_000),
});

export async function buyStock(p: z.infer<typeof buySchema>): Promise<ActionResult<{ shares_bought: number; new_money: number; new_shares: number; avg_cost: number }>> {
  try {
    const session = await requireRole('player');
    const data = buySchema.parse(p);

    const result = await withTx(async (client) => {
      await assertNotFrozen(client);

      // 不鎖 Stock row（CLAUDE.md §3.2 / §11）— 股價以呼叫當下價成交
      const stock = await client.query<{ current_price: number; code: string; name: string }>(
        `SELECT current_price, code, name FROM "Stock" WHERE id = $1`,
        [data.stockId],
      );
      if (stock.rows.length === 0) throw new ActionError('NOT_FOUND', '股票不存在');

      const price = stock.rows[0].current_price;
      const stockCode = stock.rows[0].code;
      const stockName = stock.rows[0].name;
      // 防呆：fixed=0 劇情下不允許玩家 free 買進
      if (price <= 0) throw new ActionError('FORBIDDEN', '此商品目前停止交易（價格為 0）');
      const cost = price * data.shares;

      const ps = await client.query<{ money: number; health: number; blessing: number }>(
        `SELECT money, health, blessing FROM "PlayerStats" WHERE user_id = $1 FOR UPDATE`,
        [session.userId],
      );
      const me = ps.rows[0];
      if (!me) throw new ActionError('NOT_FOUND', '玩家資料不存在');
      assertPlayerAlive(me);
      if (me.money < cost) throw new ActionError('INSUFFICIENT_FUNDS', '金錢不足');

      // 末三段合併成單一 CTE：UPDATE PlayerStats + UPSERT StockHolding + INSERT Transaction
      // 從 3 個 round-trip 降到 1 個。前面 SELECT FOR UPDATE 已驗錢與生死，所以 paid 必然產生 1 row。
      //
      // **正確性 invariants（code review 0505_1 N1）**：
      // - `paid` 必為 1 row（前面 SELECT FOR UPDATE 過 + UPDATE 鎖住該玩家 row）
      // - `holding` 用 `VALUES` 不從 paid SELECT — 但若 paid 0-row（理論上不會），最後
      //   `SELECT FROM paid, holding` CROSS JOIN 會回 0 row → JS `r.rows[0]` undefined →
      //   throw → ROLLBACK 整 tx 含 holding 寫入 → 不留髒資料
      // - `tx` clause 顯式 `SELECT FROM paid` gate，paid 0-row 時不寫 Transaction
      // - 不貿然把 holding 改 `INSERT ... SELECT ... FROM paid` 因 ON CONFLICT 對 SELECT-source
      //   cardinality 處理較複雜（需 DO UPDATE SET 引用 EXCLUDED 而非 source row）
      const r = await client.query<{ new_money: number; shares: number; avg_cost: number }>(
        `WITH paid AS (
           UPDATE "PlayerStats" SET money = money - $2, updated_at = now()
           WHERE user_id = $1 RETURNING money
         ), holding AS (
           INSERT INTO "StockHolding" (user_id, stock_id, shares, avg_cost)
           VALUES ($1, $3, $4, $5)
           ON CONFLICT (user_id, stock_id) DO UPDATE SET
             shares = "StockHolding".shares + EXCLUDED.shares,
             avg_cost = ROUND(
               ("StockHolding".shares * "StockHolding".avg_cost + EXCLUDED.shares * $5)
               / NULLIF("StockHolding".shares + EXCLUDED.shares, 0)
             ),
             updated_at = now()
           RETURNING shares, avg_cost
         ), tx AS (
           -- 顯式 gate 在 paid 上：若 paid 0-row 則 Transaction 也不寫
           -- code review 0505 M1，與 simulator (load-test.ts) 寫法對齊
           INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
           SELECT $1, $1, 'stock_buy', $6::jsonb FROM paid
         )
         SELECT paid.money AS new_money, holding.shares, holding.avg_cost
         FROM paid, holding`,
        [
          session.userId, cost, data.stockId, data.shares, price,
          JSON.stringify({
            stock_id: data.stockId, stock_code: stockCode, stock_name: stockName,
            shares: data.shares, price, cost,
          }),
        ],
      );

      return {
        shares_bought: data.shares,
        new_money: r.rows[0].new_money,
        new_shares: r.rows[0].shares,
        avg_cost: r.rows[0].avg_cost,
      };
    });

    revalidatePath('/stock');
    revalidatePath('/');
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

const sellSchema = z.object({
  stockId: z.uuid(),
  shares: z.number().int().positive().max(1_000_000),
});

export async function sellStock(p: z.infer<typeof sellSchema>): Promise<ActionResult<{ shares_sold: number; new_money: number; remaining_shares: number; profit: number }>> {
  try {
    const session = await requireRole('player');
    const data = sellSchema.parse(p);

    const result = await withTx(async (client) => {
      await assertNotFrozen(client);

      const stock = await client.query<{ current_price: number; is_sellable: boolean; code: string; name: string }>(
        `SELECT current_price, is_sellable, code, name FROM "Stock" WHERE id = $1`,
        [data.stockId],
      );
      if (stock.rows.length === 0) throw new ActionError('NOT_FOUND', '股票不存在');
      if (!stock.rows[0].is_sellable) throw new ActionError('FORBIDDEN', '此商品不可賣回');

      const price = stock.rows[0].current_price;
      const stockCode = stock.rows[0].code;
      const stockName = stock.rows[0].name;

      const psHolding = await client.query<{ money: number; health: number; blessing: number; shares: number; avg_cost: number }>(
        `SELECT ps.money, ps.health, ps.blessing,
                COALESCE(sh.shares, 0) AS shares,
                COALESCE(sh.avg_cost, 0) AS avg_cost
         FROM "PlayerStats" ps
         LEFT JOIN "StockHolding" sh ON sh.user_id = ps.user_id AND sh.stock_id = $2
         WHERE ps.user_id = $1
         FOR UPDATE OF ps`,
        [session.userId, data.stockId],
      );
      const me = psHolding.rows[0];
      if (!me) throw new ActionError('NOT_FOUND', '玩家資料不存在');
      assertPlayerAlive(me);
      if (me.shares < data.shares) throw new ActionError('INVALID_INPUT', '持股不足');

      const proceeds = price * data.shares;
      const profit = (price - me.avg_cost) * data.shares;
      // 基礎福分扣分規則：blessing_penalty = round(profit / divisor)；賠錢不扣
      // divisor 由 AppSettings.StockSellBlessingPenaltyDivisor 控制（預設 10000 = 每 10K 獲利扣 1 福分）
      const divisorStr = await getSetting('StockSellBlessingPenaltyDivisor', client);
      const divisor = Math.max(1, Number(divisorStr) || 10000);
      const blessingPenalty = profit > 0 ? Math.round(profit / divisor) : 0;

      const newMoneyR = await client.query<{ money: number; blessing: number }>(
        `UPDATE "PlayerStats"
         SET money = money + $2,
             blessing = GREATEST(0, blessing - $3),
             updated_at = now()
         WHERE user_id = $1
         RETURNING money, blessing`,
        [session.userId, proceeds, blessingPenalty],
      );

      const remaining = me.shares - data.shares;
      if (remaining === 0) {
        await client.query(
          `DELETE FROM "StockHolding" WHERE user_id = $1 AND stock_id = $2`,
          [session.userId, data.stockId],
        );
      } else {
        // 賣出不改變 avg_cost（部分平倉，剩下的成本不變）
        await client.query(
          `UPDATE "StockHolding" SET shares = $3, updated_at = now() WHERE user_id = $1 AND stock_id = $2`,
          [session.userId, data.stockId, remaining],
        );
      }

      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $1, 'stock_sell', $2)`,
        [session.userId, JSON.stringify({
          stock_id: data.stockId, stock_code: stockCode, stock_name: stockName,
          shares: data.shares, price, proceeds, profit, blessing_penalty: blessingPenalty,
        })],
      );

      return {
        shares_sold: data.shares,
        new_money: newMoneyR.rows[0].money,
        remaining_shares: remaining,
        profit,
      };
    });

    revalidatePath('/stock');
    revalidatePath('/');
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

/** 用代碼搜尋（含未列出 / 不可見的商品） */
export async function lookupStockByCode(code: string): Promise<ActionResult<StockMarketRow>> {
  try {
    const session = await requireRole('player');
    if (!code || code.length < 1) throw new ActionError('INVALID_INPUT', '請輸入股票代碼');
    const r = await query<{
      id: string; code: string; name: string;
      current_price: number; is_visible: boolean; is_sellable: boolean;
      shares: number; avg_cost: number;
    }>(
      `SELECT s.id, s.code, s.name, s.current_price, s.is_visible, s.is_sellable,
              COALESCE(h.shares, 0) AS shares,
              COALESCE(h.avg_cost, 0) AS avg_cost
       FROM "Stock" s
       LEFT JOIN "StockHolding" h ON h.stock_id = s.id AND h.user_id = $2
       WHERE UPPER(s.code) = UPPER($1)`,
      [code, session.userId],
    );
    const row = r.rows[0];
    if (!row) throw new ActionError('NOT_FOUND', '查無此商品');
    return ok({
      ...row,
      expected_profit: (row.current_price - row.avg_cost) * row.shares,
      trend: 'flat',
    });
  } catch (err) {
    return fail(err);
  }
}
