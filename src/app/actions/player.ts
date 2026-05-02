'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { ActionError, fail, ok, type ActionResult } from '@/lib/error';
import { query, withTx } from '@/lib/db';
import {
  assertNotDuringFinalScoring,
  assertNotTourMode,
  assertPlayerAlive,
  requireRole,
} from '@/lib/auth';
import { getSetting, getSettings } from '@/lib/settings';
import { signQrToken, verifyQrToken } from '@/lib/qr';

export type DestinyTheme = 'amber' | 'teal' | 'purple' | 'rose' | 'sky' | 'zinc';

export interface DestinyDrawResult {
  destiny_name: string;
  emoji: string;
  description: string;
  theme: DestinyTheme;
  rarity_label: string;
  money: number;
  health: number;
  blessing: number;
  karma: number;
}

/**
 * 命格抽卡。觸發條件由 page.tsx + middleware 守門：
 *   CardDrawMode === 'true' AND destiny_name IS NULL
 * 此 action 內部仍二次驗證，避免 client 繞過。
 */
export async function drawDestiny(): Promise<ActionResult<DestinyDrawResult>> {
  try {
    const session = await requireRole('player');

    const cardDrawMode = await getSetting('CardDrawMode');
    if (cardDrawMode !== 'true') {
      throw new ActionError('FORBIDDEN', '抽卡模式未啟用');
    }

    const result = await withTx(async (client) => {
      // 確保未抽過（idempotency）
      const existing = await client.query<{ destiny_name: string | null }>(
        `SELECT destiny_name FROM "PlayerStats" WHERE user_id = $1 FOR UPDATE`,
        [session.userId],
      );
      const row = existing.rows[0];
      if (row && row.destiny_name) {
        throw new ActionError('CONFLICT', '您已抽過命格，無需再抽');
      }

      // 抽範本（含視覺欄位 — emoji / theme / 描述都由後台 CRUD 設定）
      const templates = await client.query<{
        label: string;
        emoji: string;
        description: string;
        theme: DestinyTheme;
        rarity_label: string;
        money: number;
        health: number;
        blessing: number;
        karma: number;
      }>(
        `SELECT label, emoji, description, theme, rarity_label,
                money, health, blessing, karma
         FROM "InitialValueTemplate"
         WHERE is_active = true`,
      );

      let chosen: {
        label: string; emoji: string; description: string;
        theme: DestinyTheme; rarity_label: string;
        money: number; health: number; blessing: number; karma: number;
      };

      if (templates.rows.length > 0) {
        const idx = Math.floor(Math.random() * templates.rows.length);
        chosen = templates.rows[idx];
      } else {
        // 防呆：無範本時 fallback AppSettings + 預設視覺
        const fallback = await getSettings([
          'InitialMoney',
          'InitialHealth',
          'InitialBlessing',
          'InitialKarma',
        ]);
        chosen = {
          label: '預設命格',
          emoji: '🀄',
          description: '無命格範本，套用系統預設值。',
          theme: 'zinc',
          rarity_label: '普通',
          money: Number(fallback.InitialMoney) || 0,
          health: Number(fallback.InitialHealth) || 0,
          blessing: Number(fallback.InitialBlessing) || 0,
          karma: Number(fallback.InitialKarma) || 0,
        };
      }

      // upsert PlayerStats（idempotency：WHERE destiny_name IS NULL）
      const upd = await client.query<{
        destiny_name: string;
        money: number; health: number; blessing: number; karma: number;
      }>(
        `INSERT INTO "PlayerStats"
           (user_id, destiny_name, money, health, blessing, karma)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO UPDATE SET
           destiny_name = EXCLUDED.destiny_name,
           money        = EXCLUDED.money,
           health       = EXCLUDED.health,
           blessing     = EXCLUDED.blessing,
           karma        = EXCLUDED.karma,
           updated_at   = now()
         WHERE "PlayerStats".destiny_name IS NULL
         RETURNING destiny_name, money, health, blessing, karma`,
        [
          session.userId,
          chosen.label,
          chosen.money,
          Math.min(chosen.health, 100),
          chosen.blessing,
          chosen.karma,
        ],
      );

      if (upd.rows.length === 0) {
        throw new ActionError('CONFLICT', '命格抽取失敗，請重新整理');
      }

      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $1, 'destiny_draw', $2)`,
        [
          session.userId,
          JSON.stringify({
            destiny_name: chosen.label,
            money: chosen.money,
            health: chosen.health,
            blessing: chosen.blessing,
            karma: chosen.karma,
          }),
        ],
      );

      return {
        destiny_name: upd.rows[0].destiny_name,
        emoji: chosen.emoji,
        description: chosen.description,
        theme: chosen.theme,
        rarity_label: chosen.rarity_label,
        money: upd.rows[0].money,
        health: upd.rows[0].health,
        blessing: upd.rows[0].blessing,
        karma: upd.rows[0].karma,
      };
    });

    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

/**
 * 玩家進入頁面時呼叫，回傳是否需要被導向 onboarding。
 * 用於 page.tsx 開頭即時判斷（middleware 不打 DB，故由 server component 補檢查）。
 */
export interface OnboardingCheck {
  shouldOnboard: boolean;
  destiny_name: string | null;
}

export async function checkOnboardingStatus(): Promise<ActionResult<OnboardingCheck>> {
  try {
    const session = await requireRole('player');
    const cardDrawMode = await getSetting('CardDrawMode');
    const r = await query<{ destiny_name: string | null }>(
      `SELECT destiny_name FROM "PlayerStats" WHERE user_id = $1`,
      [session.userId],
    );
    const destiny = r.rows[0]?.destiny_name ?? null;
    const shouldOnboard = cardDrawMode === 'true' && destiny === null;
    return ok({ shouldOnboard, destiny_name: destiny });
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// 取得自己的 stats（含手動刷新節流）
// ─────────────────────────────────────────────────────────────
export interface PlayerStatsView {
  user_id: string;
  name: string;
  destiny_name: string | null;
  money: number;
  health: number;
  blessing: number;
  karma: number;
  rebirth_count: number;
  bank_loan: number;
  show_all_stats: boolean;
  is_dead: boolean;
  /** 導覽模式：true 時前端不顯示地獄畫面、不導 onboarding，所有寫入後端會擋 */
  tour_mode: boolean;
  game_enabled: boolean;
  final_scoring_at: string | null;
  refresh_cooldown_seconds: number;
  refresh_remaining_seconds: number;
}

export interface PlayerItemView {
  item_id: string;
  name: string;
  icon: string;
  description: string;
  granted_at: string;
}

/**
 * @param manual true = 走節流（atomic SQL），失敗回 REFRESH_RATE_LIMITED
 *               false = 一般讀取（自身 action response 帶回新值，不消耗 cooldown）
 */
export async function getMyStats(manual = false): Promise<ActionResult<{ stats: PlayerStatsView; items: PlayerItemView[] }>> {
  try {
    const session = await requireRole('player');

    const cooldownStr = await getSetting('ManualRefreshCooldownSeconds');
    const cooldown = Number(cooldownStr) || 60;

    if (manual) {
      // atomic SQL 節流
      const upd = await query(
        `UPDATE "PlayerStats"
         SET last_manual_refresh_at = now()
         WHERE user_id = $1
           AND (last_manual_refresh_at IS NULL OR now() - last_manual_refresh_at >= make_interval(secs => $2))
         RETURNING user_id`,
        [session.userId, cooldown],
      );
      if ((upd.rowCount ?? 0) === 0) {
        throw new ActionError('REFRESH_RATE_LIMITED', `刷新冷卻中，請稍後再試（${cooldown} 秒一次）`);
      }
    }

    const settings = await getSettings(['ShowAllStats', 'BoardGameEnabled', 'TourMode']);
    const board = await query<{ final_scoring_triggered_at: string | null }>(
      `SELECT final_scoring_triggered_at FROM "BoardConfig" WHERE id = 1`,
    );

    const r = await query<{
      money: number; health: number; blessing: number; karma: number;
      rebirth_count: number; bank_loan: number; destiny_name: string | null;
      last_manual_refresh_at: string | null;
    }>(
      `SELECT money, health, blessing, karma, rebirth_count, bank_loan,
              destiny_name, last_manual_refresh_at
       FROM "PlayerStats" WHERE user_id = $1`,
      [session.userId],
    );
    const stats = r.rows[0];
    if (!stats) throw new ActionError('NOT_FOUND', '尚未建立玩家資料');

    const lastRefresh = stats.last_manual_refresh_at
      ? new Date(stats.last_manual_refresh_at).getTime()
      : 0;
    const remaining = Math.max(0, cooldown - Math.floor((Date.now() - lastRefresh) / 1000));

    const items = await query<PlayerItemView>(
      `SELECT pi.item_id, i.name, i.icon, i.description, pi.granted_at
       FROM "PlayerItem" pi
       JOIN "Item" i ON i.id = pi.item_id
       WHERE pi.user_id = $1
       ORDER BY pi.granted_at DESC`,
      [session.userId],
    );

    return ok({
      stats: {
        user_id: session.userId,
        name: session.name,
        destiny_name: stats.destiny_name,
        money: stats.money,
        health: stats.health,
        blessing: stats.blessing,
        karma: stats.karma,
        rebirth_count: stats.rebirth_count,
        bank_loan: stats.bank_loan,
        show_all_stats: settings.ShowAllStats === 'true',
        is_dead: stats.health <= 0 || stats.blessing <= 0,
        tour_mode: settings.TourMode === 'true',
        game_enabled: settings.BoardGameEnabled === 'true',
        final_scoring_at: board.rows[0]?.final_scoring_triggered_at ?? null,
        refresh_cooldown_seconds: cooldown,
        refresh_remaining_seconds: remaining,
      },
      items: items.rows,
    });
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// 玩家轉帳（兩列鎖、固定 user_id 排序避免死鎖）
// ─────────────────────────────────────────────────────────────
const transferSchema = z.object({
  toUserId: z.string().min(1).max(64),
  amount: z.number().int().positive().max(1_000_000_000),
  note: z.string().max(120).optional(),
});

export async function transferMoney(payload: z.infer<typeof transferSchema>): Promise<ActionResult<{ new_balance: number }>> {
  try {
    const session = await requireRole('player');
    const data = transferSchema.parse(payload);
    if (data.toUserId === session.userId) throw new ActionError('INVALID_INPUT', '不能轉給自己');

    const result = await withTx(async (client) => {
      await assertNotDuringFinalScoring(client);
      await assertNotTourMode(client);

      // 對方必須是 active player
      const target = await client.query<{ name: string }>(
        `SELECT name FROM "Account" WHERE user_id = $1 AND role = 'player' AND is_active = true`,
        [data.toUserId],
      );
      if (target.rows.length === 0) throw new ActionError('NOT_FOUND', '收款玩家不存在或已停用');

      // 固定排序鎖兩列（避免死鎖）
      const ids = [session.userId, data.toUserId].sort();
      const stats = await client.query<{ user_id: string; money: number; health: number; blessing: number }>(
        `SELECT user_id, money, health, blessing
         FROM "PlayerStats"
         WHERE user_id = ANY($1::text[])
         ORDER BY user_id ASC
         FOR UPDATE`,
        [ids],
      );
      if (stats.rows.length !== 2) throw new ActionError('NOT_FOUND', '玩家資料不完整');

      const me = stats.rows.find((r) => r.user_id === session.userId)!;
      assertPlayerAlive(me);

      // 手續費（預設 0）
      const feeStr = await getSetting('TransferFeeRate');
      const feeRate = Number(feeStr) || 0;
      const fee = Math.floor(data.amount * feeRate);
      const totalDebit = data.amount + fee;
      if (me.money < totalDebit) {
        throw new ActionError('INSUFFICIENT_FUNDS', `金錢不足（需要 ${totalDebit}，目前 ${me.money}）`);
      }

      const updMe = await client.query<{ money: number }>(
        `UPDATE "PlayerStats" SET money = money - $2, updated_at = now()
         WHERE user_id = $1 RETURNING money`,
        [session.userId, totalDebit],
      );
      await client.query(
        `UPDATE "PlayerStats" SET money = money + $2, updated_at = now()
         WHERE user_id = $1`,
        [data.toUserId, data.amount],
      );

      const payload_json = JSON.stringify({
        from: session.userId,
        to: data.toUserId,
        amount: data.amount,
        fee,
        note: data.note ?? '',
      });
      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $1, 'transfer', $2),
                ($3, $1, 'transfer', $2)`,
        [session.userId, payload_json, data.toUserId],
      );
      return updMe.rows[0].money;
    });

    revalidatePath('/');
    return ok({ new_balance: result });
  } catch (err) {
    return fail(err);
  }
}

/** /transfer 用：依完整 user_id 查找對方（≥ 6 碼才查） */
export async function lookupPlayerById(targetIdRaw: string): Promise<ActionResult<{ user_id: string; name: string }>> {
  try {
    await requireRole('player');
    const targetId = targetIdRaw.trim();
    if (targetId.length < 6) throw new ActionError('INVALID_INPUT', '請輸入完整玩家 ID（≥ 6 碼）');
    const r = await query<{ user_id: string; name: string }>(
      `SELECT user_id, name FROM "Account"
       WHERE user_id = $1 AND role = 'player' AND is_active = true`,
      [targetId],
    );
    if (r.rows.length === 0) throw new ActionError('NOT_FOUND', '查無此玩家');
    return ok(r.rows[0]);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// 換匯所
// ─────────────────────────────────────────────────────────────
export interface ExchangeOptionViewPlayer {
  id: string;
  label: string;
  money_gain_per_unit: number;
  // 「最高可兌換金額」= floor(blessing / cost) * money_per_unit
  // 由後端算給玩家用，前台不透露 cost
  max_units: number;
  max_money: number;
}

export async function listExchangeOptionsForPlayer(): Promise<ActionResult<ExchangeOptionViewPlayer[]>> {
  try {
    const session = await requireRole('player');
    const r = await query<{
      id: string; label: string;
      blessing_cost_per_unit: number; money_gain_per_unit: number;
      blessing: number;
    }>(
      `SELECT eo.id, eo.label, eo.blessing_cost_per_unit, eo.money_gain_per_unit,
              ps.blessing
       FROM "ExchangeOption" eo
       CROSS JOIN "PlayerStats" ps
       WHERE eo.is_active = true AND ps.user_id = $1
       ORDER BY eo.display_order ASC, eo.label ASC`,
      [session.userId],
    );
    const out = r.rows.map((row) => {
      const max_units = Math.max(0, Math.floor(row.blessing / row.blessing_cost_per_unit));
      return {
        id: row.id,
        label: row.label,
        money_gain_per_unit: row.money_gain_per_unit,
        max_units,
        max_money: max_units * row.money_gain_per_unit,
      };
    });
    return ok(out);
  } catch (err) {
    return fail(err);
  }
}

const exchangeSchema = z.object({
  optionId: z.uuid(),
  units: z.number().int().positive(),
});

export async function exchangeBlessing(payload: z.infer<typeof exchangeSchema>): Promise<ActionResult<{ money_gained: number; new_balance: { money: number; blessing: number } }>> {
  try {
    const session = await requireRole('player');
    const data = exchangeSchema.parse(payload);

    const result = await withTx(async (client) => {
      await assertNotDuringFinalScoring(client);
      await assertNotTourMode(client);
      const opt = await client.query<{ blessing_cost_per_unit: number; money_gain_per_unit: number }>(
        `SELECT blessing_cost_per_unit, money_gain_per_unit
         FROM "ExchangeOption" WHERE id = $1 AND is_active = true`,
        [data.optionId],
      );
      if (opt.rows.length === 0) throw new ActionError('NOT_FOUND', '方案不存在或已停用');

      const stats = await client.query<{ money: number; health: number; blessing: number }>(
        `SELECT money, health, blessing FROM "PlayerStats" WHERE user_id = $1 FOR UPDATE`,
        [session.userId],
      );
      const me = stats.rows[0];
      if (!me) throw new ActionError('NOT_FOUND', '玩家資料不存在');
      assertPlayerAlive(me);

      // 套用 dashboard 即時權重倍率（admin 在 /admin 上調整 ExchangeRateMultiplier）
      const multStr = await getSetting('ExchangeRateMultiplier');
      const mult = Number(multStr) || 1.0;

      const totalCost = opt.rows[0].blessing_cost_per_unit * data.units;
      const totalGain = Math.round(opt.rows[0].money_gain_per_unit * data.units * mult);
      if (me.blessing < totalCost) throw new ActionError('INSUFFICIENT_FUNDS', '福報不足');

      const upd = await client.query<{ money: number; blessing: number }>(
        `UPDATE "PlayerStats"
         SET blessing = blessing - $2, money = money + $3, updated_at = now()
         WHERE user_id = $1
         RETURNING money, blessing`,
        [session.userId, totalCost, totalGain],
      );
      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $1, 'exchange', $2)`,
        [session.userId, JSON.stringify({ option_id: data.optionId, units: data.units, blessing_cost: totalCost, money_gain: totalGain })],
      );
      return { money_gained: totalGain, new_balance: upd.rows[0] };
    });

    revalidatePath('/');
    revalidatePath('/exchange');
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// 銀行借貸
// ─────────────────────────────────────────────────────────────
export interface BankLoanOptionViewPlayer {
  id: string;
  label: string;
  money_per_unit: number;
  interest_money_per_round: number;
  /** 此方案最高可借總單位（依目前福報計算） */
  max_total_units: number;
  /** 已持有單位 */
  current_units: number;
  /** 本次可新增單位（max - current，下限 0） */
  available_units: number;
}

export async function listBankLoanOptionsForPlayer(): Promise<ActionResult<BankLoanOptionViewPlayer[]>> {
  try {
    const session = await requireRole('player');
    const r = await query<{
      id: string; label: string;
      blessing_collateral_per_unit: number; money_per_unit: number;
      interest_money_per_round: number;
      blessing: number;
      current_units: number;
    }>(
      `SELECT blo.id, blo.label,
              blo.blessing_collateral_per_unit, blo.money_per_unit, blo.interest_money_per_round,
              ps.blessing,
              COALESCE(pl.units, 0) AS current_units
       FROM "BankLoanOption" blo
       CROSS JOIN "PlayerStats" ps
       LEFT JOIN "PlayerLoan" pl ON pl.loan_option_id = blo.id AND pl.user_id = ps.user_id
       WHERE blo.is_active = true AND ps.user_id = $1
       ORDER BY blo.display_order ASC, blo.label ASC`,
      [session.userId],
    );
    const out = r.rows.map((row) => {
      // spec：最高可借總單位 = floor(當前福報 / 每單位抵押福報)。
      // 福分若中途下跌可能讓 max < current（額度倒掛），current 不會被強制結清，但 available = 0
      const maxStrict = Math.floor(row.blessing / row.blessing_collateral_per_unit);
      const current = row.current_units;
      const available = Math.max(0, maxStrict - current);
      return {
        id: row.id,
        label: row.label,
        money_per_unit: row.money_per_unit,
        interest_money_per_round: row.interest_money_per_round,
        max_total_units: Math.max(maxStrict, current),
        current_units: current,
        available_units: available,
      };
    });
    return ok(out);
  } catch (err) {
    return fail(err);
  }
}

const borrowSchema = z.object({
  optionId: z.uuid(),
  units: z.number().int().positive(),
});

export async function borrowFromBank(payload: z.infer<typeof borrowSchema>): Promise<ActionResult<{ borrowed_money: number; new_balance: { money: number; bank_loan: number } }>> {
  try {
    const session = await requireRole('player');
    const data = borrowSchema.parse(payload);

    const result = await withTx(async (client) => {
      await assertNotDuringFinalScoring(client);
      await assertNotTourMode(client);
      const opt = await client.query<{
        blessing_collateral_per_unit: number;
        money_per_unit: number;
      }>(
        `SELECT blessing_collateral_per_unit, money_per_unit
         FROM "BankLoanOption" WHERE id = $1 AND is_active = true`,
        [data.optionId],
      );
      if (opt.rows.length === 0) throw new ActionError('NOT_FOUND', '借貸方案不存在或已停用');

      const stats = await client.query<{ money: number; health: number; blessing: number; bank_loan: number }>(
        `SELECT money, health, blessing, bank_loan FROM "PlayerStats" WHERE user_id = $1 FOR UPDATE`,
        [session.userId],
      );
      const me = stats.rows[0];
      if (!me) throw new ActionError('NOT_FOUND', '');
      assertPlayerAlive(me);

      const cur = await client.query<{ units: number }>(
        `SELECT COALESCE(units, 0) AS units FROM "PlayerLoan" WHERE user_id = $1 AND loan_option_id = $2`,
        [session.userId, data.optionId],
      );
      const currentUnits = cur.rows[0]?.units ?? 0;
      const maxTotal = Math.floor(me.blessing / opt.rows[0].blessing_collateral_per_unit);
      const available = Math.max(0, maxTotal - currentUnits);
      if (data.units > available) {
        throw new ActionError('INVALID_INPUT', `額度不足（可借 ${available} 單位）`);
      }

      const moneyDelta = data.units * opt.rows[0].money_per_unit;
      const updPS = await client.query<{ money: number; bank_loan: number }>(
        `UPDATE "PlayerStats"
         SET money = money + $2, bank_loan = bank_loan + $2,
             loan_updated_at = COALESCE(loan_updated_at, now()),
             updated_at = now()
         WHERE user_id = $1
         RETURNING money, bank_loan`,
        [session.userId, moneyDelta],
      );

      await client.query(
        `INSERT INTO "PlayerLoan" (user_id, loan_option_id, units)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, loan_option_id) DO UPDATE SET
           units = "PlayerLoan".units + EXCLUDED.units,
           updated_at = now()`,
        [session.userId, data.optionId, data.units],
      );

      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $1, 'bank_borrow', $2)`,
        [session.userId, JSON.stringify({ option_id: data.optionId, units: data.units, money_delta: moneyDelta })],
      );
      return { borrowed_money: moneyDelta, new_balance: updPS.rows[0] };
    });

    revalidatePath('/bank');
    revalidatePath('/');
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

const repaySchema = z.object({ amount: z.number().int().positive() });

export async function repayBank(payload: z.infer<typeof repaySchema>): Promise<ActionResult<{ new_balance: { money: number; bank_loan: number } }>> {
  try {
    const session = await requireRole('player');
    const data = repaySchema.parse(payload);

    const result = await withTx(async (client) => {
      await assertNotDuringFinalScoring(client);
      await assertNotTourMode(client);
      const stats = await client.query<{ money: number; health: number; blessing: number; bank_loan: number }>(
        `SELECT money, health, blessing, bank_loan FROM "PlayerStats" WHERE user_id = $1 FOR UPDATE`,
        [session.userId],
      );
      const me = stats.rows[0];
      if (!me) throw new ActionError('NOT_FOUND', '');
      assertPlayerAlive(me);

      const repay = Math.min(data.amount, me.bank_loan);
      if (repay <= 0) throw new ActionError('INVALID_INPUT', '無待還款項');
      if (me.money < repay) throw new ActionError('INSUFFICIENT_FUNDS', '金錢不足');

      const upd = await client.query<{ money: number; bank_loan: number }>(
        `UPDATE "PlayerStats"
         SET money = money - $2,
             bank_loan = bank_loan - $2,
             loan_updated_at = CASE WHEN bank_loan - $2 = 0 THEN NULL ELSE loan_updated_at END,
             updated_at = now()
         WHERE user_id = $1
         RETURNING money, bank_loan`,
        [session.userId, repay],
      );

      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $1, 'bank_repay', $2)`,
        [session.userId, JSON.stringify({ amount: repay })],
      );
      return { new_balance: upd.rows[0] };
    });

    revalidatePath('/bank');
    revalidatePath('/');
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// QR token（玩家自身的 QR）
// ─────────────────────────────────────────────────────────────
export async function issueMyQrToken(): Promise<ActionResult<{ token: string; ttl_seconds: number }>> {
  try {
    const session = await requireRole('player');
    const ttlStr = await getSetting('QRTokenTTL');
    const ttl = Number(ttlStr) || 300;
    const token = signQrToken(session.userId, 'player', ttl);
    return ok({ token, ttl_seconds: ttl });
  } catch (err) {
    return fail(err);
  }
}

/** 由 QR token 解碼出對方 user_id（用於 /transfer 掃碼填入） */
// ─────────────────────────────────────────────────────────────
// 個人歷史明細 /history/[type]
// ─────────────────────────────────────────────────────────────
export type HistoryType = 'money' | 'health' | 'blessing' | 'karma';

export interface HistoryEntry {
  id: number;
  tx_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  /** 此筆對該指標的變動（推算自 payload；無法判斷則為 null） */
  delta: number | null;
}

/**
 * 取得個人某指標的明細（活動結束後才會公開福分/業力歷史）。
 */
export async function getMyHistory(type: HistoryType): Promise<ActionResult<{
  entries: HistoryEntry[];
  current_value: number;
  show_all_stats: boolean;
  scoring_done: boolean;
}>> {
  try {
    const session = await requireRole('player');

    const settings = await getSettings(['ShowAllStats']);
    const board = await query<{ final_scoring_triggered_at: string | null }>(
      `SELECT final_scoring_triggered_at FROM "BoardConfig" WHERE id = 1`,
    );
    const scoringDone = !!board.rows[0]?.final_scoring_triggered_at;
    const showAllStats = settings.ShowAllStats === 'true';

    // 規格：福分/業力 受 ShowAllStats 與 final_scoring 雙重控管
    if ((type === 'blessing' || type === 'karma') && !showAllStats && !scoringDone) {
      throw new Error('FORBIDDEN');
    }

    const ps = await query<{ money: number; health: number; blessing: number; karma: number }>(
      `SELECT money, health, blessing, karma FROM "PlayerStats" WHERE user_id = $1`,
      [session.userId],
    );
    const me = ps.rows[0];

    const entries = await query<HistoryEntry>(
      `SELECT id, tx_type, payload, created_at,
              NULL::int AS delta
       FROM "Transaction"
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [session.userId],
    );

    // 從 payload 推算對該 type 的 delta（盡力而為）
    const computed = entries.rows.map((e) => ({
      ...e,
      delta: extractDelta(e.tx_type, e.payload, type),
    }));

    return ok({
      entries: computed,
      current_value: me ? me[type] : 0,
      show_all_stats: showAllStats,
      scoring_done: scoringDone,
    });
  } catch (err) {
    return fail(err);
  }
}

function extractDelta(txType: string, payload: Record<string, unknown>, type: HistoryType): number | null {
  // 各 tx_type 的 payload 對應該 type 的變動推算
  if (txType === 'destiny_draw') {
    const v = payload[type];
    return typeof v === 'number' ? v : null;
  }
  if (txType === 'rebirth') {
    const ns = payload['new_stats'] as Record<string, number> | undefined;
    const before = payload['before'] as Record<string, number> | undefined;
    if (ns && before && typeof ns[type] === 'number' && typeof before[type] === 'number') {
      return ns[type] - before[type];
    }
    return null;
  }
  if (txType === 'transfer') {
    if (type !== 'money') return 0;
    const from = payload['from'];
    const amt = payload['amount'];
    const fee = payload['fee'];
    if (typeof amt !== 'number') return null;
    // 收款 / 出款判斷：若我是 from → -amount-fee；若是 to → +amount
    // payload 同時寫進兩筆 Transaction，所以這裡不知道哪筆是哪個玩家。
    // 簡化：以 from 是否等於本筆 user_id 推不出（要看上層 user_id），
    // 故回傳 null 讓 UI 顯示 ±不確定。實作時上層可再用 user_id 比對。
    void from; void fee;
    return null;
  }
  if (txType === 'exchange') {
    if (type === 'blessing') {
      const v = payload['blessing_cost'];
      return typeof v === 'number' ? -v : null;
    }
    if (type === 'money') {
      const v = payload['money_gain'];
      return typeof v === 'number' ? v : null;
    }
    return 0;
  }
  if (txType === 'bank_borrow') {
    if (type === 'money') {
      const v = payload['money_delta'];
      return typeof v === 'number' ? v : null;
    }
    return 0;
  }
  if (txType === 'bank_repay') {
    if (type === 'money') {
      const v = payload['amount'];
      return typeof v === 'number' ? -v : null;
    }
    return 0;
  }
  if (txType === 'bank_interest') {
    if (type === 'money') {
      const v = payload['money_due'];
      return typeof v === 'number' ? -v : null;
    }
    if (type === 'blessing') {
      const v = payload['blessing_due'];
      return typeof v === 'number' ? -v : null;
    }
    return 0;
  }
  if (txType === 'stock_buy') {
    if (type === 'money') {
      const v = payload['cost'];
      return typeof v === 'number' ? -v : null;
    }
    return 0;
  }
  if (txType === 'stock_sell') {
    if (type === 'money') {
      const v = payload['proceeds'];
      return typeof v === 'number' ? v : null;
    }
    return 0;
  }
  if (txType === 'quick_action') {
    const d = payload['delta'] as Record<string, number> | undefined;
    if (d && typeof d[type] === 'number') return d[type];
    return null;
  }
  return null;
}

export async function decodePlayerQrToken(token: string): Promise<ActionResult<{ user_id: string; name: string }>> {
  try {
    await requireRole('player');
    const decoded = verifyQrToken(token, 'player');
    if (!decoded) throw new ActionError('INVALID_INPUT', 'QR Code 無效或已過期');
    const r = await query<{ user_id: string; name: string }>(
      `SELECT user_id, name FROM "Account"
       WHERE user_id = $1 AND role = 'player' AND is_active = true`,
      [decoded.sub],
    );
    if (r.rows.length === 0) throw new ActionError('NOT_FOUND', '玩家不存在');
    return ok(r.rows[0]);
  } catch (err) {
    return fail(err);
  }
}
