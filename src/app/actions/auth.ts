'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ActionError, fail, ok, type ActionResult } from '@/lib/error';
import { withTx, query } from '@/lib/db';
import {
  clearAuthCookies,
  getSessionFromCookies,
  setAuthCookies,
  verifyRefreshToken,
  type Role,
  type SessionPayload,
} from '@/lib/auth';
import { cookies } from 'next/headers';

const REFRESH_COOKIE = 'bg_refresh';

// ─────────────────────────────────────────────────────────────
// Login throttle（per-account 主防線：5 次失敗 / 分鐘 → 鎖 15 分鐘）
// ─────────────────────────────────────────────────────────────
const FAIL_WINDOW_MINUTES = 1;
const FAIL_THRESHOLD = 5;
const LOCK_MINUTES = 15;

async function checkAndBumpThrottle(loginId: string): Promise<void> {
  await withTx(async (client) => {
    const r = await client.query<{
      fail_count: number;
      first_fail_at: string | null;
      locked_until: string | null;
    }>(
      `SELECT fail_count, first_fail_at, locked_until FROM "LoginThrottle" WHERE login_id = $1 FOR UPDATE`,
      [loginId],
    );
    const row = r.rows[0];
    const now = Date.now();
    if (row?.locked_until && new Date(row.locked_until).getTime() > now) {
      throw new ActionError(
        'LOGIN_LOCKED',
        `登入嘗試過多，請於 ${new Date(row.locked_until).toLocaleTimeString()} 後重試`,
      );
    }
  });
}

async function recordLoginFail(loginId: string): Promise<void> {
  await withTx(async (client) => {
    await client.query(
      `INSERT INTO "LoginThrottle" (login_id, fail_count, first_fail_at)
       VALUES ($1, 1, now())
       ON CONFLICT (login_id) DO UPDATE SET
         fail_count = CASE
           WHEN "LoginThrottle".first_fail_at IS NULL
             OR now() - "LoginThrottle".first_fail_at > make_interval(mins => $2)
             THEN 1
           ELSE "LoginThrottle".fail_count + 1
         END,
         first_fail_at = CASE
           WHEN "LoginThrottle".first_fail_at IS NULL
             OR now() - "LoginThrottle".first_fail_at > make_interval(mins => $2)
             THEN now()
           ELSE "LoginThrottle".first_fail_at
         END,
         locked_until = CASE
           WHEN "LoginThrottle".fail_count + 1 >= $3
             THEN now() + make_interval(mins => $4)
           ELSE NULL
         END`,
      [loginId, FAIL_WINDOW_MINUTES, FAIL_THRESHOLD, LOCK_MINUTES],
    );
  });
}

async function clearLoginFails(loginId: string): Promise<void> {
  await query(`DELETE FROM "LoginThrottle" WHERE login_id = $1`, [loginId]);
}

// ─────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────
const loginSchema = z.object({
  loginId: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

export async function login(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ role: Role; redirectTo: string }>> {
  try {
    const parsed = loginSchema.safeParse({
      loginId: formData.get('loginId'),
      password: formData.get('password'),
    });
    if (!parsed.success) {
      throw new ActionError('INVALID_INPUT', '請輸入帳號與密碼');
    }
    const { loginId, password } = parsed.data;

    await checkAndBumpThrottle(loginId);

    const r = await query<{
      user_id: string;
      name: string;
      password_hash: string | null;
      role: Role;
      is_active: boolean;
    }>(
      `SELECT user_id, name, password_hash, role, is_active
       FROM "Account" WHERE login_id = $1`,
      [loginId],
    );
    const acct = r.rows[0];
    if (!acct || !acct.is_active || !acct.password_hash) {
      await recordLoginFail(loginId);
      throw new ActionError('LOGIN_FAILED', '帳號或密碼錯誤');
    }
    const okPwd = await bcrypt.compare(password, acct.password_hash);
    if (!okPwd) {
      await recordLoginFail(loginId);
      throw new ActionError('LOGIN_FAILED', '帳號或密碼錯誤');
    }

    await clearLoginFails(loginId);

    // 簽發 token（refresh jti 寫表，便於日後撤銷）
    const jti = randomUUID();
    const refreshTtl = Number(process.env.REFRESH_TOKEN_TTL_SECONDS) || 60 * 60 * 24 * 7;
    await query(
      `INSERT INTO "RefreshToken" (jti, user_id, expires_at)
       VALUES ($1, $2, now() + make_interval(secs => $3))`,
      [jti, acct.user_id, refreshTtl],
    );

    await setAuthCookies(
      { userId: acct.user_id, role: acct.role, name: acct.name },
      jti,
    );

    const redirectTo =
      acct.role === 'admin' ? '/admin' : acct.role === 'captain' ? '/captain' : '/';
    return ok({ role: acct.role, redirectTo });
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────────────────────
export async function logout(): Promise<void> {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    const decoded = verifyRefreshToken(refreshToken);
    if (decoded) {
      await query(
        `UPDATE "RefreshToken" SET revoked_at = now() WHERE jti = $1 AND revoked_at IS NULL`,
        [decoded.jti],
      );
    }
  }
  await clearAuthCookies();
  redirect('/login');
}

export async function getMe(): Promise<SessionPayload | null> {
  return getSessionFromCookies();
}
