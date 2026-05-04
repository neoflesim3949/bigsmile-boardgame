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
      await assertNotDuringFinalScoring(client);
      await assertNotTourMode(client);
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
      // 規格：滾動 cycle 配額演算法 — CLAUDE.md「命格抽卡比例與配額」
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
        draw_ratio: number;
      }>(
        `SELECT label, emoji, description, theme, rarity_label,
                money, health, blessing, karma, draw_ratio
         FROM "InitialValueTemplate"
         WHERE is_active = true`,
      );

      let chosen: {
        label: string; emoji: string; description: string;
        theme: DestinyTheme; rarity_label: string;
        money: number; health: number; blessing: number; karma: number;
      };

      if (templates.rows.length > 0) {
        // 取 MaxDestinyDraws 與各命格已抽人數（單條 GROUP BY，無 N+1）
        const maxDrawsStr = await getSetting('MaxDestinyDraws');
        const maxDraws = Math.max(1, Number(maxDrawsStr) || 100);
        const drawnR = await client.query<{ destiny_name: string; cnt: string }>(
          `SELECT destiny_name, COUNT(*)::text AS cnt
           FROM "PlayerStats"
           WHERE destiny_name IS NOT NULL
           GROUP BY destiny_name`,
        );
        const drawnMap = new Map(drawnR.rows.map((r) => [r.destiny_name, Number(r.cnt)]));
        const totalDrawn = Array.from(drawnMap.values()).reduce((a, b) => a + b, 0);
        const cycle = Math.floor(totalDrawn / maxDraws);

        // 篩出 active 且仍有 quota 的候選
        const candidates = templates.rows.filter((t) => {
          const quota = Math.floor((maxDraws * t.draw_ratio) / 100);
          if (quota === 0) return false; // ratio=0 不參與抽卡（admin 故意設）
          const effective = (cycle + 1) * quota;
          const already = drawnMap.get(t.label) ?? 0;
          return already < effective;
        });

        // 候選為空 → fallback 從所有 active 範本均勻抽（永不擋人，極端浮點偏差）
        const pool = candidates.length > 0 ? candidates : templates.rows;
        chosen = pool[Math.floor(Math.random() * pool.length)];
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
  /** 當前對應的 KarmaBand label（依 karma 落點 LATERAL join；無對應 band 為 null） */
  karma_band_label: string | null;
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
      karma_band_label: string | null;
    }>(
      `SELECT ps.money, ps.health, ps.blessing, ps.karma, ps.rebirth_count, ps.bank_loan,
              ps.destiny_name, ps.last_manual_refresh_at,
              kb.label AS karma_band_label
       FROM "PlayerStats" ps
       LEFT JOIN LATERAL (
         SELECT label
         FROM "KarmaBand"
         WHERE is_active = true
           AND (karma_min IS NULL OR ps.karma >= karma_min)
           AND (karma_max IS NULL OR ps.karma <= karma_max)
         ORDER BY sort_order ASC LIMIT 1
       ) kb ON true
       WHERE ps.user_id = $1`,
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
        karma_band_label: stats.karma_band_label,
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

      // 兩筆 Transaction 各自寫「自己視角」的 payload（direction + counterparty 名）
      // 這樣歷史明細才能正確顯示「轉出 / 收到自 + 對方名 + 金額」與正負 delta
      const senderName = session.name;
      const receiverName = target.rows[0].name;
      const note = data.note ?? '';
      const senderPayload = JSON.stringify({
        direction: 'out',
        counterparty_user_id: data.toUserId,
        counterparty_name: receiverName,
        amount: data.amount,
        fee,
        note,
      });
      const receiverPayload = JSON.stringify({
        direction: 'in',
        counterparty_user_id: session.userId,
        counterparty_name: senderName,
        amount: data.amount,
        fee: 0,  // 收款方不付手續費
        note,
      });
      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $1, 'transfer', $2),
                ($3, $1, 'transfer', $4)`,
        [session.userId, senderPayload, data.toUserId, receiverPayload],
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
    // 取 admin 在 dashboard 設的即時匯率倍率
    const multStr = await getSetting('ExchangeRateMultiplier');
    const mult = Number(multStr) || 1.0;
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
      // 套用即時倍率，前端顯示 = effective rate（後端 exchangeBlessing 也用同一倍率算實際入帳）
      const effective_per_unit = Math.round(row.money_gain_per_unit * mult);
      return {
        id: row.id,
        label: row.label,
        money_gain_per_unit: effective_per_unit,
        max_units,
        max_money: max_units * effective_per_unit,
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
      // 算法跟 listExchangeOptionsForPlayer 一致：先 round 出 effective per_unit，
      // 再乘 units（避免「顯示 +200、實際 +199」的 rounding 爭議）
      const multStr = await getSetting('ExchangeRateMultiplier');
      const mult = Number(multStr) || 1.0;
      const effectivePerUnit = Math.round(opt.rows[0].money_gain_per_unit * mult);

      const totalCost = opt.rows[0].blessing_cost_per_unit * data.units;
      const totalGain = effectivePerUnit * data.units;
      // 對齊 CLAUDE.md §6.2：/exchange 禁止前台顯示福報訊息，錯誤訊息用「條件不符」
      if (me.blessing < totalCost) throw new ActionError('INSUFFICIENT_FUNDS', `額度不足（最多可換 ${Math.floor(me.blessing / opt.rows[0].blessing_cost_per_unit)} 單位）`);

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
// 銀行借貸（合約化：每筆借款一張獨立 row、可指定還哪一張、利息按 balance/principal 比例）
//
// **CLAUDE.md §6.2 / §3 規則**：銀行 / 借貸前台禁止顯示「福分 / 福報」相關訊息。
// 錯誤訊息與 UI 一律以「單位（unit）」表達。後端可自由運用 blessing_collateral 算抵押。
// ─────────────────────────────────────────────────────────────
export interface BankLoanOptionViewPlayer {
  id: string;
  label: string;
  money_per_unit: number;
  interest_money_per_round: number;
  /** 本次最多可借多少單位（依目前抵押容量計算；不顯示計算過程） */
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
    }>(
      `SELECT blo.id, blo.label,
              blo.blessing_collateral_per_unit, blo.money_per_unit, blo.interest_money_per_round,
              ps.blessing
       FROM "BankLoanOption" blo
       CROSS JOIN "PlayerStats" ps
       WHERE blo.is_active = true AND ps.user_id = $1
       ORDER BY blo.display_order ASC, blo.label ASC`,
      [session.userId],
    );
    const out = r.rows.map((row) => ({
      id: row.id,
      label: row.label,
      money_per_unit: row.money_per_unit,
      interest_money_per_round: row.interest_money_per_round,
      // 用「可借單位」表達（前台不揭露 blessing 計算過程）
      available_units: Math.max(0, Math.floor(row.blessing / row.blessing_collateral_per_unit)),
    }));
    return ok(out);
  } catch (err) {
    return fail(err);
  }
}

/** 玩家當前未還清的合約。每筆是一張獨立合約，可被個別還款。 */
export interface ActiveLoanContract {
  id: string;
  loan_label: string;
  principal: number;
  balance: number;
  borrowed_at: string;
  base_interest_money_per_round: number;
  base_interest_blessing_per_round: number;
  /** 下回合預估扣金錢（按 balance/principal 比例 round） */
  next_interest_money: number;
}

export async function listMyActiveLoans(): Promise<ActionResult<ActiveLoanContract[]>> {
  try {
    const session = await requireRole('player');
    const r = await query<ActiveLoanContract>(
      `SELECT id, loan_label, principal, balance, borrowed_at,
              base_interest_money_per_round, base_interest_blessing_per_round,
              ROUND(base_interest_money_per_round * balance::numeric / principal)::int AS next_interest_money
       FROM "PlayerLoan"
       WHERE user_id = $1 AND balance > 0
       ORDER BY borrowed_at ASC`,
      [session.userId],
    );
    return ok(r.rows);
  } catch (err) {
    return fail(err);
  }
}

const borrowSchema = z.object({
  optionId: z.uuid(),
  units: z.number().int().positive(),
});

export async function borrowFromBank(payload: z.infer<typeof borrowSchema>): Promise<ActionResult<{
  borrowed_money: number;
  loan_id: string;
  new_balance: { money: number; bank_loan: number };
}>> {
  try {
    const session = await requireRole('player');
    const data = borrowSchema.parse(payload);

    const result = await withTx(async (client) => {
      await assertNotDuringFinalScoring(client);
      await assertNotTourMode(client);
      const opt = await client.query<{
        label: string;
        blessing_collateral_per_unit: number;
        money_per_unit: number;
        interest_money_per_round: number;
        interest_blessing_per_round: number;
      }>(
        `SELECT label, blessing_collateral_per_unit, money_per_unit,
                interest_money_per_round, interest_blessing_per_round
         FROM "BankLoanOption" WHERE id = $1 AND is_active = true`,
        [data.optionId],
      );
      if (opt.rows.length === 0) throw new ActionError('NOT_FOUND', '借貸方案不存在或已停用');
      const o = opt.rows[0];

      const stats = await client.query<{ money: number; health: number; blessing: number; bank_loan: number }>(
        `SELECT money, health, blessing, bank_loan FROM "PlayerStats" WHERE user_id = $1 FOR UPDATE`,
        [session.userId],
      );
      const me = stats.rows[0];
      if (!me) throw new ActionError('NOT_FOUND', '');
      assertPlayerAlive(me);

      // 抵押容量檢查：以 floor(blessing / collateral_per_unit) 為當下最大可借單位
      // 錯誤訊息只暴露「單位」（前台不揭露 blessing 計算過程）
      const available = Math.max(0, Math.floor(me.blessing / o.blessing_collateral_per_unit));
      if (data.units > available) {
        throw new ActionError('INVALID_INPUT', `額度不足（本次最多可借 ${available} 單位）`);
      }

      const blessingNeeded = data.units * o.blessing_collateral_per_unit;
      const principal = data.units * o.money_per_unit;
      const baseMoneyInterest = data.units * o.interest_money_per_round;
      const baseBlessingInterest = data.units * o.interest_blessing_per_round;

      // 後端靜默扣抵押 blessing；前端不會看到此扣除（CLAUDE.md §6.2）
      const updPS = await client.query<{ money: number; bank_loan: number }>(
        `UPDATE "PlayerStats"
         SET money = money + $2,
             bank_loan = bank_loan + $2,
             blessing = blessing - $3,
             loan_updated_at = COALESCE(loan_updated_at, now()),
             updated_at = now()
         WHERE user_id = $1
         RETURNING money, bank_loan`,
        [session.userId, principal, blessingNeeded],
      );

      const ins = await client.query<{ id: string }>(
        `INSERT INTO "PlayerLoan"
           (user_id, loan_option_id, loan_label, principal, balance,
            blessing_paid_at_borrow, base_interest_money_per_round, base_interest_blessing_per_round)
         VALUES ($1, $2, $3, $4, $4, $5, $6, $7)
         RETURNING id`,
        [session.userId, data.optionId, o.label, principal, blessingNeeded, baseMoneyInterest, baseBlessingInterest],
      );

      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $1, 'bank_borrow', $2)`,
        [session.userId, JSON.stringify({
          loan_id: ins.rows[0].id,
          loan_label: o.label,
          option_id: data.optionId,
          units: data.units,
          principal,
          base_interest_money: baseMoneyInterest,
        })],
      );
      return {
        borrowed_money: principal,
        loan_id: ins.rows[0].id,
        new_balance: { money: updPS.rows[0].money, bank_loan: updPS.rows[0].bank_loan },
      };
    });

    revalidatePath('/bank');
    revalidatePath('/');
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

const repaySchema = z.object({
  loanId: z.uuid(),
  amount: z.number().int().positive(),
});

export async function repayBank(payload: z.infer<typeof repaySchema>): Promise<ActionResult<{
  loan_id: string;
  amount_repaid: number;
  loan_balance_after: number;
  loan_paid_off: boolean;
  new_balance: { money: number; bank_loan: number };
}>> {
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

      // 鎖該合約 row（防同筆雙重還）
      const loan = await client.query<{ balance: number; principal: number; loan_label: string }>(
        `SELECT balance, principal, loan_label FROM "PlayerLoan"
         WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [data.loanId, session.userId],
      );
      if (loan.rows.length === 0) throw new ActionError('NOT_FOUND', '借款合約不存在');
      const c = loan.rows[0];
      if (c.balance <= 0) throw new ActionError('INVALID_INPUT', '此合約已還清');

      const repay = Math.min(data.amount, c.balance, me.money);
      if (repay <= 0) throw new ActionError('INSUFFICIENT_FUNDS', '金錢不足以還款');

      const newBalance = c.balance - repay;
      const paidOff = newBalance === 0;

      await client.query(
        `UPDATE "PlayerLoan"
         SET balance = $2,
             paid_off_at = CASE WHEN $2 = 0 THEN now() ELSE paid_off_at END,
             updated_at = now()
         WHERE id = $1`,
        [data.loanId, newBalance],
      );

      // 若這是最後一張未還清的合約，把 PlayerStats.loan_updated_at 清掉
      const upd = await client.query<{ money: number; bank_loan: number }>(
        `UPDATE "PlayerStats"
         SET money = money - $2,
             bank_loan = bank_loan - $2,
             loan_updated_at = CASE
               WHEN $4::boolean AND NOT EXISTS (
                 SELECT 1 FROM "PlayerLoan" WHERE user_id = $1 AND balance > 0 AND id <> $3
               ) THEN NULL
               ELSE loan_updated_at
             END,
             updated_at = now()
         WHERE user_id = $1
         RETURNING money, bank_loan`,
        [session.userId, repay, data.loanId, paidOff],
      );

      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $1, 'bank_repay', $2)`,
        [session.userId, JSON.stringify({
          loan_id: data.loanId,
          loan_label: c.loan_label,
          amount: repay,
          loan_balance_after: newBalance,
          loan_paid_off: paidOff,
        })],
      );

      return {
        loan_id: data.loanId,
        amount_repaid: repay,
        loan_balance_after: newBalance,
        loan_paid_off: paidOff,
        new_balance: upd.rows[0],
      };
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
    const direction = payload['direction'];
    const amt = payload['amount'];
    const fee = payload['fee'];
    if (typeof amt !== 'number') return null;
    if (direction === 'out') {
      const f = typeof fee === 'number' ? fee : 0;
      return -(amt + f);
    }
    if (direction === 'in') {
      return amt;
    }
    // 舊版 row（沒寫 direction）→ 推不出方向，回 null 顯示空白
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
      // 合約化 schema 後改用 principal；保留 money_delta fallback 兼容舊紀錄
      const v = payload['principal'] ?? payload['money_delta'];
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
    if (type === 'blessing') {
      // 基礎規則：每 1000 獲利扣 0.1 福分（賠錢不扣）
      const v = payload['blessing_penalty'];
      return typeof v === 'number' ? -v : 0;
    }
    return 0;
  }
  if (txType === 'captain_stock_sell_mult') {
    if (type === 'money') {
      const v = payload['total_money_gain'];
      return typeof v === 'number' ? v : null;
    }
    if (type === 'blessing') {
      const v = payload['blessing_penalty'];
      return typeof v === 'number' ? -v : 0;
    }
    return 0;
  }
  if (txType === 'forced_liquidation') {
    // 強制平倉以 $0 售出，金錢不變動；其他指標也不影響
    return 0;
  }
  if (txType === 'karma_band_effect') {
    const key = `${type}_delta` as 'money_delta' | 'health_delta' | 'blessing_delta' | 'karma_delta';
    const v = payload[key];
    return typeof v === 'number' ? v : 0;
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
