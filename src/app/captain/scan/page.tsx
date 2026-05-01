'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Wallet, Heart, Sparkles, Scale, ListChecks, UserCheck, X } from 'lucide-react';

interface InProgressPlayer {
  id: number;
  name: string;
  emoji: string;
  module: string;
}

const INITIAL_IN_PROGRESS: InProgressPlayer[] = [
  { id: 1, name: '李小華', emoji: '🌸', module: '命運輪盤' },
  { id: 2, name: '陳大偉', emoji: '🦁', module: '財富試煉' },
];

export default function CaptainScanPage() {
  const [inProgressList, setInProgressList] = useState<InProgressPlayer[]>(INITIAL_IN_PROGRESS);
  const [selectedModule, setSelectedModule] = useState<string | null>('任務通關獎勵');
  const [justAdded, setJustAdded] = useState(false);

  const handleSettle = (id: number) => {
    setInProgressList((prev) => prev.filter((p) => p.id !== id));
  };

  const handleAddToList = () => {
    const newEntry: InProgressPlayer = {
      id: Date.now(),
      name: '王小明',
      emoji: '👑',
      module: selectedModule ?? '任務通關獎勵',
    };
    setInProgressList((prev) => [newEntry, ...prev]);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col max-w-md mx-auto relative border-x border-zinc-900">
      <header className="p-4 flex items-center gap-4 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <Link
          href="/captain"
          className="w-10 h-10 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold text-zinc-100">掃描玩家</h1>
      </header>

      {/* ── In-Progress List ─────────────────────────────── */}
      <div className="p-4 border-b border-zinc-800/60">
        <div className="flex items-center gap-2 mb-3">
          <ListChecks className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-zinc-300">進行中列表</h2>
          <span className="ml-auto text-xs bg-amber-500/20 text-amber-400 rounded-full px-2 py-0.5 font-medium">
            {inProgressList.length} 人
          </span>
        </div>

        {inProgressList.length === 0 ? (
          <p className="text-center text-zinc-600 text-xs py-3">目前無進行中的玩家</p>
        ) : (
          <div className="space-y-2">
            {inProgressList.map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-3 bg-zinc-900/70 border border-zinc-800 rounded-xl px-3 py-2.5"
              >
                <span className="text-lg">{player.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-100 truncate">{player.name}</p>
                  <p className="text-xs text-zinc-500">{player.module}</p>
                </div>
                <button
                  onClick={() => handleSettle(player.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/25 hover:border-emerald-500/60 transition-all active:scale-95"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  完成結算
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Mock Camera View ─────────────────────────────── */}
      <div className="relative aspect-square w-full bg-zinc-900 flex flex-col items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2070&auto=format&fit=crop')] bg-cover opacity-20 filter grayscale blur-sm" />

        <div className="relative z-10 w-56 h-56 border-2 border-teal-500/50 rounded-xl flex items-center justify-center">
          <div className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-teal-400 rounded-tl-xl" />
          <div className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-teal-400 rounded-tr-xl" />
          <div className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-teal-400 rounded-bl-xl" />
          <div className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-teal-400 rounded-br-xl" />
          <div
            className="absolute left-0 w-full h-0.5 bg-teal-400 shadow-[0_0_12px_rgba(45,212,191,0.8)] animate-pulse rounded-full"
            style={{ top: '50%' }}
          />
        </div>
        <p className="relative z-10 mt-5 text-zinc-400 font-medium text-sm">請將玩家 QR Code 放於框內</p>
      </div>

      {/* ── Scan Result ──────────────────────────────────── */}
      <div className="flex-1 bg-zinc-950 p-4 rounded-t-3xl -mt-6 z-20 relative border-t border-zinc-800 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto mb-5" />

        {/* Player Card */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center border border-amber-500/50 text-xl">
            👑
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              王小明 <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </h2>
            <p className="text-zinc-500 text-sm">掃描結果</p>
          </div>
        </div>

        {/* Stats Grid — no stock info per captain requirement */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          <div className="bg-zinc-900 rounded-lg p-2 flex flex-col items-center">
            <Wallet className="w-4 h-4 text-amber-500 mb-1" />
            <span className="text-[0.625rem] text-zinc-500">金錢</span>
            <span className="text-sm font-bold text-zinc-100">12K</span>
          </div>
          <div className="bg-zinc-900 rounded-lg p-2 flex flex-col items-center">
            <Heart className="w-4 h-4 text-rose-500 mb-1" />
            <span className="text-[0.625rem] text-zinc-500">健康</span>
            <span className="text-sm font-bold text-zinc-100">80</span>
          </div>
          <div className="bg-zinc-900 rounded-lg p-2 flex flex-col items-center">
            <Sparkles className="w-4 h-4 text-teal-400 mb-1" />
            <span className="text-[0.625rem] text-zinc-500">福分</span>
            <span className="text-sm font-bold text-zinc-100">15</span>
          </div>
          <div className="bg-zinc-900 rounded-lg p-2 flex flex-col items-center">
            <Scale className="w-4 h-4 text-purple-500 mb-1" />
            <span className="text-[0.625rem] text-zinc-500">業力</span>
            <span className="text-sm font-bold text-zinc-100">5</span>
          </div>
        </div>

        {/* Module Selection */}
        <h3 className="text-sm font-semibold text-zinc-400 mb-3">選擇套用模組</h3>
        <div className="space-y-2 mb-5">
          {[
            { label: '任務通關獎勵', tags: [{ text: '金錢 +50', color: 'text-amber-500 bg-amber-500/10' }, { text: '福分 +2', color: 'text-teal-400 bg-teal-400/10' }] },
            { label: '命運輪盤', tags: [{ text: '業力 ±隨機', color: 'text-purple-400 bg-purple-500/10' }] },
            { label: '手動輸入調整...', tags: [] },
          ].map((mod) => (
            <button
              key={mod.label}
              onClick={() => setSelectedModule(mod.label)}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                selectedModule === mod.label
                  ? 'border-teal-500/60 bg-teal-500/10'
                  : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/30'
              }`}
            >
              <h4 className="font-semibold text-zinc-100 mb-1 text-sm">{mod.label}</h4>
              {mod.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {mod.tags.map((t) => (
                    <span key={t.text} className={`text-xs px-2 py-0.5 rounded ${t.color}`}>
                      {t.text}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* CTA — Add to In-Progress list */}
        <button
          onClick={handleAddToList}
          className={`w-full font-bold py-4 rounded-xl transition-all transform active:scale-95 ${
            justAdded
              ? 'bg-emerald-500 text-zinc-950 shadow-[0_0_20px_rgba(52,211,153,0.4)]'
              : 'bg-teal-500 hover:bg-teal-400 text-zinc-950 shadow-[0_0_20px_rgba(20,184,166,0.3)]'
          }`}
        >
          {justAdded ? '✓ 已加入進行列表！' : '加入進行列表（執行）'}
        </button>
      </div>
    </div>
  );
}
