'use client';

import Link from 'next/link';
import { useState, useTransition, useEffect, useRef } from 'react';
import { ArrowLeft, Send, CheckCircle2, AlertCircle, QrCode, Search, X } from 'lucide-react';
import { lookupPlayerById, decodePlayerQrToken, transferMoney } from '@/app/actions/player';

interface Props {
  myMoney: number;
  isDead: boolean;
  gameEnabled: boolean;
  finalScoringAt: string | null;
}

interface Target { user_id: string; name: string }

export default function TransferClient({ myMoney, isDead, gameEnabled, finalScoringAt }: Props) {
  const [idInput, setIdInput] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, busyTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [balance, setBalance] = useState(myMoney);

  const writeDisabled = isDead || !gameEnabled || !!finalScoringAt;

  function handleLookup() {
    if (!idInput || idInput.length < 6) {
      setMsg({ ok: false, text: '請輸入完整玩家 ID（≥ 6 碼）' });
      return;
    }
    busyTransition(async () => {
      const r = await lookupPlayerById(idInput);
      if (r.ok) {
        setTarget(r.data!);
        setMsg(null);
      } else {
        setTarget(null);
        setMsg({ ok: false, text: r.error?.message ?? '查無此玩家' });
      }
    });
  }

  function handleQrScanned(token: string) {
    setScanOpen(false);
    busyTransition(async () => {
      const r = await decodePlayerQrToken(token);
      if (r.ok) {
        setIdInput(r.data!.user_id);
        setTarget(r.data!);
        setMsg(null);
      } else {
        setMsg({ ok: false, text: r.error?.message ?? '掃碼解析失敗' });
      }
    });
  }

  function handleSubmit() {
    if (!target) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setMsg({ ok: false, text: '請輸入有效金額' });
      return;
    }
    if (n > balance) {
      setMsg({ ok: false, text: '金錢不足' });
      return;
    }
    busyTransition(async () => {
      const r = await transferMoney({ toUserId: target.user_id, amount: n, note: note || undefined });
      if (r.ok) {
        setBalance(r.data!.new_balance);
        setAmount('');
        setNote('');
        setMsg({ ok: true, text: `已成功轉帳 ${n} 給 ${target.name}` });
      } else {
        setMsg({ ok: false, text: r.error?.message ?? '轉帳失敗' });
      }
    });
  }

  return (
    <div className="min-h-screen page-bg p-4 pb-12">
      <header className="flex items-center gap-3 mb-6">
        <Link href="/" className="w-9 h-9 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-zinc-300">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-bold text-zinc-100">玩家轉帳</h1>
      </header>

      {writeDisabled && (
        <div className="bg-rose-950/30 border border-rose-900/60 text-rose-300 rounded-xl p-3 mb-4 text-sm text-center">
          {isDead ? '地獄狀態下無法轉帳' : finalScoringAt ? '終局結算已觸發' : '活動尚未開始'}
        </div>
      )}

      <div className="glass-panel rounded-2xl p-5 mb-4">
        <p className="text-zinc-400 text-sm mb-1">我的金錢</p>
        <p className="text-3xl font-bold text-amber-400">{balance.toLocaleString()}</p>
      </div>

      <div className="glass-panel rounded-2xl p-5 mb-4 space-y-3">
        <div>
          <label className="text-xs text-zinc-500">收款玩家 ID</label>
          <div className="flex gap-2 mt-1">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={idInput}
                onChange={(e) => setIdInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                placeholder="輸入完整 ID（≥ 6 碼）"
                disabled={busy}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-zinc-200 disabled:opacity-50"
              />
            </div>
            <button
              onClick={handleLookup}
              disabled={busy || idInput.length < 6}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 px-4 rounded-lg font-bold min-h-[44px]"
            >
              查詢
            </button>
            <button
              onClick={() => setScanOpen(true)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 rounded-lg border border-zinc-700 min-h-[44px]"
              title="掃 QR Code"
            >
              <QrCode className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-zinc-500 mt-1">出於隱私考量，不顯示玩家清單；需輸入完整 ID 或掃對方 QR</p>
        </div>

        {target && (
          <div className="bg-zinc-950 border border-amber-500/30 rounded-lg p-3 flex items-center justify-between">
            <div>
              <p className="text-amber-400 font-bold">{target.name}</p>
              <p className="text-zinc-500 text-xs font-mono">{target.user_id}</p>
            </div>
            <button onClick={() => { setTarget(null); setIdInput(''); }} className="text-zinc-400 hover:text-zinc-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div>
          <label className="text-xs text-zinc-500">金額</label>
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!target || writeDisabled}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500">備註（選填）</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={!target || writeDisabled}
            maxLength={120}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 disabled:opacity-50"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={busy || !target || !amount || writeDisabled}
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 py-3 rounded-lg font-bold flex items-center justify-center gap-2 min-h-[44px]"
        >
          <Send className="w-4 h-4" />
          {busy ? '處理中…' : '確認轉帳'}
        </button>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${msg.ok ? 'bg-emerald-950/40 border border-emerald-900/60 text-emerald-300' : 'bg-rose-950/40 border border-rose-900/60 text-rose-300'}`}>
          {msg.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {scanOpen && <QrScanModal onClose={() => setScanOpen(false)} onScanned={handleQrScanned} />}
    </div>
  );
}

function QrScanModal({ onClose, onScanned }: { onClose: () => void; onScanned: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!containerRef.current) return;
        const elemId = 'qr-scan-target';
        if (!document.getElementById(elemId)) {
          const div = document.createElement('div');
          div.id = elemId;
          div.style.width = '100%';
          containerRef.current.appendChild(div);
        }
        const qr = new Html5Qrcode(elemId);
        scanner = qr;
        await qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 250 },
          (decoded) => {
            onScanned(decoded);
            qr.stop().then(() => qr.clear()).catch(() => {});
          },
          () => { /* ignore non-decoded frames */ },
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '無法啟動相機';
        setErr(msg);
      }
    })();
    return () => {
      if (scanner) {
        scanner.stop().then(() => scanner!.clear()).catch(() => {});
      }
    };
  }, [onScanned]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 max-w-sm w-full relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-lg font-bold text-zinc-100 mb-3 text-center">掃描對方 QR Code</h3>
        <div ref={containerRef} className="bg-black rounded-lg overflow-hidden min-h-[250px]" />
        {err && <p className="text-rose-400 text-sm mt-3 text-center">{err}</p>}
        <p className="text-xs text-zinc-500 text-center mt-3">把對方手機畫面對準框內</p>
      </div>
    </div>
  );
}
