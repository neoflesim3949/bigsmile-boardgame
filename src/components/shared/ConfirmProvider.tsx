'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * ConfirmProvider — 取代 `window.confirm()` 的共用元件
 *
 * 為何抽出（code review #3.9）：
 * - mobile Safari / 部分桌面 Chrome 會擋 `window.confirm`，玩家 / 關主端體驗破窗
 * - 樣式無法跟主題對齊（深色 / 字級 / 動畫）
 * - 危險操作要求 N 次確認時 native confirm 沒辦法做漸進式說明
 *
 * 用法：
 * ```tsx
 * // 1. 在 layout 裡包 <ConfirmProvider>
 * <ConfirmProvider>{children}</ConfirmProvider>
 *
 * // 2. callsite 裡用 useConfirm
 * const confirm = useConfirm();
 * if (!(await confirm('要刪除這筆嗎？'))) return;
 * // 也支援 options
 * if (!(await confirm({ message: '...', confirmText: '永久刪除', danger: true }))) return;
 * ```
 */

export interface ConfirmOpts {
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  /** 紅色按鈕（destructive op） */
  danger?: boolean;
}

type ConfirmFn = (arg: ConfirmOpts | string) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const [resolver, setResolver] = useState<{ resolve: (v: boolean) => void } | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((arg) => {
    return new Promise<boolean>((resolve) => {
      setOpts(typeof arg === 'string' ? { message: arg } : arg);
      setResolver({ resolve });
    });
  }, []);

  const close = useCallback((v: boolean) => {
    resolver?.resolve(v);
    setOpts(null);
    setResolver(null);
  }, [resolver]);

  // a11y：ESC 關閉、Tab focus trap（code review 0505 L7）
  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
        return;
      }
      // Focus trap：Tab 在 cancel 與 confirm 兩鈕之間 wraparound
      if (e.key === 'Tab') {
        const cancel = cancelBtnRef.current;
        const confirmBtn = confirmBtnRef.current;
        if (!cancel || !confirmBtn) return;
        const active = document.activeElement;
        if (e.shiftKey) {
          // Shift+Tab：從 cancel 倒回 confirm
          if (active === cancel) {
            e.preventDefault();
            confirmBtn.focus();
          }
        } else {
          // Tab：從 confirm 跳到 cancel
          if (active === confirmBtn) {
            e.preventDefault();
            cancel.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opts, close]);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) close(false); }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            {opts.title && (
              <h3 className="mb-3 text-lg font-bold text-zinc-100">{opts.title}</h3>
            )}
            <p className="mb-6 whitespace-pre-wrap text-sm text-zinc-200 leading-relaxed">{opts.message}</p>
            <div className="flex justify-end gap-3">
              <button
                ref={cancelBtnRef}
                type="button"
                onClick={() => close(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors min-h-[44px] min-w-[88px]"
              >
                {opts.cancelText ?? '取消'}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                onClick={() => close(true)}
                autoFocus
                className={
                  'rounded-lg px-4 py-2 text-sm font-bold transition-colors min-h-[44px] min-w-[88px] ' +
                  (opts.danger
                    ? 'bg-rose-600 text-white hover:bg-rose-500'
                    : 'bg-amber-600 text-white hover:bg-amber-500')
                }
              >
                {opts.confirmText ?? '確認'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const c = useContext(ConfirmCtx);
  if (!c) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return c;
}
