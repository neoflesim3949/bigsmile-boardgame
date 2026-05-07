/**
 * /api/loadtest-login — Login 壓測專用 endpoint
 *
 * **僅供 load test 使用**，雙重 gate：
 * 1. env `LOAD_TEST_ENABLED=true`（必須在 Vercel 環境變數明確設定）
 * 2. loginId 必須以 `loadtest_` 開頭（不能誤打到真實 user）
 *
 * 跑跟 production login 同樣的 DB / bcrypt 工作（throttle / SELECT / compare /
 * clear / INSERT RefreshToken），但**不 set cookies**（純測試延遲，不影響 session）。
 *
 * 回傳 `{ ok: boolean, ms: number, breakdown: {...} }` 細項計時。
 *
 * 部署後關閉：移除 `LOAD_TEST_ENABLED` env var 即可（route 自動回 403）。
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { query, withTx } from '@/lib/db';

export const runtime = 'nodejs';

interface Breakdown {
  throttle_ms: number;
  select_ms: number;
  bcrypt_ms: number;
  clear_ms: number;
  refresh_ms: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (process.env.LOAD_TEST_ENABLED !== 'true') {
    return NextResponse.json({ error: 'load test disabled' }, { status: 403 });
  }

  const t0 = performance.now();
  let body: { loginId?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const loginId = String(body.loginId ?? '').trim();
  const password = String(body.password ?? '');
  if (!loginId.startsWith('loadtest_') || !password) {
    return NextResponse.json({ error: 'loginId must start with loadtest_' }, { status: 403 });
  }

  const breakdown: Breakdown = {
    throttle_ms: 0, select_ms: 0, bcrypt_ms: 0, clear_ms: 0, refresh_ms: 0,
  };

  try {
    // 1. checkAndBumpThrottle（同 production login flow）
    const t_throttle = performance.now();
    await withTx(async (client) => {
      const r = await client.query<{ locked_until: string | null }>(
        `SELECT locked_until FROM "LoginThrottle" WHERE login_id = $1 FOR UPDATE`,
        [loginId],
      );
      const row = r.rows[0];
      if (row?.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
        throw new Error('LOGIN_LOCKED');
      }
    });
    breakdown.throttle_ms = Math.round(performance.now() - t_throttle);

    // 2. SELECT Account
    const t_select = performance.now();
    const r = await query<{
      user_id: string; password_hash: string | null; role: string; is_active: boolean;
    }>(
      `SELECT user_id, password_hash, role, is_active FROM "Account" WHERE login_id = $1`,
      [loginId],
    );
    breakdown.select_ms = Math.round(performance.now() - t_select);
    const acct = r.rows[0];
    if (!acct || !acct.is_active || !acct.password_hash) {
      return NextResponse.json({
        ok: false, ms: Math.round(performance.now() - t0), reason: 'NOT_FOUND', breakdown,
      });
    }

    // 3. bcrypt.compare（CPU bound、最大瓶頸）
    const t_bcrypt = performance.now();
    const okPwd = await bcrypt.compare(password, acct.password_hash);
    breakdown.bcrypt_ms = Math.round(performance.now() - t_bcrypt);
    if (!okPwd) {
      return NextResponse.json({
        ok: false, ms: Math.round(performance.now() - t0), reason: 'WRONG_PASSWORD', breakdown,
      });
    }

    // 4. clearLoginFails
    const t_clear = performance.now();
    await query(`DELETE FROM "LoginThrottle" WHERE login_id = $1`, [loginId]);
    breakdown.clear_ms = Math.round(performance.now() - t_clear);

    // 5. INSERT RefreshToken（用 jti 隨機 UUID 避免 conflict）
    const t_refresh = performance.now();
    const jti = randomUUID();
    const refreshTtl = Number(process.env.REFRESH_TOKEN_TTL_SECONDS) || 60 * 60 * 24 * 7;
    await query(
      `INSERT INTO "RefreshToken" (jti, user_id, expires_at)
       VALUES ($1, $2, now() + make_interval(secs => $3))`,
      [jti, acct.user_id, refreshTtl],
    );
    breakdown.refresh_ms = Math.round(performance.now() - t_refresh);

    // 不 setAuthCookies — 純測延遲，不寫 cookie
    return NextResponse.json({
      ok: true, ms: Math.round(performance.now() - t0), role: acct.role, breakdown,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      ms: Math.round(performance.now() - t0),
      reason: err instanceof Error ? err.message : 'INTERNAL',
      breakdown,
    });
  }
}
