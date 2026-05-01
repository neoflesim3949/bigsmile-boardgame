'use client';

import { useActionState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, User, AlertCircle } from 'lucide-react';
import { login } from '@/app/actions/auth';
import type { ActionResult } from '@/lib/error';
import type { Role } from '@/lib/auth';

type LoginResult = ActionResult<{ role: Role; redirectTo: string }> | null;

async function loginAction(_prev: LoginResult, formData: FormData): Promise<LoginResult> {
  return login(_prev, formData);
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
          <span>{state.error?.message ?? '登入失敗'}</span>
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
