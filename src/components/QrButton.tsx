'use client';

import { useEffect, useState } from 'react';
import { QrCode, X, RefreshCcw } from 'lucide-react';

// ── Mock player（實際由 session 取）───────────────────
const PLAYER = { id: 'U-1234', name: '王小明' };

/**
 * QR 按鈕 + 彈窗。
 * 點擊按鈕開彈窗，顯示一張 QR 圖；按 X 或點背景即可關閉。
 * 不做倒數計時（避免長駐定時器耗 CPU）；如需更新 token，按「重新生成」即可。
 */
export default function QrButton() {
  const [open, setOpen]         = useState(false);
  const [tokenSeed, setSeed]    = useState(() => Math.random().toString(36).slice(2));

  // ESC 關閉
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // 開彈窗時順手刷新 token（每次打開都拿最新）
  const openModal = () => {
    setSeed(Math.random().toString(36).slice(2));
    setOpen(true);
  };

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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="panel rounded-2xl p-6 max-w-sm w-full relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-zinc-800/60 hover:bg-zinc-700/80 border border-zinc-700 flex items-center justify-center text-zinc-300 transition-colors"
              aria-label="關閉"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-lg font-bold text-zinc-100 mb-4 text-center">我的 QR Code</h2>

            {/* QR placeholder（實際以 qrcode 套件 + HMAC token 渲染）*/}
            <div className="w-full aspect-square bg-white rounded-xl flex items-center justify-center mb-4">
              <FakeQR seed={tokenSeed} />
            </div>

            <div className="text-center mb-4">
              <p className="text-zinc-400 text-xs">玩家</p>
              <p className="text-xl font-bold text-zinc-100">{PLAYER.name}</p>
              <p className="text-zinc-500 text-xs font-mono">{PLAYER.id}</p>
            </div>

            <button
              onClick={() => setSeed(Math.random().toString(36).slice(2))}
              className="w-full bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700 rounded-xl py-2.5 flex items-center justify-center gap-2 text-zinc-300 hover:text-amber-500 text-sm transition-colors"
            >
              <RefreshCcw className="w-4 h-4" />
              <span>重新生成</span>
            </button>

            <p className="text-[0.6875rem] text-zinc-500 text-center mt-3">
              將此 QR 給關主掃描以領取分數、道具或執行重生。
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// ── 假 QR pattern：實際以 qrcode 套件由 HMAC token 產生 ─────────
function FakeQR({ seed }: { seed: string }) {
  const grid = Array.from({ length: 21 * 21 }, (_, i) => {
    const c = seed.charCodeAt(i % seed.length) + i;
    return c % 7 < 3;
  });
  return (
    <div
      className="w-[88%]"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(21, 1fr)',
        gridTemplateRows:    'repeat(21, 1fr)',
        aspectRatio: '1 / 1',
      }}
    >
      {grid.map((on, i) => (
        <div key={i} style={{ backgroundColor: on ? '#18181b' : '#ffffff' }} />
      ))}
    </div>
  );
}
