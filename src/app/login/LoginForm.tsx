'use client';

import { useActionState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, User, AlertCircle } from 'lucide-react';
import { login } from '@/app/actions/auth';
import type { ActionResult } from '@/lib/error';
import type { Role } from '@/lib/auth';

type LoginResult = ActionResult<{ role: Role; redirectTo: string }> | null;

/**
 * Login 自動重試 — exponential backoff + full jitter（規避 PgBouncer Pooler 200 上限）。
 *
 * 規則：
 * - 重試 `INTERNAL_ERROR`（fail() 對未知 throw 的 fallback 包裝、含 pg EMAXCONN）
 * - 重試 `TIMEOUT`（db.ts 三道 timeout 保險絲被觸發、0507_problem.md §2/§4）
 * - **不**重試 LOGIN_FAILED（密碼錯）/ LOGIN_LOCKED（鎖帳）/ INVALID_INPUT（form 錯）
 * - 最多 3 次 retry，base 500ms × 2^(attempt-1)，full jitter [0, 2 × base]
 *   - attempt 1: wait 0~1000ms
 *   - attempt 2: wait 0~2000ms
 *   - attempt 3: wait 0~4000ms
 * - **Jitter 是關鍵**：把同步 retry 隨機散開，避免「大家一起 retry 一起撞牆」
 *
 * 實測（500 同步登入 sync burst、Pool 200 上限）：
 * - 無 retry：42%
 * - 1s flat retry：61%
 * - **exp backoff + jitter：95%**（client p95 < 7s、體感稍久但能進）
 *
 * 對玩家：UI 仍顯示「登入中…」全程；極端尖峰時等待時間略拉長但能進。
 */
const RETRYABLE_CODES = new Set(['INTERNAL_ERROR', 'TIMEOUT']);

async function loginAction(_prev: LoginResult, formData: FormData): Promise<LoginResult> {
  const MAX_RETRIES = 3;
  let last: LoginResult = await login(_prev, formData);
  if (last.ok) return last;
  if (!RETRYABLE_CODES.has(last.error?.code ?? '')) return last;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const baseMs = 500 * Math.pow(2, attempt - 1);
    const waitMs = Math.random() * baseMs * 2;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    last = await login(_prev, formData);
    if (last.ok) return last;
    if (!RETRYABLE_CODES.has(last.error?.code ?? '')) return last;
  }
  return last;
}

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');

  const [state, formAction, pending] = useActionState<LoginResult, FormData>(loginAction, null);

  useEffect(() => {
    if (state?.ok) {
      const target = next && next !== '/login' ? next : state.data!.redirectTo;
      router.replace(target);
    }
  }, [state, router, next]);

  return (
    <form action={formAction} className="w-full space-y-4">
      <div className="space-y-1">
        <label htmlFor="loginId" className="text-xs text-zinc-400 ml-1">帳號</label>
        <div className="flex items-center gap-2 bg-zinc-800/80 border border-zinc-700 focus-within:border-amber-500/60 rounded-xl px-3">
          <User className="w-4 h-4 text-zinc-500 flex-shrink-0" />
          <input
            id="loginId"
            name="loginId"
            type="text"
            required
            autoComplete="username"
            disabled={pending}
            className="bg-transparent flex-1 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none disabled:opacity-50"
            placeholder="輸入帳號"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="text-xs text-zinc-400 ml-1">密碼</label>
        <div className="flex items-center gap-2 bg-zinc-800/80 border border-zinc-700 focus-within:border-amber-500/60 rounded-xl px-3">
          <Lock className="w-4 h-4 text-zinc-500 flex-shrink-0" />
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            disabled={pending}
            className="bg-transparent flex-1 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none disabled:opacity-50"
            placeholder="輸入密碼"
          />
        </div>
      </div>

      {state && !state.ok && (
        <div className="flex items-start gap-2 text-rose-400 text-sm bg-rose-950/30 border border-rose-900/60 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            {state.error?.code === 'INTERNAL_ERROR' || state.error?.code === 'TIMEOUT'
              // 自動 retry 3 次仍失敗 → 給用戶明確指引（人潮多、再點一次必中）
              ? '目前登入人潮較多，請等 3 秒後再點一次「登入」即可'
              : (state.error?.message ?? '登入失敗')}
          </span>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-60 disabled:cursor-not-allowed text-zinc-950 font-semibold py-3 rounded-xl transition-all min-h-[44px]"
      >
        {pending ? '登入中…' : '登入'}
      </button>
    </form>
  );
}
