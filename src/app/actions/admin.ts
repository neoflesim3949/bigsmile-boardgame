'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { ActionError, fail, ok, type ActionResult } from '@/lib/error';
import { query, withTx } from '@/lib/db';
import { requireRole, type Role } from '@/lib/auth';
import { signQrToken } from '@/lib/qr';
import {
  type AppSettingsKey,
  DEFAULT_SETTINGS,
  setSetting,
} from '@/lib/settings';

// ─────────────────────────────────────────────────────────────
// 系統參數設定（批次更新）
// ─────────────────────────────────────────────────────────────

export type SettingsPayload = Partial<Record<AppSettingsKey, string>>;

export async function updateAppSettings(
  payload: SettingsPayload,
): Promise<ActionResult<{ updated: number }>> {
  try {
    const session = await requireRole('admin');
    const entries = Object.entries(payload).filter(([k]) => k in DEFAULT_SETTINGS) as Array<
      [AppSettingsKey, string]
    >;
    if (entries.length === 0) throw new ActionError('INVALID_INPUT', '沒有可更新的設定');

    for (const [k, v] of entries) {
      await setSetting(k, String(v ?? ''), session.userId);
    }
    revalidatePath('/admin/settings');
    return ok({ updated: entries.length });
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// 命格範本 CRUD
// ─────────────────────────────────────────────────────────────
const themeEnum = z.enum(['amber', 'teal', 'purple', 'rose', 'sky', 'zinc']);

const templateSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().min(1).max(40),
  emoji: z.string().min(1).max(8),
  description: z.string().max(120),
  theme: themeEnum,
  rarity_label: z.string().max(20),
  money: z.number().int(),
  health: z.number().int().min(0).max(100),
  blessing: z.number().int(),
  karma: z.number().int(),
  is_active: z.boolean(),
});
export type TemplatePayload = z.infer<typeof templateSchema>;

export interface TemplateRow extends TemplatePayload {
  id: string;
}

export async function listTemplates(): Promise<ActionResult<TemplateRow[]>> {
  try {
    await requireRole('admin');
    const r = await query<TemplateRow>(
      `SELECT id, label, emoji, description, theme, rarity_label,
              money, health, blessing, karma, is_active
       FROM "InitialValueTemplate"
       ORDER BY created_at ASC`,
    );
    return ok(r.rows);
  } catch (err) {
    return fail(err);
  }
}

export async function upsertTemplate(payload: TemplatePayload): Promise<ActionResult<TemplateRow>> {
  try {
    await requireRole('admin');
    const data = templateSchema.parse(payload);
    if (data.id) {
      const r = await query<TemplateRow>(
        `UPDATE "InitialValueTemplate"
         SET label=$1, emoji=$2, description=$3, theme=$4, rarity_label=$5,
             money=$6, health=$7, blessing=$8, karma=$9, is_active=$10
         WHERE id=$11
         RETURNING id, label, emoji, description, theme, rarity_label,
                   money, health, blessing, karma, is_active`,
        [data.label, data.emoji, data.description, data.theme, data.rarity_label,
         data.money, data.health, data.blessing, data.karma, data.is_active, data.id],
      );
      if (r.rows.length === 0) throw new ActionError('NOT_FOUND', '範本不存在');
      revalidatePath('/admin/settings');
      return ok(r.rows[0]);
    }
    const r = await query<TemplateRow>(
      `INSERT INTO "InitialValueTemplate"
         (label, emoji, description, theme, rarity_label, money, health, blessing, karma, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, label, emoji, description, theme, rarity_label,
                 money, health, blessing, karma, is_active`,
      [data.label, data.emoji, data.description, data.theme, data.rarity_label,
       data.money, data.health, data.blessing, data.karma, data.is_active],
    );
    revalidatePath('/admin/settings');
    return ok(r.rows[0]);
  } catch (err) {
    return fail(err);
  }
}

export async function deleteTemplate(id: string): Promise<ActionResult<null>> {
  try {
    await requireRole('admin');
    if (!z.uuid().safeParse(id).success) throw new ActionError('INVALID_INPUT', '');
    await query(`DELETE FROM "InitialValueTemplate" WHERE id = $1`, [id]);
    revalidatePath('/admin/settings');
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// Danger Zone（危險操作 — 三次確認在前端，後端必驗 admin）
// ─────────────────────────────────────────────────────────────

export type DangerOp =
  | 'reset_player_data'
  | 'delete_all_players'
  | 'reset_stock_history'
  | 'delete_all_stocks'
  | 'reset_usage_count';

export async function performDangerOp(op: DangerOp): Promise<ActionResult<{ op: DangerOp }>> {
  try {
    const session = await requireRole('admin');

    await withTx(async (client) => {
      switch (op) {
        case 'reset_player_data': {
          // 清空玩家數值、命格、持股、借貸、道具，但保留 Account
          await client.query(
            `UPDATE "PlayerStats"
             SET destiny_name = NULL, money = 0, health = 0, blessing = 0, karma = 0,
                 rebirth_count = 0, bank_loan = 0, loan_updated_at = NULL,
                 last_manual_refresh_at = NULL, updated_at = now()`,
          );
          await client.query(`DELETE FROM "StockHolding"`);
          await client.query(`DELETE FROM "PlayerLoan"`);
          await client.query(`DELETE FROM "PlayerItem"`);
          break;
        }
        case 'delete_all_players': {
          await client.query(`DELETE FROM "Account" WHERE role = 'player'`);
          // CASCADE 會帶走 PlayerStats / Holding / Loan / Item / Transaction
          break;
        }
        case 'reset_stock_history': {
          await client.query(`DELETE FROM "StockHistory"`);
          // current_price 不動，曲線從現在重畫
          break;
        }
        case 'delete_all_stocks': {
          await client.query(`DELETE FROM "Stock"`);
          // CASCADE 帶走 StockHistory / StockHolding
          break;
        }
        case 'reset_usage_count': {
          await client.query(`UPDATE "Station" SET global_use_count = 0`);
          await client.query(`UPDATE "QuickAction" SET global_use_count = 0`);
          await client.query(`DELETE FROM "StationUsage"`);
          await client.query(`DELETE FROM "QuickActionUsage"`);
          break;
        }
        default:
          throw new ActionError('INVALID_INPUT', '未知的操作');
      }
      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $1, 'danger_zone_reset', $2)`,
        [session.userId, JSON.stringify({ op })],
      );
    });

    revalidatePath('/admin/settings');
    revalidatePath('/admin');
    return ok({ op });
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// 帳號 CRUD
// ─────────────────────────────────────────────────────────────
const roleEnum = z.enum(['admin', 'player', 'captain']);

const accountCreateSchema = z.object({
  user_id: z.string().min(3).max(64),
  name: z.string().min(1).max(60),
  login_id: z.string().min(3).max(64),
  password: z.string().min(8).max(128),
  role: roleEnum,
});

const accountUpdateSchema = z.object({
  user_id: z.string().min(3).max(64),
  name: z.string().min(1).max(60).optional(),
  login_id: z.string().min(3).max(64).optional(),
  password: z.string().min(8).max(128).optional(),
  role: roleEnum.optional(),
  is_active: z.boolean().optional(),
});

export interface AccountRow {
  user_id: string;
  name: string;
  login_id: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface AccountListFilter {
  role?: Role;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listAccounts(
  filter: AccountListFilter = {},
): Promise<ActionResult<{ rows: AccountRow[]; total: number }>> {
  try {
    await requireRole('admin');
    const limit = Math.min(filter.limit ?? 100, 500);
    const offset = Math.max(filter.offset ?? 0, 0);
    const search = filter.search?.trim() ?? '';

    const params: unknown[] = [];
    const where: string[] = [];
    if (filter.role) {
      params.push(filter.role);
      where.push(`role = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(name ILIKE $${params.length} OR login_id ILIKE $${params.length} OR user_id ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rowsR = await query<AccountRow>(
      `SELECT user_id, name, login_id, role, is_active, created_at
       FROM "Account"
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    const totalR = await query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM "Account" ${whereSql}`,
      params,
    );
    return ok({ rows: rowsR.rows, total: Number(totalR.rows[0]?.c ?? 0) });
  } catch (err) {
    return fail(err);
  }
}

export async function createAccount(payload: z.infer<typeof accountCreateSchema>): Promise<ActionResult<AccountRow>> {
  try {
    const session = await requireRole('admin');
    const data = accountCreateSchema.parse(payload);
    const hash = await bcrypt.hash(data.password, 12);
    const result = await withTx(async (client) => {
      const dup = await client.query(
        `SELECT 1 FROM "Account" WHERE user_id = $1 OR login_id = $2`,
        [data.user_id, data.login_id],
      );
      if (dup.rows.length > 0) throw new ActionError('CONFLICT', 'user_id 或 login_id 已被使用');
      const r = await client.query<AccountRow>(
        `INSERT INTO "Account" (user_id, name, login_id, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING user_id, name, login_id, role, is_active, created_at`,
        [data.user_id, data.name, data.login_id, hash, data.role],
      );
      if (data.role === 'player') {
        await client.query(
          `INSERT INTO "PlayerStats" (user_id) VALUES ($1)
           ON CONFLICT (user_id) DO NOTHING`,
          [data.user_id],
        );
      }
      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $2, 'account_update', $3)`,
        [data.user_id, session.userId, JSON.stringify({ op: 'create', role: data.role })],
      );
      return r.rows[0];
    });
    revalidatePath('/admin/accounts');
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

export async function updateAccount(payload: z.infer<typeof accountUpdateSchema>): Promise<ActionResult<AccountRow>> {
  try {
    const session = await requireRole('admin');
    const data = accountUpdateSchema.parse(payload);

    const sets: string[] = [];
    const params: unknown[] = [];
    if (data.name !== undefined) {
      params.push(data.name);
      sets.push(`name = $${params.length}`);
    }
    if (data.login_id !== undefined) {
      params.push(data.login_id);
      sets.push(`login_id = $${params.length}`);
    }
    if (data.role !== undefined) {
      params.push(data.role);
      sets.push(`role = $${params.length}`);
    }
    if (data.is_active !== undefined) {
      params.push(data.is_active);
      sets.push(`is_active = $${params.length}`);
    }
    if (data.password !== undefined) {
      const hash = await bcrypt.hash(data.password, 12);
      params.push(hash);
      sets.push(`password_hash = $${params.length}`);
    }
    if (sets.length === 0) throw new ActionError('INVALID_INPUT', '沒有要更新的欄位');

    params.push(data.user_id);
    const r = await query<AccountRow>(
      `UPDATE "Account" SET ${sets.join(', ')}
       WHERE user_id = $${params.length}
       RETURNING user_id, name, login_id, role, is_active, created_at`,
      params,
    );
    if (r.rows.length === 0) throw new ActionError('NOT_FOUND', '帳號不存在');

    // 切換為 player 時補 PlayerStats row
    if (data.role === 'player') {
      await query(
        `INSERT INTO "PlayerStats" (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [data.user_id],
      );
    }

    await query(
      `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
       VALUES ($1, $2, 'account_update', $3)`,
      [data.user_id, session.userId, JSON.stringify({ op: 'update', fields: Object.keys(data).filter((k) => k !== 'user_id') })],
    );
    revalidatePath('/admin/accounts');
    return ok(r.rows[0]);
  } catch (err) {
    return fail(err);
  }
}

export async function deleteAccount(userId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireRole('admin');
    if (userId === session.userId) throw new ActionError('FORBIDDEN', '不能刪除自己的帳號');
    const r = await query(`DELETE FROM "Account" WHERE user_id = $1`, [userId]);
    if (r.rowCount === 0) throw new ActionError('NOT_FOUND', '帳號不存在');
    revalidatePath('/admin/accounts');
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// Station CRUD
// ─────────────────────────────────────────────────────────────
const stationSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().min(1).max(60),
  description: z.string().max(400),
  captain_user_ids: z.array(z.string()),
  allow_rebirth: z.boolean(),
  player_max_uses: z.number().int().positive().nullable(),
  global_max_uses: z.number().int().positive().nullable(),
  is_active: z.boolean(),
});

export type StationPayload = z.infer<typeof stationSchema>;

export interface StationRow {
  id: string;
  name: string;
  description: string;
  captain_user_ids: string[];
  allow_rebirth: boolean;
  player_max_uses: number | null;
  global_max_uses: number | null;
  global_use_count: number;
  is_active: boolean;
  created_at: string;
}

export async function listStations(): Promise<ActionResult<StationRow[]>> {
  try {
    await requireRole('admin');
    const r = await query<StationRow>(
      `SELECT id, name, description, captain_user_ids, allow_rebirth,
              player_max_uses, global_max_uses, global_use_count, is_active, created_at
       FROM "Station" ORDER BY created_at ASC`,
    );
    return ok(r.rows);
  } catch (err) {
    return fail(err);
  }
}

export async function upsertStation(payload: StationPayload): Promise<ActionResult<StationRow>> {
  try {
    await requireRole('admin');
    const data = stationSchema.parse(payload);
    if (data.id) {
      const r = await query<StationRow>(
        `UPDATE "Station"
         SET name=$1, description=$2, captain_user_ids=$3, allow_rebirth=$4,
             player_max_uses=$5, global_max_uses=$6, is_active=$7
         WHERE id=$8
         RETURNING id, name, description, captain_user_ids, allow_rebirth,
                   player_max_uses, global_max_uses, global_use_count, is_active, created_at`,
        [
          data.name, data.description, data.captain_user_ids, data.allow_rebirth,
          data.player_max_uses, data.global_max_uses, data.is_active, data.id,
        ],
      );
      if (r.rows.length === 0) throw new ActionError('NOT_FOUND', '關卡不存在');
      revalidatePath('/admin/stations');
      return ok(r.rows[0]);
    }
    const r = await query<StationRow>(
      `INSERT INTO "Station" (name, description, captain_user_ids, allow_rebirth,
                              player_max_uses, global_max_uses, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, description, captain_user_ids, allow_rebirth,
                 player_max_uses, global_max_uses, global_use_count, is_active, created_at`,
      [
        data.name, data.description, data.captain_user_ids, data.allow_rebirth,
        data.player_max_uses, data.global_max_uses, data.is_active,
      ],
    );
    revalidatePath('/admin/stations');
    return ok(r.rows[0]);
  } catch (err) {
    return fail(err);
  }
}

export async function deleteStation(id: string): Promise<ActionResult<null>> {
  try {
    await requireRole('admin');
    if (!z.uuid().safeParse(id).success) throw new ActionError('INVALID_INPUT', '');
    await query(`DELETE FROM "Station" WHERE id = $1`, [id]);
    revalidatePath('/admin/stations');
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}

// 取得所有 captain 角色帳號（供 Station 編輯時挑選關主）
export async function listCaptains(): Promise<ActionResult<{ user_id: string; name: string }[]>> {
  try {
    await requireRole('admin');
    const r = await query<{ user_id: string; name: string }>(
      `SELECT user_id, name FROM "Account" WHERE role = 'captain' AND is_active = true
       ORDER BY name ASC`,
    );
    return ok(r.rows);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// Item CRUD
// ─────────────────────────────────────────────────────────────
const itemSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().min(1).max(60),
  icon: z.string().max(20),
  description: z.string().max(200),
  is_active: z.boolean(),
});

export type ItemPayload = z.infer<typeof itemSchema>;

export interface ItemRow {
  id: string;
  name: string;
  icon: string;
  description: string;
  is_active: boolean;
}

export async function listItems(): Promise<ActionResult<ItemRow[]>> {
  try {
    await requireRole('admin');
    const r = await query<ItemRow>(
      `SELECT id, name, icon, description, is_active FROM "Item" ORDER BY created_at ASC`,
    );
    return ok(r.rows);
  } catch (err) {
    return fail(err);
  }
}

export async function upsertItem(payload: ItemPayload): Promise<ActionResult<ItemRow>> {
  try {
    await requireRole('admin');
    const data = itemSchema.parse(payload);
    if (data.id) {
      const r = await query<ItemRow>(
        `UPDATE "Item" SET name=$1, icon=$2, description=$3, is_active=$4 WHERE id=$5
         RETURNING id, name, icon, description, is_active`,
        [data.name, data.icon, data.description, data.is_active, data.id],
      );
      if (r.rows.length === 0) throw new ActionError('NOT_FOUND', '道具不存在');
      revalidatePath('/admin/items');
      return ok(r.rows[0]);
    }
    const r = await query<ItemRow>(
      `INSERT INTO "Item" (name, icon, description, is_active) VALUES ($1, $2, $3, $4)
       RETURNING id, name, icon, description, is_active`,
      [data.name, data.icon, data.description, data.is_active],
    );
    revalidatePath('/admin/items');
    return ok(r.rows[0]);
  } catch (err) {
    return fail(err);
  }
}

export async function deleteItem(id: string): Promise<ActionResult<null>> {
  try {
    await requireRole('admin');
    if (!z.uuid().safeParse(id).success) throw new ActionError('INVALID_INPUT', '');
    await query(`DELETE FROM "Item" WHERE id = $1`, [id]);
    revalidatePath('/admin/items');
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// Stock CRUD
// ─────────────────────────────────────────────────────────────
const stockSchema = z.object({
  id: z.uuid().optional(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(60),
  current_price: z.number().int().min(0),
  is_visible: z.boolean(),
  is_sellable: z.boolean(),
});

export type StockPayload = z.infer<typeof stockSchema>;

export interface StockRow {
  id: string;
  code: string;
  name: string;
  current_price: number;
  is_visible: boolean;
  is_sellable: boolean;
}

export async function listStocks(): Promise<ActionResult<StockRow[]>> {
  try {
    await requireRole('admin');
    const r = await query<StockRow>(
      `SELECT id, code, name, current_price, is_visible, is_sellable
       FROM "Stock" ORDER BY code ASC`,
    );
    return ok(r.rows);
  } catch (err) {
    return fail(err);
  }
}

export async function upsertStock(payload: StockPayload): Promise<ActionResult<StockRow>> {
  try {
    await requireRole('admin');
    const data = stockSchema.parse(payload);

    // ≤ 10 檔限制
    const cnt = await query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM "Stock"`);
    if (!data.id && Number(cnt.rows[0]?.c ?? 0) >= 10) {
      throw new ActionError('CONFLICT', '股票上限 10 檔，請先停用或刪除舊商品');
    }

    if (data.id) {
      const r = await withTx(async (client) => {
        const before = await client.query<{ current_price: number }>(
          `SELECT current_price FROM "Stock" WHERE id=$1`, [data.id],
        );
        const oldPrice = before.rows[0]?.current_price;
        const upd = await client.query<StockRow>(
          `UPDATE "Stock" SET code=$1, name=$2, current_price=$3, is_visible=$4, is_sellable=$5
           WHERE id=$6
           RETURNING id, code, name, current_price, is_visible, is_sellable`,
          [data.code, data.name, data.current_price, data.is_visible, data.is_sellable, data.id],
        );
        if (upd.rows.length === 0) throw new ActionError('NOT_FOUND', '股票不存在');
        // 價格變動時寫入歷史
        if (oldPrice !== undefined && oldPrice !== data.current_price) {
          await client.query(
            `INSERT INTO "StockHistory" (stock_id, price) VALUES ($1, $2)`,
            [data.id, data.current_price],
          );
        }
        return upd.rows[0];
      });
      revalidatePath('/admin/stocks');
      return ok(r);
    }

    const r = await withTx(async (client) => {
      const ins = await client.query<StockRow>(
        `INSERT INTO "Stock" (code, name, current_price, is_visible, is_sellable)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, code, name, current_price, is_visible, is_sellable`,
        [data.code, data.name, data.current_price, data.is_visible, data.is_sellable],
      );
      const stock = ins.rows[0];
      await client.query(
        `INSERT INTO "StockHistory" (stock_id, price) VALUES ($1, $2)`,
        [stock.id, stock.current_price],
      );
      return stock;
    });
    revalidatePath('/admin/stocks');
    return ok(r);
  } catch (err) {
    return fail(err);
  }
}

export async function deleteStock(id: string): Promise<ActionResult<null>> {
  try {
    await requireRole('admin');
    if (!z.uuid().safeParse(id).success) throw new ActionError('INVALID_INPUT', '');
    await query(`DELETE FROM "Stock" WHERE id = $1`, [id]);
    revalidatePath('/admin/stocks');
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// 股市回合腳本（StockRoundScript / StockRoundEvent）
// ─────────────────────────────────────────────────────────────
export type ScriptChangeType = 'percent' | 'fixed';

export interface StockScriptCell {
  round: number;
  stock_id: string;
  change_type: ScriptChangeType;
  change_value: number;
}

export interface StockRoundScriptsView {
  rounds: number[];
  events: Record<number, string>;
  cells: Record<string, StockScriptCell>; // key: `${round}_${stock_id}`
}

export async function listStockScripts(): Promise<ActionResult<StockRoundScriptsView>> {
  try {
    await requireRole('admin');
    const cellsR = await query<StockScriptCell>(
      `SELECT round, stock_id, change_type, change_value
       FROM "StockRoundScript" ORDER BY round ASC`,
    );
    const eventsR = await query<{ round: number; event_text: string }>(
      `SELECT round, event_text FROM "StockRoundEvent" ORDER BY round ASC`,
    );
    const cells: Record<string, StockScriptCell> = {};
    const roundSet = new Set<number>();
    for (const c of cellsR.rows) {
      cells[`${c.round}_${c.stock_id}`] = c;
      roundSet.add(c.round);
    }
    const events: Record<number, string> = {};
    for (const e of eventsR.rows) {
      events[e.round] = e.event_text;
      roundSet.add(e.round);
    }
    return ok({
      rounds: [...roundSet].sort((a, b) => a - b),
      events,
      cells,
    });
  } catch (err) {
    return fail(err);
  }
}

const scriptCellSchema = z.object({
  round: z.number().int().positive(),
  stock_id: z.uuid(),
  change_type: z.enum(['percent', 'fixed']),
  change_value: z.number().int(),
});

export async function upsertStockScriptCell(
  p: z.infer<typeof scriptCellSchema>,
): Promise<ActionResult<StockScriptCell>> {
  try {
    await requireRole('admin');
    const data = scriptCellSchema.parse(p);
    const r = await query<StockScriptCell>(
      `INSERT INTO "StockRoundScript" (round, stock_id, change_type, change_value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (round, stock_id) DO UPDATE SET
         change_type = EXCLUDED.change_type,
         change_value = EXCLUDED.change_value,
         updated_at = now()
       RETURNING round, stock_id, change_type, change_value`,
      [data.round, data.stock_id, data.change_type, data.change_value],
    );
    revalidatePath('/admin/stocks');
    return ok(r.rows[0]);
  } catch (err) {
    return fail(err);
  }
}

export async function deleteStockScriptCell(round: number, stockId: string): Promise<ActionResult<null>> {
  try {
    await requireRole('admin');
    await query(
      `DELETE FROM "StockRoundScript" WHERE round = $1 AND stock_id = $2`,
      [round, stockId],
    );
    revalidatePath('/admin/stocks');
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}

export async function setRoundEvent(round: number, text: string): Promise<ActionResult<null>> {
  try {
    await requireRole('admin');
    if (!Number.isInteger(round) || round <= 0) throw new ActionError('INVALID_INPUT', '');
    if (text.trim() === '') {
      await query(`DELETE FROM "StockRoundEvent" WHERE round = $1`, [round]);
    } else {
      await query(
        `INSERT INTO "StockRoundEvent" (round, event_text)
         VALUES ($1, $2)
         ON CONFLICT (round) DO UPDATE SET event_text = EXCLUDED.event_text, updated_at = now()`,
        [round, text.slice(0, 200)],
      );
    }
    revalidatePath('/admin/stocks');
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}

export async function deleteWholeRoundScript(round: number): Promise<ActionResult<null>> {
  try {
    await requireRole('admin');
    await query(`DELETE FROM "StockRoundScript" WHERE round = $1`, [round]);
    await query(`DELETE FROM "StockRoundEvent" WHERE round = $1`, [round]);
    revalidatePath('/admin/stocks');
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// 換匯所方案 CRUD
// ─────────────────────────────────────────────────────────────
const exchangeOptSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().min(1).max(60),
  blessing_cost_per_unit: z.number().int().positive(),
  money_gain_per_unit: z.number().int().positive(),
  display_order: z.number().int(),
  is_active: z.boolean(),
});
export type ExchangeOptionPayload = z.infer<typeof exchangeOptSchema>;
export interface ExchangeOptionRow extends ExchangeOptionPayload { id: string }

export async function listExchangeOptions(): Promise<ActionResult<ExchangeOptionRow[]>> {
  try {
    await requireRole('admin');
    const r = await query<ExchangeOptionRow>(
      `SELECT id, label, blessing_cost_per_unit, money_gain_per_unit, display_order, is_active
       FROM "ExchangeOption" ORDER BY display_order ASC, created_at ASC`,
    );
    return ok(r.rows);
  } catch (err) {
    return fail(err);
  }
}

export async function upsertExchangeOption(p: ExchangeOptionPayload): Promise<ActionResult<ExchangeOptionRow>> {
  try {
    await requireRole('admin');
    const data = exchangeOptSchema.parse(p);
    if (data.id) {
      const r = await query<ExchangeOptionRow>(
        `UPDATE "ExchangeOption"
         SET label=$1, blessing_cost_per_unit=$2, money_gain_per_unit=$3, display_order=$4, is_active=$5
         WHERE id=$6
         RETURNING id, label, blessing_cost_per_unit, money_gain_per_unit, display_order, is_active`,
        [data.label, data.blessing_cost_per_unit, data.money_gain_per_unit, data.display_order, data.is_active, data.id],
      );
      if (r.rows.length === 0) throw new ActionError('NOT_FOUND', '');
      revalidatePath('/admin/finance');
      return ok(r.rows[0]);
    }
    const r = await query<ExchangeOptionRow>(
      `INSERT INTO "ExchangeOption" (label, blessing_cost_per_unit, money_gain_per_unit, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, label, blessing_cost_per_unit, money_gain_per_unit, display_order, is_active`,
      [data.label, data.blessing_cost_per_unit, data.money_gain_per_unit, data.display_order, data.is_active],
    );
    revalidatePath('/admin/finance');
    return ok(r.rows[0]);
  } catch (err) {
    return fail(err);
  }
}

export async function deleteExchangeOption(id: string): Promise<ActionResult<null>> {
  try {
    await requireRole('admin');
    await query(`DELETE FROM "ExchangeOption" WHERE id = $1`, [id]);
    revalidatePath('/admin/finance');
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// 銀行借貸方案 CRUD
// ─────────────────────────────────────────────────────────────
const loanOptSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().min(1).max(60),
  blessing_collateral_per_unit: z.number().int().positive(),
  money_per_unit: z.number().int().positive(),
  interest_money_per_round: z.number().int().min(0),
  interest_blessing_per_round: z.number().int().min(0),
  display_order: z.number().int(),
  is_active: z.boolean(),
});
export type BankLoanOptionPayload = z.infer<typeof loanOptSchema>;
export interface BankLoanOptionRow extends BankLoanOptionPayload { id: string }

export async function listBankLoanOptions(): Promise<ActionResult<BankLoanOptionRow[]>> {
  try {
    await requireRole('admin');
    const r = await query<BankLoanOptionRow>(
      `SELECT id, label, blessing_collateral_per_unit, money_per_unit,
              interest_money_per_round, interest_blessing_per_round, display_order, is_active
       FROM "BankLoanOption" ORDER BY display_order ASC, created_at ASC`,
    );
    return ok(r.rows);
  } catch (err) {
    return fail(err);
  }
}

export async function upsertBankLoanOption(p: BankLoanOptionPayload): Promise<ActionResult<BankLoanOptionRow>> {
  try {
    await requireRole('admin');
    const data = loanOptSchema.parse(p);
    if (data.id) {
      const r = await query<BankLoanOptionRow>(
        `UPDATE "BankLoanOption"
         SET label=$1, blessing_collateral_per_unit=$2, money_per_unit=$3,
             interest_money_per_round=$4, interest_blessing_per_round=$5,
             display_order=$6, is_active=$7
         WHERE id=$8
         RETURNING id, label, blessing_collateral_per_unit, money_per_unit,
                   interest_money_per_round, interest_blessing_per_round, display_order, is_active`,
        [data.label, data.blessing_collateral_per_unit, data.money_per_unit,
         data.interest_money_per_round, data.interest_blessing_per_round,
         data.display_order, data.is_active, data.id],
      );
      if (r.rows.length === 0) throw new ActionError('NOT_FOUND', '');
      revalidatePath('/admin/finance');
      return ok(r.rows[0]);
    }
    const r = await query<BankLoanOptionRow>(
      `INSERT INTO "BankLoanOption" (label, blessing_collateral_per_unit, money_per_unit,
                                     interest_money_per_round, interest_blessing_per_round,
                                     display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, label, blessing_collateral_per_unit, money_per_unit,
                 interest_money_per_round, interest_blessing_per_round, display_order, is_active`,
      [data.label, data.blessing_collateral_per_unit, data.money_per_unit,
       data.interest_money_per_round, data.interest_blessing_per_round,
       data.display_order, data.is_active],
    );
    revalidatePath('/admin/finance');
    return ok(r.rows[0]);
  } catch (err) {
    return fail(err);
  }
}

export async function deleteBankLoanOption(id: string): Promise<ActionResult<null>> {
  try {
    await requireRole('admin');
    await query(`DELETE FROM "BankLoanOption" WHERE id = $1`, [id]);
    revalidatePath('/admin/finance');
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// Event CRUD + Marquee
// ─────────────────────────────────────────────────────────────
const eventSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().min(1).max(60),
  text: z.string().min(1).max(200),
  start_at: z.string().nullable(),
  end_at: z.string().nullable(),
  priority: z.number().int(),
  is_active: z.boolean(),
});
export type EventPayload = z.infer<typeof eventSchema>;
export interface EventRow {
  id: string;
  title: string;
  text: string;
  start_at: string | null;
  end_at: string | null;
  priority: number;
  is_active: boolean;
}

export async function listEvents(): Promise<ActionResult<EventRow[]>> {
  try {
    await requireRole('admin');
    const r = await query<EventRow>(
      `SELECT id, title, text, start_at, end_at, priority, is_active
       FROM "Event" ORDER BY priority DESC, created_at DESC`,
    );
    return ok(r.rows);
  } catch (err) {
    return fail(err);
  }
}

export async function upsertEvent(p: EventPayload): Promise<ActionResult<EventRow>> {
  try {
    await requireRole('admin');
    const data = eventSchema.parse(p);
    const startAt = data.start_at ? new Date(data.start_at) : null;
    const endAt = data.end_at ? new Date(data.end_at) : null;
    if (data.id) {
      const r = await query<EventRow>(
        `UPDATE "Event" SET title=$1, text=$2, start_at=$3, end_at=$4, priority=$5, is_active=$6
         WHERE id=$7
         RETURNING id, title, text, start_at, end_at, priority, is_active`,
        [data.title, data.text, startAt, endAt, data.priority, data.is_active, data.id],
      );
      if (r.rows.length === 0) throw new ActionError('NOT_FOUND', '');
      revalidatePath('/admin/events');
      return ok(r.rows[0]);
    }
    const r = await query<EventRow>(
      `INSERT INTO "Event" (title, text, start_at, end_at, priority, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, text, start_at, end_at, priority, is_active`,
      [data.title, data.text, startAt, endAt, data.priority, data.is_active],
    );
    revalidatePath('/admin/events');
    return ok(r.rows[0]);
  } catch (err) {
    return fail(err);
  }
}

export async function deleteEvent(id: string): Promise<ActionResult<null>> {
  try {
    await requireRole('admin');
    await query(`DELETE FROM "Event" WHERE id = $1`, [id]);
    revalidatePath('/admin/events');
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}

// 跑馬燈：寫入 BoardConfig.marquee_text + marquee_until
export async function publishMarquee(text: string, ttlMinutes: number): Promise<ActionResult<null>> {
  try {
    await requireRole('admin');
    const cap = await query<{ value: string }>(`SELECT value FROM "AppSettings" WHERE key='BoardMarqueeMaxMinutes'`);
    const maxMins = Number(cap.rows[0]?.value ?? 120);
    const useMins = Math.max(1, Math.min(ttlMinutes, maxMins));
    await query(
      `UPDATE "BoardConfig"
       SET marquee_text = $1,
           marquee_until = now() + make_interval(mins => $2),
           updated_at = now()
       WHERE id = 1`,
      [text.slice(0, 200), useMins],
    );
    revalidatePath('/admin/events');
    revalidatePath('/admin/events');
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}

export async function clearMarquee(): Promise<ActionResult<null>> {
  try {
    await requireRole('admin');
    await query(
      `UPDATE "BoardConfig" SET marquee_text='', marquee_until=NULL, updated_at=now() WHERE id=1`,
    );
    revalidatePath('/admin/events');
    revalidatePath('/admin/events');
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// BoardConfig
// ─────────────────────────────────────────────────────────────
export interface BoardConfigRow {
  id: number;
  title: string;
  featured_stock_ids: string[];
  color_scheme: 'red_up' | 'green_up';
  event_rotate_seconds: number;
  marquee_text: string;
  marquee_until: string | null;
  final_scoring_triggered_at: string | null;
  current_round: number;
  last_tick_at: string | null;
}

export async function getBoardConfig(): Promise<ActionResult<BoardConfigRow>> {
  try {
    await requireRole('admin');
    const r = await query<BoardConfigRow>(
      `SELECT id, title, featured_stock_ids, color_scheme, event_rotate_seconds,
              marquee_text, marquee_until, final_scoring_triggered_at, current_round, last_tick_at
       FROM "BoardConfig" WHERE id = 1`,
    );
    if (r.rows.length === 0) {
      await query(`INSERT INTO "BoardConfig" (id, title) VALUES (1, '開運大富翁 ── 大廳')`);
      return getBoardConfig();
    }
    return ok(r.rows[0]);
  } catch (err) {
    return fail(err);
  }
}

const boardConfigSchema = z.object({
  title: z.string().min(1).max(60),
  featured_stock_ids: z.array(z.uuid()).max(4),
  color_scheme: z.enum(['red_up', 'green_up']),
  event_rotate_seconds: z.number().int().min(1).max(60),
});

export async function updateBoardConfig(p: z.infer<typeof boardConfigSchema>): Promise<ActionResult<BoardConfigRow>> {
  try {
    await requireRole('admin');
    const data = boardConfigSchema.parse(p);
    const r = await query<BoardConfigRow>(
      `UPDATE "BoardConfig"
       SET title=$1, featured_stock_ids=$2, color_scheme=$3, event_rotate_seconds=$4, updated_at=now()
       WHERE id = 1
       RETURNING id, title, featured_stock_ids, color_scheme, event_rotate_seconds,
                 marquee_text, marquee_until, final_scoring_triggered_at, current_round, last_tick_at`,
      [data.title, data.featured_stock_ids, data.color_scheme, data.event_rotate_seconds],
    );
    revalidatePath('/admin/events');
    return ok(r.rows[0]);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// Display token
// ─────────────────────────────────────────────────────────────

export async function issueDisplayToken(label: string, ttlDays: number): Promise<ActionResult<{ token: string; jti: string; expires_at: string }>> {
  try {
    const session = await requireRole('admin');
    const days = Math.max(1, Math.min(ttlDays, 30));
    const ttlSeconds = days * 86400;
    const jti = randomUUID();
    const token = signQrToken(jti, 'display', ttlSeconds);
    const r = await query<{ expires_at: string }>(
      `INSERT INTO "DisplayToken" (jti, label, expires_at, created_by)
       VALUES ($1, $2, now() + make_interval(secs => $3), $4)
       RETURNING expires_at`,
      [jti, label.slice(0, 100), ttlSeconds, session.userId],
    );
    revalidatePath('/admin/events');
    return ok({ token, jti, expires_at: r.rows[0].expires_at });
  } catch (err) {
    return fail(err);
  }
}

export async function revokeDisplayToken(jti: string): Promise<ActionResult<null>> {
  try {
    await requireRole('admin');
    await query(
      `UPDATE "DisplayToken" SET revoked_at = now() WHERE jti = $1 AND revoked_at IS NULL`,
      [jti],
    );
    revalidatePath('/admin/events');
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}

export interface DisplayTokenRow {
  jti: string;
  label: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export async function listDisplayTokens(): Promise<ActionResult<DisplayTokenRow[]>> {
  try {
    await requireRole('admin');
    const r = await query<DisplayTokenRow>(
      `SELECT jti, label, expires_at, revoked_at, created_at
       FROM "DisplayToken" ORDER BY created_at DESC LIMIT 50`,
    );
    return ok(r.rows);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// Dashboard 統計 + 排行榜
// ─────────────────────────────────────────────────────────────
export interface AdminDashboardData {
  counts: {
    players: number;
    captains: number;
    stations: number;
    items: number;
    stocks: number;
  };
  board: BoardConfigRow;
  flags: {
    tour_mode: boolean;
    card_draw_mode: boolean;
    game_enabled: boolean;
    game_started_at: string | null;
    show_all_stats: boolean;
    exchange_rate_multiplier: number;
  };
  scoring: {
    enabled: boolean;
    triggered_at: string | null;
  };
  leaderboard: Array<{
    user_id: string;
    name: string;
    money: number;
    blessing: number;
    health: number;
    karma: number;
    rebirth_count: number;
    final_score: number;
  }>;
}

export async function getAdminDashboard(): Promise<ActionResult<AdminDashboardData>> {
  try {
    await requireRole('admin');

    // 確保 BoardConfig 單列存在
    await query(
      `INSERT INTO "BoardConfig" (id, title) VALUES (1, '開運大富翁 ── 大廳')
       ON CONFLICT (id) DO NOTHING`,
    );

    const counts = await query<{ players: string; captains: string; stations: string; items: string; stocks: string }>(
      `SELECT
         (SELECT COUNT(*) FROM "Account" WHERE role='player')::text AS players,
         (SELECT COUNT(*) FROM "Account" WHERE role='captain')::text AS captains,
         (SELECT COUNT(*) FROM "Station")::text AS stations,
         (SELECT COUNT(*) FROM "Item")::text AS items,
         (SELECT COUNT(*) FROM "Stock")::text AS stocks`,
    );
    const board = await query<BoardConfigRow>(
      `SELECT id, title, featured_stock_ids, color_scheme, event_rotate_seconds,
              marquee_text, marquee_until, final_scoring_triggered_at, current_round, last_tick_at
       FROM "BoardConfig" WHERE id = 1`,
    );
    const settings = await query<{ key: string; value: string }>(
      `SELECT key, value FROM "AppSettings"
       WHERE key IN (
         'ScoreWeightMoney', 'ScoreWeightBlessing', 'ScoreWeightKarma',
         'TourMode', 'CardDrawMode', 'BoardGameEnabled', 'BoardGameStartedAt',
         'ShowAllStats', 'ExchangeRateMultiplier'
       )`,
    );
    const sm = new Map(settings.rows.map((r) => [r.key, r.value] as const));
    const wM = Number(sm.get('ScoreWeightMoney') ?? '0.05') || 0;
    const wB = Number(sm.get('ScoreWeightBlessing') ?? '200') || 0;
    const wK = Number(sm.get('ScoreWeightKarma') ?? '150') || 0;

    // 排行榜：純 SELECT 後在 JS 端計分（避免 PG 操作元類型推導問題）
    const lbRaw = await query<{
      user_id: string; name: string;
      money: number; blessing: number; health: number; karma: number;
      rebirth_count: number;
    }>(
      `SELECT a.user_id, a.name, ps.money, ps.blessing, ps.health, ps.karma, ps.rebirth_count
       FROM "Account" a
       JOIN "PlayerStats" ps ON ps.user_id = a.user_id
       WHERE a.role = 'player' AND a.is_active = true
       LIMIT 200`,
    );
    const leaderboard = lbRaw.rows
      .map((r) => ({
        ...r,
        final_score: Math.round(r.money * wM + r.blessing * wB - r.karma * wK),
      }))
      .sort((a, b) => b.final_score - a.final_score)
      .slice(0, 50);

    const dash: AdminDashboardData = {
      counts: {
        players: Number(counts.rows[0].players),
        captains: Number(counts.rows[0].captains),
        stations: Number(counts.rows[0].stations),
        items: Number(counts.rows[0].items),
        stocks: Number(counts.rows[0].stocks),
      },
      board: board.rows[0],
      flags: {
        tour_mode: sm.get('TourMode') === 'true',
        card_draw_mode: sm.get('CardDrawMode') === 'true',
        game_enabled: sm.get('BoardGameEnabled') === 'true',
        game_started_at: sm.get('BoardGameStartedAt') || null,
        show_all_stats: sm.get('ShowAllStats') !== 'false',
        exchange_rate_multiplier: Number(sm.get('ExchangeRateMultiplier') ?? '1.0') || 1.0,
      },
      scoring: {
        enabled: Boolean(board.rows[0].final_scoring_triggered_at),
        triggered_at: board.rows[0].final_scoring_triggered_at,
      },
      leaderboard,
    };
    return ok(dash);
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// Dashboard 上的快速控制：旗標、權重倍率、遊戲開始
// ─────────────────────────────────────────────────────────────
export async function setQuickFlag(
  key: 'TourMode' | 'CardDrawMode' | 'BoardGameEnabled',
  value: boolean,
): Promise<ActionResult<{ key: string; value: boolean }>> {
  try {
    const session = await requireRole('admin');
    await setSetting(key, value ? 'true' : 'false', session.userId);
    // 第一次開啟 BoardGameEnabled 時記錄起始時間（之後關閉再開不會被覆寫）
    if (key === 'BoardGameEnabled' && value) {
      const existing = await query<{ value: string }>(
        `SELECT value FROM "AppSettings" WHERE key = 'BoardGameStartedAt'`,
      );
      if (!existing.rows[0]?.value) {
        await setSetting('BoardGameStartedAt', new Date().toISOString(), session.userId);
      }
    }
    revalidatePath('/admin');
    revalidatePath('/admin/settings');
    return ok({ key, value });
  } catch (err) {
    return fail(err);
  }
}

export async function setExchangeRateMultiplier(
  multiplier: number,
): Promise<ActionResult<{ multiplier: number }>> {
  try {
    const session = await requireRole('admin');
    if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 10) {
      throw new ActionError('INVALID_INPUT', '倍率需介於 0–10 之間');
    }
    await setSetting('ExchangeRateMultiplier', multiplier.toFixed(2), session.userId);
    revalidatePath('/admin');
    return ok({ multiplier });
  } catch (err) {
    return fail(err);
  }
}

export async function triggerFinalScoring(): Promise<ActionResult<{ triggered_at: string }>> {
  try {
    const session = await requireRole('admin');
    const r = await withTx(async (client) => {
      const cur = await client.query<{ final_scoring_triggered_at: string | null }>(
        `SELECT final_scoring_triggered_at FROM "BoardConfig" WHERE id = 1 FOR UPDATE`,
      );
      if (cur.rows[0]?.final_scoring_triggered_at) {
        throw new ActionError('CONFLICT', '已觸發過終局結算');
      }
      const upd = await client.query<{ final_scoring_triggered_at: string }>(
        `UPDATE "BoardConfig" SET final_scoring_triggered_at = now(), updated_at = now()
         WHERE id = 1
         RETURNING final_scoring_triggered_at`,
      );
      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $1, 'final_scoring', $2)`,
        [session.userId, JSON.stringify({})],
      );
      return upd.rows[0].final_scoring_triggered_at;
    });
    revalidatePath('/admin');
    revalidatePath('/admin/events');
    return ok({ triggered_at: r });
  } catch (err) {
    return fail(err);
  }
}

/**
 * 重啟遊戲場次（核重置）— 把整場活動狀態歸零，準備下一場。
 *
 * **清空**：
 * - 玩家四項數值 / 命格 / 重生計數 / 借款餘額 / 手動刷新節流戳
 * - StockHolding（持股）
 * - PlayerLoan（借貸）
 * - PlayerItem（道具）
 * - StockHistory（股價歷史曲線）
 * - StockRoundScript / StockRoundEvent（股市回合腳本）
 * - StationUsage / QuickActionUsage（使用次數紀錄）
 * - Station.global_use_count = 0、QuickAction.global_use_count = 0
 * - BoardConfig 場次狀態（current_round / last_tick_at / marquee / final_scoring_triggered_at）
 *
 * **回到起始狀態**：
 * - Event.is_active = false（事件保留定義，但全部停用，下一場再選擇要啟用哪些）
 * - AppSettings.BoardGameEnabled = 'false'
 * - AppSettings.BoardGameStartedAt = ''
 *
 * **保留**：
 * - Account（帳號）
 * - Stock 商品定義（current_price 保留，作為新場起始價）
 * - Item / Station / QuickAction / InitialValueTemplate 定義
 * - ExchangeOption / BankLoanOption 方案
 * - Transaction 稽核紀錄（不刪歷史）
 *
 * **不可復原**。前端應有 5 次確認彈窗。
 */
export async function restartGameCycle(): Promise<ActionResult<{ reset_at: string }>> {
  try {
    const session = await requireRole('admin');
    const r = await withTx(async (client) => {
      // 1. 玩家狀態歸零
      await client.query(
        `UPDATE "PlayerStats"
         SET destiny_name = NULL, money = 0, health = 0, blessing = 0, karma = 0,
             rebirth_count = 0, bank_loan = 0, loan_updated_at = NULL,
             last_manual_refresh_at = NULL, updated_at = now()`,
      );
      // 2. 持股 / 借貸 / 道具
      await client.query(`DELETE FROM "StockHolding"`);
      await client.query(`DELETE FROM "PlayerLoan"`);
      await client.query(`DELETE FROM "PlayerItem"`);
      // 3. 股票歷史 + 回合腳本
      await client.query(`DELETE FROM "StockHistory"`);
      await client.query(`DELETE FROM "StockRoundScript"`);
      await client.query(`DELETE FROM "StockRoundEvent"`);
      // 4. 使用次數 / 計數歸零
      await client.query(`UPDATE "Station" SET global_use_count = 0`);
      await client.query(`UPDATE "QuickAction" SET global_use_count = 0`);
      await client.query(`DELETE FROM "StationUsage"`);
      await client.query(`DELETE FROM "QuickActionUsage"`);
      // 5. 事件回到「未啟用」起始
      await client.query(`UPDATE "Event" SET is_active = false`);
      // 6. BoardConfig 場次狀態
      const upd = await client.query<{ updated_at: string }>(
        `UPDATE "BoardConfig"
         SET final_scoring_triggered_at = NULL,
             current_round = 0,
             last_tick_at = NULL,
             marquee_text = '',
             marquee_until = NULL,
             featured_stock_ids = '{}',
             updated_at = now()
         WHERE id = 1
         RETURNING updated_at`,
      );
      if (upd.rows.length === 0) throw new ActionError('NOT_FOUND', 'BoardConfig 不存在');
      // 7. 寫稽核
      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $1, 'danger_zone_reset', $2)`,
        [session.userId, JSON.stringify({ op: 'restart_game_cycle' })],
      );
      return upd.rows[0].updated_at;
    });
    // 8. AppSettings 旗標（走 setSetting 留稽核）
    await setSetting('BoardGameEnabled', 'false', session.userId);
    await setSetting('BoardGameStartedAt', '', session.userId);
    await setSetting('CardDrawMode', 'false', session.userId);
    await setSetting('TourMode', 'false', session.userId);

    revalidatePath('/admin');
    revalidatePath('/admin/events');
    revalidatePath('/admin/stocks');
    revalidatePath('/admin/accounts');
    revalidatePath('/display/board');
    revalidatePath('/');
    return ok({ reset_at: r });
  } catch (err) {
    return fail(err);
  }
}

export async function resetSinglePlayer(userId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireRole('admin');
    await withTx(async (client) => {
      const exists = await client.query(`SELECT 1 FROM "Account" WHERE user_id = $1 AND role = 'player'`, [userId]);
      if (exists.rows.length === 0) throw new ActionError('NOT_FOUND', '玩家不存在');
      await client.query(
        `UPDATE "PlayerStats"
         SET destiny_name = NULL, money = 0, health = 0, blessing = 0, karma = 0,
             rebirth_count = 0, bank_loan = 0, loan_updated_at = NULL,
             last_manual_refresh_at = NULL, updated_at = now()
         WHERE user_id = $1`,
        [userId],
      );
      await client.query(`DELETE FROM "StockHolding" WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM "PlayerLoan" WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM "PlayerItem" WHERE user_id = $1`, [userId]);
      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $2, 'account_update', $3)`,
        [userId, session.userId, JSON.stringify({ op: 'reset_single' })],
      );
    });
    revalidatePath('/admin/accounts');
    revalidatePath('/admin');
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}
