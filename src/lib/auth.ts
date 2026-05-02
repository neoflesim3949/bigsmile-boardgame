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

export function verifyAccessToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, authSecret()) as JwtPayload & SessionPayload;
    if (!decoded.userId || !decoded.role) return null;
    return { userId: decoded.userId, role: decoded.role, name: decoded.name ?? '' };
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
): Promise<{ allow_rebirth: boolean }> {
  const sql = `SELECT captain_user_ids, allow_rebirth FROM "Station" WHERE id = $1 AND is_active = true`;
  const r = client
    ? await client.query<{ captain_user_ids: string[]; allow_rebirth: boolean }>(sql, [stationId])
    : await query<{ captain_user_ids: string[]; allow_rebirth: boolean }>(sql, [stationId]);
  const row = r.rows[0];
  if (!row) throw new ActionError('NOT_FOUND', '關卡不存在或已停用');
  if (!row.captain_user_ids.includes(captainUserId)) {
    throw new ActionError('FORBIDDEN', '您未被指派為該關卡關主');
  }
  return { allow_rebirth: row.allow_rebirth };
}

export async function assertNotDuringFinalScoring(client?: PoolClient): Promise<void> {
  const sql = `SELECT final_scoring_triggered_at FROM "BoardConfig" WHERE id = 1`;
  const r = client
    ? await client.query<{ final_scoring_triggered_at: string | null }>(sql)
    : await query<{ final_scoring_triggered_at: string | null }>(sql);
  if (r.rows[0]?.final_scoring_triggered_at) {
    throw new ActionError('FORBIDDEN', '終局結算已觸發，玩家寫入操作停用');
  }
}

export async function withSessionTx<T>(
  fn: (client: PoolClient, session: SessionPayload) => Promise<T>,
): Promise<T> {
  const session = await requireSession();
  return withTx((client) => fn(client, session));
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
