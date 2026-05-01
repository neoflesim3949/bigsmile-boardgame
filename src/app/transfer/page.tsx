'use client';

import Link from 'next/link';
import { useState, useRef } from 'react';
import { ArrowLeft, Send, CheckCircle2, AlertCircle, QrCode, Search, X } from 'lucide-react';

// Mock player lookup by exact ID
const PLAYER_DB: Record<string, { name: string; emoji: string }> = {
  'U-2345': { name: '李小華', emoji: '🌸' },
  'U-3456': { name: '陳大偉', emoji: '🦁' },
  'U-4567': { name: '張美玲', emoji: '🌙' },
  'U-5678': { name: '林志遠', emoji: '⚡' },
};

const MY_BALANCE = 12500;
const MY_ID      = 'U-1234';

export default function TransferPage() {
  const [idInput, setIdInput]         = useState('');
  const [recipient, setRecipient]     = useState<{ id: string; name: string; emoji: string } | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [amount, setAmount]           = useState('');
  const [note, setNote]               = useState('');
  const [done, setDone]               = useState(false);
  const [sendError, setSendError]     = useState('');
  const [scanning, setScanning]       = useState(false);

  const numAmount = parseInt(amount, 10) || 0;

  // 查詢 ID
  const handleLookup = (value: string) => {
    const trimmed = value.trim().toUpperCase();
    setIdInput(value);
    setLookupError('');
    setRecipient(null);

    if (trimmed.length < 6) return; // 不足長度不查

    if (trimmed === MY_ID) {
      setLookupError('不可轉帳給自己');
      return;
    }

    const found = PLAYER_DB[trimmed];
    if (found) {
      setRecipient({ id: trimmed, ...found });
    } else if (trimmed.length >= 6) {
      setLookupError('找不到此玩家 ID，請確認輸入');
    }
  };

  // 模擬 QR 掃碼：填入 mock ID
  const handleScan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      handleLookup('U-3456'); // mock scan result
      setIdInput('U-3456');
    }, 1200);
  };

  const handleSend = () => {
    setSendError('');
    if (!recipient)           return setSendError('請先查詢並確認收款玩家');
    if (numAmount <= 0)       return setSendError('請輸入有效金額');
    if (numAmount > MY_BALANCE) return setSendError('餘額不足');
    setDone(true);
    setTimeout(() => setDone(false), 3000);
  };

  return (
    <div className="min-h-screen page-bg flex flex-col max-w-md mx-auto border-x border-theme">
      <header className="p-4 flex items-center gap-4 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <Link href="/" className="w-10 h-10 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-zinc-100">玩家轉帳</h1>
          <p className="text-xs text-zinc-500">可用餘額：{MY_BALANCE.toLocaleString()}</p>
        </div>
      </header>

      <div className="p-4 space-y-5">

        {/* ── Step 1: Enter or Scan ID ───────────────────── */}
        <div>
          <p className="text-sm font-semibold text-zinc-400 mb-2">
            <span className="text-amber-400 font-bold mr-1">1</span> 輸入或掃描收款玩家 ID
          </p>

          <div className="flex gap-2">
            {/* ID Input */}
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-zinc-500" />
              </div>
              <input
                type="text"
                value={idInput}
                onChange={(e) => handleLookup(e.target.value)}
                className="block w-full pl-9 pr-8 py-3 border border-zinc-700 rounded-xl bg-zinc-900/60 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 text-sm font-mono transition-colors uppercase"
                placeholder="U-0000"
                maxLength={8}
              />
              {idInput && (
                <button
                  onClick={() => { setIdInput(''); setRecipient(null); setLookupError(''); }}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-600 hover:text-zinc-300"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Scan Button */}
            <button
              onClick={handleScan}
              className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-all ${
                scanning
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-400 animate-pulse'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-amber-500/50 hover:text-amber-400'
              }`}
              title="掃描 QR Code"
            >
              <QrCode className="w-5 h-5" />
            </button>
          </div>

          {/* Status messages */}
          {scanning && (
            <p className="mt-2 text-xs text-amber-400 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 bg-amber-400 rounded-full animate-ping" />
              掃描中...
            </p>
          )}

          {/* Recipient Card — 只有查到才顯示 */}
          {recipient && !scanning && (
            <div className="mt-3 flex items-center gap-3 bg-emerald-950/30 border border-emerald-600/40 rounded-xl px-4 py-3">
              <span className="text-2xl">{recipient.emoji}</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-zinc-100">{recipient.name}</p>
                <p className="text-xs text-zinc-500">{recipient.id}</p>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            </div>
          )}

          {/* Lookup error */}
          {lookupError && !scanning && (
            <div className="mt-2 flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {lookupError}
            </div>
          )}
        </div>

        {/* ── Step 2: Amount ────────────────────────────── */}
        <div>
          <p className="text-sm font-semibold text-zinc-400 mb-2">
            <span className="text-amber-400 font-bold mr-1">2</span> 輸入金額
          </p>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-zinc-500 font-bold text-sm pointer-events-none">$</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              max={MY_BALANCE}
              className="block w-full pl-8 pr-4 py-3.5 border border-zinc-700 rounded-xl bg-zinc-900/60 text-zinc-100 text-xl font-bold focus:outline-none focus:border-amber-500/50 transition-colors placeholder-zinc-700"
              placeholder="0"
            />
          </div>
          <div className="flex gap-2 mt-2">
            {[100, 500, 1000, 3000].map((v) => (
              <button
                key={v}
                onClick={() => setAmount(String(v))}
                className="flex-1 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs font-medium hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
              >
                {v.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* ── Step 3: Note ──────────────────────────────── */}
        <div>
          <p className="text-sm font-semibold text-zinc-400 mb-2">
            <span className="text-amber-400 font-bold mr-1">3</span> 備註（選填）
          </p>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={30}
            className="block w-full px-4 py-3 border border-zinc-700 rounded-xl bg-zinc-900/60 text-zinc-300 text-sm focus:outline-none focus:border-amber-500/50 transition-colors placeholder-zinc-600"
            placeholder="輸入備註..."
          />
        </div>

        {/* Preview */}
        {recipient && numAmount > 0 && (
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">轉帳確認</p>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">收款方</span>
              <span className="font-bold text-zinc-100">{recipient.emoji} {recipient.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">轉出金額</span>
              <span className="font-bold text-amber-400">− {numAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-zinc-800 pt-2">
              <span className="text-zinc-400">轉帳後餘額</span>
              <span className={`font-bold ${MY_BALANCE - numAmount < 0 ? 'text-rose-400' : 'text-zinc-100'}`}>
                {(MY_BALANCE - numAmount).toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* Send error */}
        {sendError && (
          <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {sendError}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleSend}
          className={`w-full py-4 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 ${
            done
              ? 'bg-emerald-400 text-zinc-950 shadow-[0_0_20px_rgba(52,211,153,0.4)]'
              : 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
          }`}
        >
          {done
            ? <><CheckCircle2 className="w-5 h-5" /> 轉帳成功！</>
            : <><Send className="w-4 h-4" /> 確認轉帳</>}
        </button>
      </div>
    </div>
  );
}
