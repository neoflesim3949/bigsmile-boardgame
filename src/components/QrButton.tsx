'use client';

import { useEffect, useState, useTransition } from 'react';
import { QrCode, X, RefreshCcw, AlertCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { issueMyQrToken } from '@/app/actions/player';

/**
 * QR 按鈕 + 彈窗。
 * 真實 HMAC token（5 分鐘 TTL，可在 AppSettings.QRTokenTTL 調整）。
 * 點「重新生成」會打 server action 取新 token。
 *
 * 同時顯示姓名 + UserID 作為「掃碼失敗的後備」— 關主可改用手動輸入 ID。
 */
interface QrButtonProps {
  name?: string;
  userId?: string;
}

export default function QrButton({ name, userId }: QrButtonProps = {}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [ttl, setTtl] = useState(300);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refreshToken() {
    setErr(null);
    startTransition(async () => {
      const r = await issueMyQrToken();
      if (r.ok) {
        setToken(r.data!.token);
        setTtl(r.data!.ttl_seconds);
      } else {
        setErr(r.error?.message ?? '無法產生 QR Code');
      }
    });
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function openModal() {
    setOpen(true);
    if (!token) refreshToken();
  }

  return (
    <>
      <button
        onClick={openModal}
        className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 hover:bg-amber-500/20 transition-colors"
        aria-label="顯示我的 QR Code"
      >
        <QrCode className="w-4 h-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-zinc-800/60 hover:bg-zinc-700/80 border border-zinc-700 flex items-center justify-center text-zinc-300 transition-colors"
              aria-label="關閉"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-lg font-bold text-zinc-100 mb-4 text-center">我的 QR Code</h2>

            {(name || userId) && (
              <div className="bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 mb-4 text-center">
                {name && <p className="text-2xl font-bold text-amber-400 leading-tight">{name}</p>}
                {userId && (
                  <p className="text-zinc-500 font-mono text-sm mt-1 select-all">
                    ID：<span className="text-zinc-300 select-all">{userId}</span>
                  </p>
                )}
                <p className="text-[0.625rem] text-zinc-600 mt-1">
                  掃碼失敗時，請關主直接輸入上方 ID
                </p>
              </div>
            )}

            <div className="w-full aspect-square bg-white rounded-xl flex items-center justify-center mb-4 p-4">
              {token ? (
                <QRCodeSVG value={token} size={256} className="w-full h-full" level="M" />
              ) : (
                <div className="text-zinc-400 text-sm">
                  {pending ? '產生中…' : err ? '無法載入' : '請點擊「重新生成」'}
                </div>
              )}
            </div>

            {err && (
              <div className="flex items-center gap-2 text-rose-400 text-sm mb-3">
                <AlertCircle className="w-4 h-4" />
                <span>{err}</span>
              </div>
            )}

            <button
              onClick={refreshToken}
              disabled={pending}
              className="w-full bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700 rounded-xl py-2.5 flex items-center justify-center gap-2 text-zinc-300 hover:text-amber-500 text-sm transition-colors disabled:opacity-60 min-h-[44px]"
            >
              <RefreshCcw className={`w-4 h-4 ${pending ? 'animate-spin' : ''}`} />
              <span>{pending ? '產生中…' : '重新生成'}</span>
            </button>

            <p className="text-[0.6875rem] text-zinc-500 text-center mt-3">
              Token TTL：{ttl} 秒。將此 QR 給關主掃描以領取分數、道具或執行重生。
            </p>
          </div>
        </div>
      )}
    </>
  );
}
