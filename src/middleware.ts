import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Edge runtime middleware：純解碼 JWT 做路由保護。
 * - 不能用 jsonwebtoken（Node API）；改用 jose。
 * - 不打 DB；onboarding 觸發條件「destiny_name=NULL」放在 server action 端二次驗證，
 *   middleware 只做粗導向（CardDrawMode + 玩家 role）；細節由 / 與 /onboarding 的 page.tsx 自行 redirect。
 */

const ACCESS_COOKIE = 'bg_access';

type Role = 'admin' | 'player' | 'captain';

interface Session {
  userId: string;
  role: Role;
  name: string;
}

async function decode(token: string): Promise<Session | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (
      typeof payload.userId === 'string' &&
      typeof payload.role === 'string' &&
      ['admin', 'player', 'captain'].includes(payload.role)
    ) {
      return {
        userId: payload.userId,
        role: payload.role as Role,
        name: typeof payload.name === 'string' ? payload.name : '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

const PUBLIC_PATHS = ['/login', '/_next', '/favicon.ico', '/api/health', '/api/loadtest-login'];
const DISPLAY_PREFIX = '/display/';
// 全 role 共用路由（player + captain + admin 都可訪問）
const UNIVERSAL_AUTHED_PATHS = ['/settings'];

function homeFor(role: Role): string {
  if (role === 'admin') return '/admin';
  if (role === 'captain') return '/captain';
  return '/';
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // 看板走 display token，不走 cookie
  if (pathname.startsWith(DISPLAY_PREFIX)) return NextResponse.next();
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  const session = token ? await decode(token) : null;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // 全 role 共用路由（settings：主題 / 字級 / 登出，三 role 共用同一頁）
  if (UNIVERSAL_AUTHED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // 角色路由保護
  if (pathname.startsWith('/admin')) {
    if (session.role !== 'admin') return NextResponse.redirect(new URL(homeFor(session.role), req.url));
  } else if (pathname.startsWith('/captain')) {
    if (session.role !== 'captain') return NextResponse.redirect(new URL(homeFor(session.role), req.url));
  } else {
    // 玩家路由（/、/stock、/exchange、/bank、/transfer、/history、/onboarding）
    if (session.role !== 'player') {
      return NextResponse.redirect(new URL(homeFor(session.role), req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // 排除靜態與 api 內部
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico)$).*)',
  ],
};
