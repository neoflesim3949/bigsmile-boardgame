import { cookies } from 'next/headers';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { ActionError } from './error';
import { query, withTx, type PoolClient } from './db';

export type Role = 'admin' | 'player' | 'captain';

export interface SessionPayload {
  userId: string;
  role: Role;
  name: string;
}

const ACCESS_COOKIE = 'bg_access';
const REFRESH_COOKIE = 'bg_refresh';

function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error('AUTH_SECRET must be set to a string of at least 32 characters');
  }
  return s;
}

function ttlSeconds(envKey: string, fallback: number): number {
  const v = Number(process.env[envKey]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function signAccessToken(payload: SessionPayload): { token: string; maxAge: number } {
  // 預設 1 天 — 活動場景低敏感、避免進行中反覆登出
  // 可由 env ACCESS_TOKEN_TTL_SECONDS 覆寫（高敏感環境建議 1800 秒）
  const maxAge = ttlSeconds('ACCESS_TOKEN_TTL_SECONDS', 60 * 60 * 24);
  const token = jwt.sign(payload, authSecret(), { expiresIn: maxAge } as SignOptions);
  return { token, maxAge };
}

export function signRefreshToken(
  userId: string,
  jti: string,
): { token: string; maxAge: number } {
  const maxAge = ttlSeconds('REFRESH_TOKEN_TTL_SECONDS', 60 * 60 * 24 * 7);
  const token = jwt.sign({ sub: userId, jti }, authSecret(), { expiresIn: maxAge } as SignOptions);
  return { token, maxAge };
}

const VALID_ROLES: ReadonlyArray<Role> = ['admin', 'player', 'captain'];
const MAX_USERID_LEN = 64; // Account.user_id 是 TEXT，但實務上 ≤ 32 字夠用，留 buffer
const MAX_NAME_LEN = 60;

export function verifyAccessToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, authSecret()) as JwtPayload & SessionPayload;
    if (!decoded.userId || !decoded.role) return null;
    // Defense in depth（code review 0505 M4）：
    // 即使 AUTH_SECRET 外洩 + 攻擊者偽造 JWT，也限制 role / userId / name 不能塞超長 / 非法值
    if (!VALID_ROLES.includes(decoded.role)) return null;
    if (typeof decoded.userId !== 'string' || decoded.userId.length === 0 || decoded.userId.length > MAX_USERID_LEN) {
      return null;
    }
    const rawName = typeof decoded.name === 'string' ? decoded.name : '';
    return {
      userId: decoded.userId,
      role: decoded.role,
      name: rawName.slice(0, MAX_NAME_LEN),
    };
  } catch {
    return null;
  }
}

export interface RefreshPayload {
  sub: string;
  jti: string;
}

export function verifyRefreshToken(token: string): RefreshPayload | null {
  try {
    const decoded = jwt.verify(token, authSecret()) as JwtPayload & RefreshPayload;
    if (!decoded.sub || !decoded.jti) return null;
    return { sub: decoded.sub, jti: decoded.jti };
  } catch {
    return null;
  }
}

const COMMON_COOKIE_OPTS = {
  httpOnly: true as const,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export async function setAuthCookies(payload: SessionPayload, refreshJti: string): Promise<void> {
  const access = signAccessToken(payload);
  const refresh = signRefreshToken(payload.userId, refreshJti);
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, access.token, { ...COMMON_COOKIE_OPTS, maxAge: access.maxAge });
  jar.set(REFRESH_COOKIE, refresh.token, { ...COMMON_COOKIE_OPTS, maxAge: refresh.maxAge });
}

export async function clearAuthCookies(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSessionFromCookies();
  if (!session) throw new ActionError('UNAUTHENTICATED', '請先登入');
  return session;
}

export async function requireRole(role: Role | Role[]): Promise<SessionPayload> {
  const session = await requireSession();
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(session.role)) {
    throw new ActionError('FORBIDDEN', '權限不足');
  }
  return session;
}

// ─────────────────────────────────────────────────────────────
// 共用 guards（CLAUDE.md §4.2）
// ─────────────────────────────────────────────────────────────

export interface PlayerStatsLite {
  health: number;
  blessing: number;
}

export function assertPlayerAlive(stats: PlayerStatsLite): void {
  if (stats.health <= 0 || stats.blessing <= 0) {
    throw new ActionError('PLAYER_DEAD', '玩家處於地獄狀態，操作已停用');
  }
}

export function assertPlayerDead(stats: PlayerStatsLite): void {
  if (stats.health > 0 && stats.blessing > 0) {
    throw new ActionError('PLAYER_NOT_DEAD', '目標玩家未處於地獄狀態，無法執行重生');
  }
}

export async function assertCaptainOfStation(
  client: PoolClient | null,
  captainUserId: string,
  stationId: string,
): Promise<{ allow_rebirth: boolean; allow_stock_sell_multiplier: boolean }> {
  const sql = `SELECT captain_user_ids, allow_rebirth, allow_stock_sell_multiplier
               FROM "Station" WHERE id = $1 AND is_active = true`;
  type Row = { captain_user_ids: string[]; allow_rebirth: boolean; allow_stock_sell_multiplier: boolean };
  const r = client
    ? await client.query<Row>(sql, [stationId])
    : await query<Row>(sql, [stationId]);
  const row = r.rows[0];
  if (!row) throw new ActionError('NOT_FOUND', '關卡不存在或已停用');
  if (!row.captain_user_ids.includes(captainUserId)) {
    throw new ActionError('FORBIDDEN', '您未被指派為該關卡關主');
  }
  return {
    allow_rebirth: row.allow_rebirth,
    allow_stock_sell_multiplier: row.allow_stock_sell_multiplier,
  };
}

/**
 * @deprecated 玩家寫入 action 一律改用 `assertNotFrozen`（合併兩個檢查為單一 round-trip）。
 * 此 helper 保留供「僅檢查單一條件」的 admin / debug 場景；新 caller 請優先用 `assertNotFrozen`。
 */
export async function assertNotDuringFinalScoring(client?: PoolClient): Promise<void> {
  const sql = `SELECT final_scoring_triggered_at FROM "BoardConfig" WHERE id = 1`;
  const r = client
    ? await client.query<{ final_scoring_triggered_at: string | null }>(sql)
    : await query<{ final_scoring_triggered_at: string | null }>(sql);
  if (r.rows[0]?.final_scoring_triggered_at) {
    throw new ActionError('FORBIDDEN', '終局結算已觸發，玩家寫入操作停用');
  }
}

/**
 * 導覽模式（TourMode）寫入禁止 — 凡會改變玩家四項值 / 持股 / 借貸 / 道具 的 action 都應呼叫。
 * 用途：admin 在大會前帶觀眾走流程示範時開啟，前端可正常瀏覽，但所有寫入靜默拒絕。
 *
 * @deprecated 玩家寫入 action 一律改用 `assertNotFrozen`（合併兩個檢查為單一 round-trip）。
 * 此 helper 保留供「僅檢查單一條件」的 admin / debug 場景；新 caller 請優先用 `assertNotFrozen`。
 */
export async function assertNotTourMode(client?: PoolClient): Promise<void> {
  const sql = `SELECT value FROM "AppSettings" WHERE key = 'TourMode'`;
  const r = client
    ? await client.query<{ value: string }>(sql)
    : await query<{ value: string }>(sql);
  if (r.rows[0]?.value === 'true') {
    throw new ActionError('FORBIDDEN', '導覽模式中，所有玩家寫入動作已停用');
  }
}

/**
 * 合併「終局結算」與「導覽模式」兩個寫入凍結檢查 — 任一觸發即拒絕。
 * 等價於先 `assertNotDuringFinalScoring` 再 `assertNotTourMode`，但只跑 1 個 round-trip。
 *
 * 玩家寫入 action 第一行用此 helper 取代兩個分開的 assert（CLAUDE.md §3.2）。
 * 仍需單獨檢查時保留原本兩個 helper（例如某些 admin 場景僅檢查其一）。
 */
export async function assertNotFrozen(client?: PoolClient): Promise<void> {
  const sql = `
    SELECT
      (SELECT final_scoring_triggered_at FROM "BoardConfig" WHERE id = 1) AS fs,
      (SELECT value FROM "AppSettings" WHERE key = 'TourMode') AS tour
  `;
  const r = client
    ? await client.query<{ fs: string | null; tour: string | null }>(sql)
    : await query<{ fs: string | null; tour: string | null }>(sql);
  const row = r.rows[0];
  if (row?.fs) {
    throw new ActionError('FORBIDDEN', '終局結算已觸發，玩家寫入操作停用');
  }
  if (row?.tour === 'true') {
    throw new ActionError('FORBIDDEN', '導覽模式中，所有玩家寫入動作已停用');
  }
}

export async function withSessionTx<T>(
  fn: (client: PoolClient, session: SessionPayload) => Promise<T>,
): Promise<T> {
  const session = await requireSession();
  return withTx((client) => fn(client, session));
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
