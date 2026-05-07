'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

/**
 * 寫入守護（CLAUDE.md §6.4 / 0507_problem.md §6）
 *
 * 規則：
 *   1. 任何寫入動作都要等到 server + DB 回覆才能下一個動作
 *   2. 寫入中顯示 loading overlay（擋全螢幕點擊、防誤觸）
 *   3. 失敗 → 顯示具體錯誤訊息（業務錯誤如「金錢不足」維持具體文字；
 *      系統錯誤 fallback「寫入失敗，請再試一次」）
 *   4. 寫入中再觸發任何 write → 直接擋下（busy = true）
 *
 * 用法：
 *   const { busy, run } = useWriteGuard();
 *   const r = await run(async () => buyStock({ stockId, shares }));
 *   if (r?.ok) setToast({ ok: true, msg: '買入成功' });
 *
 * Server action 回傳 ActionResult<T> = { ok: boolean, error?: { message } }
 *   - r.ok === true  → overlay 自動消失、回傳 r 給 caller
 *   - r.ok === false → overlay 顯示 r.error.message（fallback「寫入失敗，請再試一次」）
 *   - 其他例外（網路炸、Next.js 內部錯）→ 顯示 fallback 訊息
 */

const FALLBACK_ERROR = '寫入失敗，請再試一次';

type WriteState =
  | { type: 'idle' }
  | { type: 'busy' }
  | { type: 'error'; message: string };

interface ActionResultLike {
  ok: boolean;
  error?: { message?: string };
}

function isActionResult(r: unknown): r is ActionResultLike {
  return typeof r === 'object' && r !== null && 'ok' in r;
}

interface WriteGuardCtx {
  busy: boolean;
  /**
   * 包裝 server action 呼叫，自動處理 loading + 失敗 overlay。
   * 回傳：action 結果（ActionResult）；若被擋下（busy 中）回傳 null。
   */
  run: <T>(fn: () => Promise<T>) => Promise<T | null>;
}

const Ctx = createContext<WriteGuardCtx | null>(null);

export function WriteGuardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WriteState>({ type: 'idle' });
  // 用 ref 避免 closure 抓到 stale state（連點兩次按鈕時 state 還沒同步）
  const busyRef = useRef(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setState({ type: 'busy' });
    try {
      const r = await fn();
      busyRef.current = false;
      // ActionResult shape：失敗時 setError、成功時 idle
      if (isActionResult(r) && r.ok === false) {
        setState({ type: 'error', message: r.error?.message ?? FALLBACK_ERROR });
        return r;
      }
      setState({ type: 'idle' });
      return r;
    } catch (err) {
      busyRef.current = false;
      console.warn('[WriteGuard] action threw:', err);
      setState({ type: 'error', message: FALLBACK_ERROR });
      return null;
    }
  }, []);

  const dismissError = useCallback(() => {
    setState({ type: 'idle' });
  }, []);

  return (
    <Ctx.Provider value={{ busy: state.type === 'busy', run }}>
      {children}
      {state.type !== 'idle' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-live={state.type === 'error' ? 'assertive' : 'polite'}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            // busy 不可關（強制等完成）；error 點背景可關
            if (state.type === 'error' && e.target === e.currentTarget) dismissError();
          }}
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl px-6 py-5 min-w-[260px] max-w-sm mx-4 text-center">
            {state.type === 'busy' && (
              <>
                <Loader2 className="w-10 h-10 mx-auto text-amber-400 animate-spin" />
                <p className="mt-3 text-zinc-100 font-medium text-base">寫入中…</p>
                <p className="mt-1 text-xs text-zinc-500">處理中，請勿關閉頁面</p>
              </>
            )}
            {state.type === 'error' && (
              <>
                <AlertCircle className="w-10 h-10 mx-auto text-rose-400" />
                <p className="mt-3 text-zinc-100 font-medium text-base leading-relaxed whitespace-pre-wrap break-words">
                  {state.message}
                </p>
                <button
                  type="button"
                  onClick={dismissError}
                  className="mt-4 px-8 py-2 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-semibold rounded-lg min-h-[44px] transition-colors"
                  autoFocus
                >
                  確定
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/**
 * 取得 WriteGuard。必須在 WriteGuardProvider 包裝下。
 */
export function useWriteGuard(): WriteGuardCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWriteGuard must be used inside <WriteGuardProvider>');
  return ctx;
}
