import Link from 'next/link';
import { QrCode, Power, Settings2, Plus, Zap } from 'lucide-react';

export default function CaptainPage() {
  return (
    <div className="min-h-screen bg-zinc-950 p-4 pb-20 max-w-md mx-auto relative border-x border-zinc-900">
      <header className="flex justify-between items-center mb-8 pt-4">
        <div>
          <h1 className="text-2xl font-bold text-teal-400">關主 01</h1>
          <p className="text-zinc-500 text-sm">負責站點: 命運大轉盤</p>
        </div>
        <button className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-rose-500 transition-colors">
          <Power className="w-5 h-5" />
        </button>
      </header>

      {/* Main Action - Scan */}
      <Link href="/captain/scan" className="group relative block w-full mb-10">
        <div className="absolute inset-0 bg-teal-500/20 blur-xl group-hover:bg-teal-500/30 transition-colors rounded-[3rem]"></div>
        <div className="relative glass-panel rounded-[3rem] aspect-square flex flex-col items-center justify-center border-teal-500/30 group-hover:border-teal-500/60 transition-colors shadow-[0_0_30px_rgba(20,184,166,0.1)]">
          <div className="w-24 h-24 mb-4 rounded-full bg-teal-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
            <QrCode className="w-12 h-12 text-teal-400" />
          </div>
          <h2 className="text-2xl font-bold text-zinc-100">掃描玩家 QR</h2>
          <p className="text-zinc-400 mt-2">進入掃描器以發放點數或道具</p>
        </div>
      </Link>

      <div className="flex justify-between items-end mb-4">
        <h3 className="text-lg font-semibold text-zinc-300 flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" />
          快捷功能模組
        </h3>
        <Link href="/captain/actions" className="text-zinc-400 hover:text-teal-400 flex items-center gap-1 text-sm bg-zinc-800/50 px-3 py-1 rounded-full border border-zinc-800">
          <Settings2 className="w-4 h-4" /> 管理
        </Link>
      </div>

      <div className="space-y-3">
        {/* Quick Action Card */}
        <div className="glass-panel p-4 rounded-xl flex items-center justify-between border-l-4 border-l-teal-500">
          <div>
            <h4 className="font-semibold text-zinc-100 mb-1">任務通關獎勵</h4>
            <div className="flex gap-2 text-xs">
              <span className="text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">金錢 +50</span>
              <span className="text-teal-400 bg-teal-400/10 px-2 py-0.5 rounded">福分 +2</span>
            </div>
          </div>
        </div>

        {/* Quick Action Card */}
        <div className="glass-panel p-4 rounded-xl flex items-center justify-between border-l-4 border-l-rose-500">
          <div>
            <h4 className="font-semibold text-zinc-100 mb-1">任務失敗扣除</h4>
            <div className="flex gap-2 text-xs">
              <span className="text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded">健康 -5</span>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
