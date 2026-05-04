'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { ActionError, fail, ok, type ActionResult } from '@/lib/error';
import { query, withTx } from '@/lib/db';
import {
  assertCaptainOfStation,
  assertNotDuringFinalScoring,
  assertNotTourMode,
  assertPlayerAlive,
  assertPlayerDead,
  requireRole,
} from '@/lib/auth';
import { verifyQrToken } from '@/lib/qr';
import { getSetting } from '@/lib/settings';

// ─────────────────────────────────────────────────────────────
// 關主可看到的關卡（自己被指派的）
// ─────────────────────────────────────────────────────────────
export interface CaptainStation {
  id: string;
  name: string;
  description: string;
  allow_rebirth: boolean;
  allow_stock_sell_multiplier: boolean;
  player_max_uses: number | null;
  global_max_uses: number | null;
  global_use_count: number;
}

export async function listMyStations(): Promise<ActionResult<CaptainStation[]>> {
  try {
    const session = await requireRole('captain');
    const r = await query<CaptainStation>(
      `SELECT id, name, description, allow_rebirth, allow_stock_sell_multiplier,
              player_max_uses, global_max_uses, global_use_count
       FROM "Station"
       WHERE is_active = true AND $1 = ANY(captain_user_ids)
       ORDER BY created_at ASC`,
      [session.userId],
    );
    return ok(r.rows);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// 快捷模組 CRUD（綁關卡，同站多關主共用）
// ─────────────────────────────────────────────────────────────
export interface QuickActionRow {
  id: string;
  station_id: string;
  station_name?: string;
  label: string;
  delta_money: number;
  delta_health: number;
  delta_blessing: number;
  delta_karma: number;
  bound_item_id: string | null;
  bound_item_name?: string | null;
  req_money: number | null;
  req_health: number | null;
  req_blessing: number | null;
  req_karma: number | null;
  req_item_id: string | null;
  player_max_uses: number | null;
  global_max_uses: number | null;
  global_use_count: number;
}

export async function listMyQuickActions(): Promise<ActionResult<QuickActionRow[]>> {
  try {
    const session = await requireRole('captain');
    // 列出 captain 被指派的所有關卡的快捷模組（站綁定，多關主共用）
    const r = await query<QuickActionRow>(
      `SELECT qa.id, qa.station_id, s.name AS station_name,
              qa.label,
              qa.delta_money, qa.delta_health, qa.delta_blessing, qa.delta_karma,
              qa.bound_item_id, i.name AS bound_item_name,
              qa.req_money, qa.req_health, qa.req_blessing, qa.req_karma, qa.req_item_id,
              qa.player_max_uses, qa.global_max_uses, qa.global_use_count
       FROM "QuickAction" qa
       JOIN "Station" s ON s.id = qa.station_id
       LEFT JOIN "Item" i ON i.id = qa.bound_item_id
       WHERE $1 = ANY(s.captain_user_ids) AND s.is_active = true
       ORDER BY s.created_at ASC, qa.created_at ASC`,
      [session.userId],
    );
    return ok(r.rows);
  } catch (err) {
    return fail(err);
  }
}

const quickActionSchema = z.object({
  id: z.uuid().optional(),
  station_id: z.uuid(),
  label: z.string().min(1).max(60),
  delta_money: z.number().int(),
  delta_health: z.number().int(),
  delta_blessing: z.number().int(),
  delta_karma: z.number().int(),
  bound_item_id: z.uuid().nullable(),
  req_money: z.number().int().nullable(),
  req_health: z.number().int().nullable(),
  req_blessing: z.number().int().nullable(),
  req_karma: z.number().int().nullable(),
  req_item_id: z.uuid().nullable(),
  player_max_uses: z.number().int().positive().nullable(),
  global_max_uses: z.number().int().positive().nullable(),
});
export type QuickActionPayload = z.infer<typeof quickActionSchema>;

export async function upsertQuickAction(p: QuickActionPayload): Promise<ActionResult<QuickActionRow>> {
  try {
    const session = await requireRole('captain');
    const data = quickActionSchema.parse(p);
    // 必須是自己被指派的關卡
    await assertCaptainOfStation(null, session.userId, data.station_id);

    if (data.id) {
      // 確認此 QuickAction 屬於 captain 管轄的某個 station（即使 station_id 變更也驗新舊兩端）
      const own = await query<{ station_id: string }>(
        `SELECT qa.station_id FROM "QuickAction" qa
         JOIN "Station" s ON s.id = qa.station_id
         WHERE qa.id = $1 AND $2 = ANY(s.captain_user_ids)`,
        [data.id, session.userId],
      );
      if (own.rows.length === 0) {
        throw new ActionError('NOT_FOUND', '快捷模組不存在或非你關卡');
      }
      const r = await query<QuickActionRow>(
        `UPDATE "QuickAction"
         SET station_id=$1, label=$2,
             delta_money=$3, delta_health=$4, delta_blessing=$5, delta_karma=$6,
             bound_item_id=$7,
             req_money=$8, req_health=$9, req_blessing=$10, req_karma=$11, req_item_id=$12,
             player_max_uses=$13, global_max_uses=$14
         WHERE id=$15
         RETURNING id, station_id, label,
                   delta_money, delta_health, delta_blessing, delta_karma,
                   bound_item_id, req_money, req_health, req_blessing, req_karma, req_item_id,
                   player_max_uses, global_max_uses, global_use_count`,
        [
          data.station_id, data.label,
          data.delta_money, data.delta_health, data.delta_blessing, data.delta_karma,
          data.bound_item_id,
          data.req_money, data.req_health, data.req_blessing, data.req_karma, data.req_item_id,
          data.player_max_uses, data.global_max_uses,
          data.id,
        ],
      );
      if (r.rows.length === 0) throw new ActionError('NOT_FOUND', '快捷模組不存在');
      revalidatePath('/captain/actions');
      return ok(r.rows[0]);
    }
    const r = await query<QuickActionRow>(
      `INSERT INTO "QuickAction"
         (station_id, label,
          delta_money, delta_health, delta_blessing, delta_karma,
          bound_item_id,
          req_money, req_health, req_blessing, req_karma, req_item_id,
          player_max_uses, global_max_uses)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, station_id, label,
                 delta_money, delta_health, delta_blessing, delta_karma,
                 bound_item_id, req_money, req_health, req_blessing, req_karma, req_item_id,
                 player_max_uses, global_max_uses, global_use_count`,
      [
        data.station_id, data.label,
        data.delta_money, data.delta_health, data.delta_blessing, data.delta_karma,
        data.bound_item_id,
        data.req_money, data.req_health, data.req_blessing, data.req_karma, data.req_item_id,
        data.player_max_uses, data.global_max_uses,
      ],
    );
    revalidatePath('/captain/actions');
    return ok(r.rows[0]);
  } catch (err) {
    return fail(err);
  }
}

export async function deleteQuickAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireRole('captain');
    // 驗 QuickAction 屬於 captain 管轄的 station
    const own = await query<{ station_id: string }>(
      `SELECT qa.station_id FROM "QuickAction" qa
       JOIN "Station" s ON s.id = qa.station_id
       WHERE qa.id = $1 AND $2 = ANY(s.captain_user_ids)`,
      [id, session.userId],
    );
    if (own.rows.length === 0) {
      throw new ActionError('NOT_FOUND', '快捷模組不存在或非你關卡');
    }
    await query(`DELETE FROM "QuickAction" WHERE id = $1`, [id]);
    revalidatePath('/captain/actions');
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}

/** /captain/actions 編輯時用：列出可選道具 */
export async function listActiveItems(): Promise<ActionResult<{ id: string; name: string; icon: string }[]>> {
  try {
    await requireRole('captain');
    const r = await query<{ id: string; name: string; icon: string }>(
      `SELECT id, name, icon FROM "Item" WHERE is_active = true ORDER BY name ASC`,
    );
    return ok(r.rows);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// 掃碼 → 解析玩家
// ─────────────────────────────────────────────────────────────
export interface ScannedPlayer {
  user_id: string;
  name: string;
  destiny_name: string | null;
  money: number;
  health: number;
  blessing: number;
  karma: number;
  is_dead: boolean;
  rebirth_count: number;
}

export interface PlayerScannedItem {
  item_id: string;
  name: string;
  icon: string;
  description: string;
  granted_at: string;
}

export interface PlayerLookupResult {
  player: ScannedPlayer;
  /** 玩家當前道具（依 granted_at desc 排序，captain 用以判斷是否符合 req_item_id） */
  player_items: PlayerScannedItem[];
  allow_rebirth: boolean;
  station: CaptainStation;
  my_quick_actions: QuickActionRow[];
  /** 'qr' = 透過掃碼，'manual' = 關主手動輸入 ID（重生鍵不允許走此路徑） */
  source: 'qr' | 'manual';
}

async function buildLookupResult(
  captainUserId: string,
  targetUserId: string,
  stationId: string,
  source: 'qr' | 'manual',
): Promise<PlayerLookupResult> {
  const stationCheck = await assertCaptainOfStation(null, captainUserId, stationId);

  const stationR = await query<CaptainStation>(
    `SELECT id, name, description, allow_rebirth, allow_stock_sell_multiplier,
            player_max_uses, global_max_uses, global_use_count
     FROM "Station" WHERE id = $1`,
    [stationId],
  );
  const station = stationR.rows[0];
  if (!station) throw new ActionError('NOT_FOUND', '關卡不存在');

  const playerR = await query<ScannedPlayer>(
    `SELECT a.user_id, a.name,
            ps.destiny_name, ps.money, ps.health, ps.blessing, ps.karma, ps.rebirth_count,
            (ps.health <= 0 OR ps.blessing <= 0) AS is_dead
     FROM "Account" a
     JOIN "PlayerStats" ps ON ps.user_id = a.user_id
     WHERE a.user_id = $1 AND a.role = 'player' AND a.is_active = true`,
    [targetUserId],
  );
  if (playerR.rows.length === 0) throw new ActionError('NOT_FOUND', '玩家不存在或已停用');

  const qaR = await query<QuickActionRow>(
    `SELECT qa.id, qa.station_id, s.name AS station_name,
            qa.label,
            qa.delta_money, qa.delta_health, qa.delta_blessing, qa.delta_karma,
            qa.bound_item_id, i.name AS bound_item_name,
            qa.req_money, qa.req_health, qa.req_blessing, qa.req_karma, qa.req_item_id,
            qa.player_max_uses, qa.global_max_uses, qa.global_use_count
     FROM "QuickAction" qa
     JOIN "Station" s ON s.id = qa.station_id
     LEFT JOIN "Item" i ON i.id = qa.bound_item_id
     WHERE qa.station_id = $1
     ORDER BY qa.created_at ASC`,
    [stationId],
  );
  void captainUserId; // captain 已由 assertCaptainOfStation 驗證

  // 玩家當前道具（含名稱 / icon / 描述）
  const itemsR = await query<PlayerScannedItem>(
    `SELECT pi.item_id, i.name, i.icon, i.description, pi.granted_at
     FROM "PlayerItem" pi
     JOIN "Item" i ON i.id = pi.item_id
     WHERE pi.user_id = $1
     ORDER BY pi.granted_at DESC`,
    [targetUserId],
  );

  return {
    player: playerR.rows[0],
    player_items: itemsR.rows,
    allow_rebirth: stationCheck.allow_rebirth,
    station,
    my_quick_actions: qaR.rows,
    source,
  };
}

export async function lookupPlayerByQR(
  token: string,
  stationId: string,
): Promise<ActionResult<PlayerLookupResult>> {
  try {
    const session = await requireRole('captain');
    const decoded = verifyQrToken(token, 'player');
    if (!decoded) throw new ActionError('INVALID_INPUT', 'QR Code 無效或已過期');
    return ok(await buildLookupResult(session.userId, decoded.sub, stationId, 'qr'));
  } catch (err) {
    return fail(err);
  }
}

/**
 * 完成結算前的「再驗證」— 只解 QR token 拿 user_id，不重新 lookup 整個 PlayerLookupResult。
 * 用途：關主按「完成結算」前要再掃一次玩家 QR / 輸入 ID 確認玩家還在現場。
 */
export async function captainVerifyPlayerQr(token: string): Promise<ActionResult<{ user_id: string; name: string }>> {
  try {
    await requireRole('captain');
    const decoded = verifyQrToken(token, 'player');
    if (!decoded) throw new ActionError('INVALID_INPUT', 'QR Code 無效或已過期');
    const r = await query<{ user_id: string; name: string }>(
      `SELECT user_id, name FROM "Account" WHERE user_id = $1 AND role = 'player' AND is_active = true`,
      [decoded.sub],
    );
    if (r.rows.length === 0) throw new ActionError('NOT_FOUND', '玩家不存在或已停用');
    return ok(r.rows[0]);
  } catch (err) {
    return fail(err);
  }
}

/**
 * 手動輸入 ID 查找玩家（QR 掃碼失敗時的後備路徑）。
 * **限制**：不能用於重生 — 重生強制走 QR 掃碼路徑（CLAUDE.md §4 / spec）。
 * 規則跟 player.ts 的 lookupPlayerById 一樣：≥ 6 碼才查。
 */
export async function lookupPlayerByManualId(
  rawUserId: string,
  stationId: string,
): Promise<ActionResult<PlayerLookupResult>> {
  try {
    const session = await requireRole('captain');
    const userId = rawUserId.trim();
    if (userId.length < 6) {
      throw new ActionError('INVALID_INPUT', '請輸入完整玩家 ID（≥ 6 碼）');
    }
    return ok(await buildLookupResult(session.userId, userId, stationId, 'manual'));
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// 套用快捷模組（pg tx；前置檢查 + 限額 + 道具發放 + 計數 + Transaction）
// ─────────────────────────────────────────────────────────────
const applySchema = z.object({
  quickActionId: z.uuid(),
  targetUserId: z.string().min(3),
});

export interface ApplyResult {
  delta_money: number;
  delta_health: number;
  delta_blessing: number;
  delta_karma: number;
  granted_item_id: string | null;
  player_after: { money: number; health: number; blessing: number; karma: number; is_dead: boolean };
}

export async function applyQuickAction(p: z.infer<typeof applySchema>): Promise<ActionResult<ApplyResult>> {
  try {
    const session = await requireRole('captain');
    const data = applySchema.parse(p);

    const result = await withTx(async (client) => {
      await assertNotDuringFinalScoring(client);
      await assertNotTourMode(client);
      // 抓快捷模組 + 對應關卡（單一 SQL）
      const qa = await client.query<{
        id: string; station_id: string;
        label: string;
        station_name: string;
        delta_money: number; delta_health: number; delta_blessing: number; delta_karma: number;
        bound_item_id: string | null;
        bound_item_name: string | null;
        req_money: number | null; req_health: number | null; req_blessing: number | null; req_karma: number | null;
        req_item_id: string | null;
        player_max_uses: number | null; global_max_uses: number | null;
        global_use_count: number;
        station_player_max: number | null;
        station_global_max: number | null;
        station_global_count: number;
        captain_user_ids: string[];
      }>(
        `SELECT qa.id, qa.station_id,
                qa.label,
                s.name AS station_name,
                qa.delta_money, qa.delta_health, qa.delta_blessing, qa.delta_karma,
                qa.bound_item_id, i.name AS bound_item_name,
                qa.req_money, qa.req_health, qa.req_blessing, qa.req_karma, qa.req_item_id,
                qa.player_max_uses, qa.global_max_uses, qa.global_use_count,
                s.player_max_uses AS station_player_max,
                s.global_max_uses AS station_global_max,
                s.global_use_count AS station_global_count,
                s.captain_user_ids
         FROM "QuickAction" qa
         JOIN "Station" s ON s.id = qa.station_id
         LEFT JOIN "Item" i ON i.id = qa.bound_item_id
         WHERE qa.id = $1
         FOR UPDATE OF qa, s`,
        [data.quickActionId],
      );
      if (qa.rows.length === 0) throw new ActionError('NOT_FOUND', '快捷模組不存在');
      const q = qa.rows[0];
      if (!q.captain_user_ids.includes(session.userId)) throw new ActionError('FORBIDDEN', '你不是此關卡關主');

      // 鎖玩家 row + 取 stats
      const ps = await client.query<{ money: number; health: number; blessing: number; karma: number }>(
        `SELECT money, health, blessing, karma
         FROM "PlayerStats" WHERE user_id = $1 FOR UPDATE`,
        [data.targetUserId],
      );
      const me = ps.rows[0];
      if (!me) throw new ActionError('NOT_FOUND', '玩家不存在');

      // 死亡狀態檢查（spec：地獄玩家只能被重生，不能被快捷模組變動）
      assertPlayerAlive(me);

      // req 條件
      const lacking: string[] = [];
      if (q.req_money !== null && me.money < q.req_money) lacking.push(`金錢需 ≥ ${q.req_money}`);
      if (q.req_health !== null && me.health < q.req_health) lacking.push(`健康需 ≥ ${q.req_health}`);
      if (q.req_blessing !== null && me.blessing < q.req_blessing) lacking.push(`福分需 ≥ ${q.req_blessing}`);
      if (q.req_karma !== null && me.karma < q.req_karma) lacking.push(`業力需 ≥ ${q.req_karma}`);
      if (q.req_item_id) {
        const has = await client.query(
          `SELECT 1 FROM "PlayerItem" WHERE user_id = $1 AND item_id = $2`,
          [data.targetUserId, q.req_item_id],
        );
        if (has.rows.length === 0) lacking.push('未持有指定道具');
      }
      if (lacking.length > 0) throw new ActionError('FORBIDDEN', `前提未達：${lacking.join('；')}`);

      // 限額：QuickAction global / player + Station global / player
      if (q.global_max_uses !== null && q.global_use_count >= q.global_max_uses) {
        throw new ActionError('USAGE_LIMIT_EXCEEDED', '快捷模組全場使用上限已達');
      }
      if (q.station_global_max !== null && q.station_global_count >= q.station_global_max) {
        throw new ActionError('USAGE_LIMIT_EXCEEDED', '此關卡全場使用上限已達');
      }
      if (q.player_max_uses !== null) {
        const pc = await client.query<{ count: number }>(
          `SELECT count FROM "QuickActionUsage" WHERE quickaction_id = $1 AND user_id = $2`,
          [data.quickActionId, data.targetUserId],
        );
        const used = pc.rows[0]?.count ?? 0;
        if (used >= q.player_max_uses) throw new ActionError('USAGE_LIMIT_EXCEEDED', '此玩家對該快捷模組使用上限已達');
      }
      if (q.station_player_max !== null) {
        const pc = await client.query<{ count: number }>(
          `SELECT count FROM "StationUsage" WHERE station_id = $1 AND user_id = $2`,
          [q.station_id, data.targetUserId],
        );
        const used = pc.rows[0]?.count ?? 0;
        if (used >= q.station_player_max) throw new ActionError('USAGE_LIMIT_EXCEEDED', '此玩家對此關卡使用上限已達');
      }

      // 套用變動（health 上限 100；福分 / 業力 / 金錢可降為 0 下方）
      const newHealth = Math.min(100, Math.max(0, me.health + q.delta_health));
      const newMoney = me.money + q.delta_money;
      const newBlessing = Math.max(0, me.blessing + q.delta_blessing);
      const newKarma = me.karma + q.delta_karma;

      const upd = await client.query<{ money: number; health: number; blessing: number; karma: number }>(
        `UPDATE "PlayerStats"
         SET money = $2, health = $3, blessing = $4, karma = $5, updated_at = now()
         WHERE user_id = $1
         RETURNING money, health, blessing, karma`,
        [data.targetUserId, newMoney, newHealth, newBlessing, newKarma],
      );

      // 道具發放
      let grantedItemId: string | null = null;
      if (q.bound_item_id) {
        const ins = await client.query(
          `INSERT INTO "PlayerItem" (user_id, item_id, granted_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, item_id) DO NOTHING
           RETURNING item_id`,
          [data.targetUserId, q.bound_item_id, session.userId],
        );
        if (ins.rowCount && ins.rowCount > 0) grantedItemId = q.bound_item_id;
      }

      // 計數
      await client.query(
        `UPDATE "QuickAction" SET global_use_count = global_use_count + 1 WHERE id = $1`,
        [data.quickActionId],
      );
      await client.query(
        `UPDATE "Station" SET global_use_count = global_use_count + 1 WHERE id = $1`,
        [q.station_id],
      );
      await client.query(
        `INSERT INTO "QuickActionUsage" (quickaction_id, user_id, count)
         VALUES ($1, $2, 1)
         ON CONFLICT (quickaction_id, user_id) DO UPDATE SET
           count = "QuickActionUsage".count + 1,
           updated_at = now()`,
        [data.quickActionId, data.targetUserId],
      );
      await client.query(
        `INSERT INTO "StationUsage" (station_id, user_id, count)
         VALUES ($1, $2, 1)
         ON CONFLICT (station_id, user_id) DO UPDATE SET
           count = "StationUsage".count + 1,
           updated_at = now()`,
        [q.station_id, data.targetUserId],
      );

      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $2, 'quick_action', $3)`,
        [
          data.targetUserId, session.userId,
          JSON.stringify({
            quick_action_id: data.quickActionId,
            quick_action_label: q.label,
            station_id: q.station_id,
            station_name: q.station_name,
            delta: { money: q.delta_money, health: q.delta_health, blessing: q.delta_blessing, karma: q.delta_karma },
            granted_item_id: grantedItemId,
            granted_item_name: q.bound_item_name,
          }),
        ],
      );

      const after = upd.rows[0];
      return {
        delta_money: q.delta_money,
        delta_health: q.delta_health,
        delta_blessing: q.delta_blessing,
        delta_karma: q.delta_karma,
        granted_item_id: grantedItemId,
        player_after: { ...after, is_dead: after.health <= 0 || after.blessing <= 0 },
      };
    });

    revalidatePath('/captain');
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// 重生（多重防呆）
// ─────────────────────────────────────────────────────────────
const rebirthSchema = z.object({
  qrToken: z.string(),     // 必須走掃碼路徑，不接受手動輸入 user_id
  stationId: z.uuid(),
});

export async function rebirthPlayer(p: z.infer<typeof rebirthSchema>): Promise<ActionResult<{
  player_id: string;
  cleared: { stocks: number; loans: number; items: number };
}>> {
  try {
    const session = await requireRole('captain');
    const data = rebirthSchema.parse(p);

    const decoded = verifyQrToken(data.qrToken, 'player');
    if (!decoded) throw new ActionError('INVALID_INPUT', 'QR Code 無效或已過期');
    const targetId = decoded.sub;

    const result = await withTx(async (client) => {
      await assertNotDuringFinalScoring(client);
      await assertNotTourMode(client);

      // 關卡 + 重生鍵權限
      const stCheck = await assertCaptainOfStation(client, session.userId, data.stationId);
      if (!stCheck.allow_rebirth) throw new ActionError('FORBIDDEN', '此關卡未開放重生');

      // 玩家必須處於地獄狀態
      const ps = await client.query<{ money: number; health: number; blessing: number; karma: number; rebirth_count: number; bank_loan: number }>(
        `SELECT money, health, blessing, karma, rebirth_count, bank_loan
         FROM "PlayerStats" WHERE user_id = $1 FOR UPDATE`,
        [targetId],
      );
      const me = ps.rows[0];
      if (!me) throw new ActionError('NOT_FOUND', '玩家不存在');
      assertPlayerDead(me);

      // 讀重生初始值
      const settings = await client.query<{ key: string; value: string }>(
        `SELECT key, value FROM "AppSettings"
         WHERE key IN ('RebirthMoney', 'RebirthHealth', 'RebirthBlessing', 'RebirthKarma')`,
      );
      const sm = new Map(settings.rows.map((r) => [r.key, r.value] as const));
      const newMoney = Number(sm.get('RebirthMoney') ?? 500);
      const newHealth = Math.min(100, Number(sm.get('RebirthHealth') ?? 50));
      const newBlessing = Number(sm.get('RebirthBlessing') ?? 5);
      const newKarma = Number(sm.get('RebirthKarma') ?? 0);

      // 蒐集要清空的明細（寫進 Transaction payload 供爭議追溯）
      const stocks = await client.query<{ stock_id: string; shares: number }>(
        `SELECT stock_id, shares FROM "StockHolding" WHERE user_id = $1`,
        [targetId],
      );
      // PlayerLoan 已合約化（migration 0004）：每筆借款一張 row，含 principal/balance/loan_label
      const loans = await client.query<{ id: string; loan_label: string; principal: number; balance: number }>(
        `SELECT id, loan_label, principal, balance
         FROM "PlayerLoan" WHERE user_id = $1`,
        [targetId],
      );
      const items = await client.query<{ item_id: string; quantity: number }>(
        `SELECT item_id, 1 AS quantity FROM "PlayerItem" WHERE user_id = $1`,
        [targetId],
      );

      // 套用：四參數歸零、清股、清借、清道具，rebirth_count++
      await client.query(
        `UPDATE "PlayerStats"
         SET money = $2, health = $3, blessing = $4, karma = $5,
             rebirth_count = rebirth_count + 1,
             bank_loan = 0, loan_updated_at = NULL,
             updated_at = now()
         WHERE user_id = $1`,
        [targetId, newMoney, newHealth, newBlessing, newKarma],
      );
      await client.query(`DELETE FROM "StockHolding" WHERE user_id = $1`, [targetId]);
      await client.query(`DELETE FROM "PlayerLoan" WHERE user_id = $1`, [targetId]);
      await client.query(`DELETE FROM "PlayerItem" WHERE user_id = $1`, [targetId]);

      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $2, 'rebirth', $3)`,
        [
          targetId, session.userId,
          JSON.stringify({
            station_id: data.stationId,
            before: me,
            new_stats: { money: newMoney, health: newHealth, blessing: newBlessing, karma: newKarma },
            cleared_stocks: stocks.rows,
            cleared_loans: loans.rows,
            cleared_items: items.rows,
            cleared_bank_loan: me.bank_loan,
          }),
        ],
      );

      return {
        player_id: targetId,
        cleared: { stocks: stocks.rowCount ?? 0, loans: loans.rowCount ?? 0, items: items.rowCount ?? 0 },
      };
    });

    revalidatePath('/captain');
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// 取得已啟用的關卡（讓關主在掃碼前先選關卡 — 一個關主可能屬多站）
// ─────────────────────────────────────────────────────────────
export async function getRecommendedStation(): Promise<ActionResult<CaptainStation | null>> {
  try {
    const session = await requireRole('captain');
    const r = await query<CaptainStation>(
      `SELECT id, name, description, allow_rebirth, allow_stock_sell_multiplier,
              player_max_uses, global_max_uses, global_use_count
       FROM "Station"
       WHERE is_active = true AND $1 = ANY(captain_user_ids)
       ORDER BY created_at ASC LIMIT 1`,
      [session.userId],
    );
    return ok(r.rows[0] ?? null);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// 股票加乘賣出 — 倍率方案 CRUD（關主自管自己關卡的倍率）
// ─────────────────────────────────────────────────────────────
const sellMultiplierSchema = z.object({
  id: z.uuid().optional(),
  station_id: z.uuid(),
  label: z.string().min(1).max(60),
  money_multiplier: z.number().min(0).max(99.99),
  blessing_penalty_multiplier: z.number().min(0).max(99.99),
  req_item_ids: z.array(z.uuid()).max(20),
  sort_order: z.number().int().min(0).max(9999),
  is_active: z.boolean(),
});

export interface SellMultiplierRow {
  id: string;
  station_id: string;
  label: string;
  money_multiplier: number;
  blessing_penalty_multiplier: number;
  req_item_ids: string[];
  sort_order: number;
  is_active: boolean;
}

export async function listMyStationSellMultipliers(): Promise<ActionResult<SellMultiplierRow[]>> {
  try {
    const session = await requireRole('captain');
    // 只列出 captain 被指派的站、且站旗標已開啟的倍率方案
    const r = await query<SellMultiplierRow>(
      `SELECT m.id, m.station_id, m.label,
              m.money_multiplier::float8 AS money_multiplier,
              m.blessing_penalty_multiplier::float8 AS blessing_penalty_multiplier,
              m.req_item_ids,
              m.sort_order, m.is_active
       FROM "StationSellMultiplier" m
       JOIN "Station" s ON s.id = m.station_id
       WHERE s.allow_stock_sell_multiplier = true
         AND $1 = ANY(s.captain_user_ids)
       ORDER BY m.station_id, m.sort_order ASC, m.created_at ASC`,
      [session.userId],
    );
    return ok(r.rows);
  } catch (err) {
    return fail(err);
  }
}

export async function upsertStationSellMultiplier(
  payload: z.infer<typeof sellMultiplierSchema>,
): Promise<ActionResult<SellMultiplierRow>> {
  try {
    const session = await requireRole('captain');
    const data = sellMultiplierSchema.parse(payload);
    // 驗：captain 確實是這個 station 的關主，且 station 有開旗標
    const stCheck = await assertCaptainOfStation(null, session.userId, data.station_id);
    if (!stCheck.allow_stock_sell_multiplier) {
      throw new ActionError('FORBIDDEN', '此關卡未開放股票加乘賣出');
    }
    if (data.id) {
      const r = await query<SellMultiplierRow>(
        `UPDATE "StationSellMultiplier"
         SET label=$1, money_multiplier=$2, blessing_penalty_multiplier=$3,
             req_item_ids=$4,
             sort_order=$5, is_active=$6, updated_at=now()
         WHERE id=$7 AND station_id=$8
         RETURNING id, station_id, label,
                   money_multiplier::float8 AS money_multiplier,
                   blessing_penalty_multiplier::float8 AS blessing_penalty_multiplier,
                   req_item_ids, sort_order, is_active`,
        [data.label, data.money_multiplier, data.blessing_penalty_multiplier,
         data.req_item_ids,
         data.sort_order, data.is_active, data.id, data.station_id],
      );
      if (r.rows.length === 0) throw new ActionError('NOT_FOUND', '倍率方案不存在');
      revalidatePath('/captain');
      revalidatePath('/captain/multipliers');
      return ok(r.rows[0]);
    }
    const r = await query<SellMultiplierRow>(
      `INSERT INTO "StationSellMultiplier"
        (station_id, label, money_multiplier, blessing_penalty_multiplier,
         req_item_ids, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, station_id, label,
                 money_multiplier::float8 AS money_multiplier,
                 blessing_penalty_multiplier::float8 AS blessing_penalty_multiplier,
                 req_item_ids, sort_order, is_active`,
      [data.station_id, data.label, data.money_multiplier, data.blessing_penalty_multiplier,
       data.req_item_ids, data.sort_order, data.is_active],
    );
    revalidatePath('/captain');
    revalidatePath('/captain/multipliers');
    return ok(r.rows[0]);
  } catch (err) {
    return fail(err);
  }
}

export async function deleteStationSellMultiplier(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireRole('captain');
    if (!z.uuid().safeParse(id).success) throw new ActionError('INVALID_INPUT', '');
    // 驗倍率屬於 captain 管轄站
    const own = await query<{ station_id: string }>(
      `SELECT m.station_id FROM "StationSellMultiplier" m
       JOIN "Station" s ON s.id = m.station_id
       WHERE m.id = $1 AND $2 = ANY(s.captain_user_ids)`,
      [id, session.userId],
    );
    if (own.rows.length === 0) throw new ActionError('FORBIDDEN', '無權刪除此倍率');
    await query(`DELETE FROM "StationSellMultiplier" WHERE id = $1`, [id]);
    revalidatePath('/captain');
    revalidatePath('/captain/multipliers');
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// 股票加乘賣出 — 玩家持股查看 + 關主代售
// ─────────────────────────────────────────────────────────────
export interface CaptainPlayerHolding {
  stock_id: string;
  code: string;
  name: string;
  shares: number;
  avg_cost: number;
  current_price: number;
  is_sellable: boolean;
}

export async function listPlayerHoldingsForCaptain(
  stationId: string,
  targetUserId: string,
): Promise<ActionResult<CaptainPlayerHolding[]>> {
  try {
    const session = await requireRole('captain');
    const stCheck = await assertCaptainOfStation(null, session.userId, stationId);
    if (!stCheck.allow_stock_sell_multiplier) {
      throw new ActionError('FORBIDDEN', '此關卡未開放股票加乘賣出');
    }
    const r = await query<CaptainPlayerHolding>(
      `SELECT sh.stock_id, st.code, st.name,
              sh.shares, sh.avg_cost, st.current_price, st.is_sellable
       FROM "StockHolding" sh
       JOIN "Stock" st ON st.id = sh.stock_id
       WHERE sh.user_id = $1 AND sh.shares > 0
       ORDER BY st.code ASC`,
      [targetUserId],
    );
    return ok(r.rows);
  } catch (err) {
    return fail(err);
  }
}

const captainSellSchema = z.object({
  stationId: z.uuid(),
  targetUserId: z.string().min(1),
  stockId: z.uuid(),
  shares: z.number().int().positive().max(1_000_000),
  multiplierId: z.uuid(),
});

export async function captainSellStockWithMultiplier(
  payload: z.infer<typeof captainSellSchema>,
): Promise<ActionResult<{
  shares_sold: number;
  proceeds: number;
  bonus: number;
  total_money_gain: number;
  profit: number;
  blessing_penalty: number;
  remaining_shares: number;
}>> {
  try {
    const session = await requireRole('captain');
    const data = captainSellSchema.parse(payload);

    const result = await withTx(async (client) => {
      await assertNotDuringFinalScoring(client);
      await assertNotTourMode(client);

      // 驗 captain 是該 station 的關主、station 旗標開啟
      const stR = await client.query<{ allow_stock_sell_multiplier: boolean; captain_user_ids: string[]; name: string }>(
        `SELECT allow_stock_sell_multiplier, captain_user_ids, name
         FROM "Station" WHERE id = $1 AND is_active = true`,
        [data.stationId],
      );
      const station = stR.rows[0];
      if (!station) throw new ActionError('NOT_FOUND', '關卡不存在');
      if (!station.captain_user_ids.includes(session.userId)) {
        throw new ActionError('FORBIDDEN', '你不是此關卡的關主');
      }
      if (!station.allow_stock_sell_multiplier) {
        throw new ActionError('FORBIDDEN', '此關卡未開放股票加乘賣出');
      }

      // 驗 multiplier 屬於該 station 且啟用
      const mR = await client.query<{
        label: string;
        money_multiplier: number;
        blessing_penalty_multiplier: number;
        req_item_ids: string[];
      }>(
        `SELECT label,
                money_multiplier::float8 AS money_multiplier,
                blessing_penalty_multiplier::float8 AS blessing_penalty_multiplier,
                req_item_ids
         FROM "StationSellMultiplier"
         WHERE id = $1 AND station_id = $2 AND is_active = true`,
        [data.multiplierId, data.stationId],
      );
      const mult = mR.rows[0];
      if (!mult) throw new ActionError('NOT_FOUND', '倍率方案不存在或已停用');

      // 前置條件：玩家須持有 req_item_ids 全部道具（AND 語意）
      if (mult.req_item_ids.length > 0) {
        const haveR = await client.query<{ have_all: boolean; missing_ids: string[]; missing_names: string[] }>(
          `WITH need AS (
             SELECT unnest($2::uuid[]) AS item_id
           ),
           have AS (
             SELECT item_id FROM "PlayerItem" WHERE user_id = $1
           ),
           miss AS (
             SELECT n.item_id
             FROM need n
             LEFT JOIN have h ON h.item_id = n.item_id
             WHERE h.item_id IS NULL
           )
           SELECT (NOT EXISTS (SELECT 1 FROM miss)) AS have_all,
                  COALESCE(array_agg(miss.item_id) FILTER (WHERE miss.item_id IS NOT NULL), '{}') AS missing_ids,
                  COALESCE(array_agg(i.name) FILTER (WHERE i.id IS NOT NULL), '{}') AS missing_names
           FROM miss
           LEFT JOIN "Item" i ON i.id = miss.item_id`,
          [data.targetUserId, mult.req_item_ids],
        );
        if (!haveR.rows[0]?.have_all) {
          const names = haveR.rows[0]?.missing_names ?? [];
          throw new ActionError(
            'MISSING_REQUIRED_ITEMS',
            names.length > 0 ? `玩家缺少必要道具：${names.join('、')}` : '玩家未持有此倍率所需道具',
          );
        }
      }

      // 驗股票 + 玩家持股
      const stockR = await client.query<{ current_price: number; code: string; name: string; is_sellable: boolean }>(
        `SELECT current_price, code, name, is_sellable FROM "Stock" WHERE id = $1`,
        [data.stockId],
      );
      const stock = stockR.rows[0];
      if (!stock) throw new ActionError('NOT_FOUND', '股票不存在');
      if (!stock.is_sellable) throw new ActionError('FORBIDDEN', '此商品不可賣回');

      const psR = await client.query<{ money: number; health: number; blessing: number; shares: number; avg_cost: number }>(
        `SELECT ps.money, ps.health, ps.blessing,
                COALESCE(sh.shares, 0) AS shares,
                COALESCE(sh.avg_cost, 0) AS avg_cost
         FROM "PlayerStats" ps
         LEFT JOIN "StockHolding" sh ON sh.user_id = ps.user_id AND sh.stock_id = $2
         WHERE ps.user_id = $1
         FOR UPDATE OF ps`,
        [data.targetUserId, data.stockId],
      );
      const me = psR.rows[0];
      if (!me) throw new ActionError('NOT_FOUND', '玩家資料不存在');
      assertPlayerAlive(me);
      if (me.shares < data.shares) throw new ActionError('INVALID_INPUT', '持股不足');

      const proceeds = stock.current_price * data.shares;
      const profit = (stock.current_price - me.avg_cost) * data.shares;
      // 倍率規則（與圖表一致）：
      //   profit > 0 → bonus = profit × (moneyMult - 1)、blessing_penalty = ROUND(profit × blessingMult / 10000)
      //   profit ≤ 0 → bonus = 0、blessing_penalty = 0（賠錢不扣福分）
      const bonus = profit > 0 ? Math.round(profit * (mult.money_multiplier - 1)) : 0;
      const totalMoneyGain = proceeds + bonus;
      const blessingPenalty = profit > 0
        ? Math.round((profit * mult.blessing_penalty_multiplier) / 10000)
        : 0;

      const newR = await client.query<{ money: number; blessing: number }>(
        `UPDATE "PlayerStats"
         SET money = money + $2,
             blessing = GREATEST(0, blessing - $3),
             updated_at = now()
         WHERE user_id = $1
         RETURNING money, blessing`,
        [data.targetUserId, totalMoneyGain, blessingPenalty],
      );

      const remaining = me.shares - data.shares;
      if (remaining === 0) {
        await client.query(
          `DELETE FROM "StockHolding" WHERE user_id = $1 AND stock_id = $2`,
          [data.targetUserId, data.stockId],
        );
      } else {
        await client.query(
          `UPDATE "StockHolding" SET shares = $3, updated_at = now()
           WHERE user_id = $1 AND stock_id = $2`,
          [data.targetUserId, data.stockId, remaining],
        );
      }

      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $2, 'captain_stock_sell_mult', $3)`,
        [data.targetUserId, session.userId, JSON.stringify({
          station_id: data.stationId,
          station_name: station.name,
          stock_id: data.stockId,
          stock_code: stock.code,
          stock_name: stock.name,
          shares: data.shares,
          price: stock.current_price,
          proceeds,
          profit,
          bonus,
          total_money_gain: totalMoneyGain,
          blessing_penalty: blessingPenalty,
          multiplier_id: data.multiplierId,
          multiplier_label: mult.label,
          money_multiplier: mult.money_multiplier,
          blessing_penalty_multiplier: mult.blessing_penalty_multiplier,
        })],
      );

      return {
        shares_sold: data.shares,
        proceeds,
        bonus,
        total_money_gain: totalMoneyGain,
        profit,
        blessing_penalty: blessingPenalty,
        remaining_shares: remaining,
        new_money: newR.rows[0].money,
      };
    });

    revalidatePath('/captain/scan');
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

void getSetting; // 預留：之後 cooldown 等需要時可用
