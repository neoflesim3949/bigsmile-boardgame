import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Wallet, Heart, Sparkles, Scale, RefreshCcw, Package, TrendingUp, Building2, Lock, Settings, Send } from 'lucide-react';
import QrButton from '@/components/QrButton';
import { requireRole } from '@/lib/auth';
import { getSetting } from '@/lib/settings';
import { query } from '@/lib/db';

export default async function PlayerPage() {
  const session = await requireRole('player');

  // Onboarding 守門：CardDrawMode=true 且尚無命格 → 導向 /onboarding。
  // middleware 因 edge runtime 限制不打 DB，故在 page 端 server-side 守門。
  const cardDrawMode = await getSetting('CardDrawMode');
  if (cardDrawMode === 'true') {
    const r = await query<{ destiny_name: string | null }>(
      `SELECT destiny_name FROM "PlayerStats" WHERE user_id = $1`,
      [session.userId],
    );
    if (!r.rows[0]?.destiny_name) redirect('/onboarding');
  }

  return (
    <div className="min-h-screen page-bg p-4 pb-20">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 pl-2 pr-2 mt-2">
        <div>
          <h1 className="text-2xl font-bold text-amber-500">{session.name}</h1>
          <p className="text-zinc-500 text-sm">{session.userId}</p>
        </div>
        <div className="flex items-center gap-2">
          <QrButton />
          <button className="w-10 h-10 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-amber-500 hover:border-amber-500/50 transition-colors">
            <RefreshCcw className="w-4 h-4" />
          </button>
          <Link href="/settings" className="w-10 h-10 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-amber-500 hover:border-amber-500/50 transition-colors">
            <Settings className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Main Stats Grid — 點擊任一張即進入該項明細頁 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {/* Money */}
        <Link href="/history/money" className="glass-panel p-4 rounded-2xl relative overflow-hidden group hover:border-amber-500/40 transition-colors">
          <div className="absolute -right-4 -bottom-4 opacity-5">
            <Wallet className="w-24 h-24" />
          </div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-zinc-400">
              <Wallet className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium">金錢</span>
            </div>
          </div>
          <p className="text-3xl font-bold text-zinc-100">12,500</p>
        </Link>

        {/* Health */}
        <Link href="/history/health" className="glass-panel p-4 rounded-2xl relative overflow-hidden group hover:border-rose-500/40 transition-colors">
          <div className="absolute -right-4 -bottom-4 opacity-5">
            <Heart className="w-24 h-24" />
          </div>
          <div className="flex items-center gap-2 mb-2 text-zinc-400">
            <Heart className="w-4 h-4 text-rose-500" />
            <span className="text-sm font-medium">健康</span>
          </div>
          <p className="text-3xl font-bold text-zinc-100 flex items-end gap-1">
            80 <span className="text-sm text-zinc-500 pb-1">/100</span>
          </p>
        </Link>

        {/* Blessing (Hidden state simulation) */}
        <Link href="/history/blessing" className="glass-panel p-4 rounded-2xl relative overflow-hidden group opacity-60 hover:opacity-90 transition-opacity">
          <div className="absolute -right-4 -bottom-4 opacity-5">
            <Sparkles className="w-24 h-24" />
          </div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-zinc-400">
              <Sparkles className="w-4 h-4 text-teal-400/50" />
              <span className="text-sm font-medium">福分</span>
            </div>
            <Lock className="w-3 h-3 text-zinc-500" />
          </div>
          <p className="text-2xl font-bold text-zinc-500 mt-1">***</p>
        </Link>

        {/* Karma (Hidden state simulation) */}
        <Link href="/history/karma" className="glass-panel p-4 rounded-2xl relative overflow-hidden group opacity-60 hover:opacity-90 transition-opacity">
          <div className="absolute -right-4 -bottom-4 opacity-5">
            <Scale className="w-24 h-24" />
          </div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-zinc-400">
              <Scale className="w-4 h-4 text-purple-500/50" />
              <span className="text-sm font-medium">業力</span>
            </div>
            <Lock className="w-3 h-3 text-zinc-500" />
          </div>
          <p className="text-2xl font-bold text-zinc-500 mt-1">***</p>
        </Link>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-8">
        <Link href="/exchange" className="flex-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-xl py-3 px-2 flex flex-col items-center justify-center gap-1 transition-colors">
          <div className="flex items-center gap-2">
            <RefreshCcw className="w-4 h-4" />
            <span className="font-medium">換匯所</span>
          </div>
          <span className="text-[0.625rem] opacity-70">福分換取金錢</span>
        </Link>
        <Link href="/bank" className="flex-1 bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 border border-zinc-700 rounded-xl py-3 px-2 flex flex-col items-center justify-center gap-1 transition-colors relative overflow-hidden">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-400" />
            <span className="font-medium">銀行借貸</span>
          </div>
          <span className="text-[0.625rem] text-zinc-500">目前借款: 2,000</span>
        </Link>
        <Link href="/transfer" className="flex-1 bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 border border-zinc-700 rounded-xl py-3 px-2 flex flex-col items-center justify-center gap-1 transition-colors">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-amber-400" />
            <span className="font-medium">轉帳</span>
          </div>
          <span className="text-[0.625rem] text-zinc-500">玩家間匯款</span>
        </Link>
      </div>

      {/* Inventory Section */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <Package className="w-5 h-5 text-zinc-500" />
          我的道具
        </h2>
        <div className="space-y-3">
          {/* Item Card */}
          <div className="glass-panel p-4 rounded-xl flex items-center gap-4 border-l-4 border-l-rose-500">
            <div className="w-12 h-12 rounded-lg bg-rose-500/20 flex items-center justify-center text-2xl">
              🏥
            </div>
            <div>
              <h3 className="font-semibold text-zinc-100">手術執照</h3>
              <p className="text-xs text-zinc-500">由 關主 A 發放於 14:20</p>
            </div>
          </div>
          {/* Item Card */}
          <div className="glass-panel p-4 rounded-xl flex items-center gap-4 border-l-4 border-l-amber-500">
            <div className="w-12 h-12 rounded-lg bg-amber-500/20 flex items-center justify-center text-2xl">
              🧧
            </div>
            <div>
              <h3 className="font-semibold text-zinc-100">財神爺 BUFF</h3>
              <p className="text-xs text-zinc-500">由 關主 B 發放於 15:05</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Nav (Mock) */}
      <div className="fixed bottom-0 left-0 right-0 h-16 glass-panel border-t-zinc-800 flex items-center justify-around z-50">
        <Link href="/" className="flex flex-col items-center gap-1 text-amber-500">
          <UserIcon />
          <span className="text-[0.625rem]">我的狀態</span>
        </Link>
        <Link href="/stock" className="flex flex-col items-center gap-1 text-zinc-500 hover:text-amber-500 transition-colors">
          <TrendingUp className="w-5 h-5" />
          <span className="text-[0.625rem]">股市大廳</span>
        </Link>
      </div>
    </div>
  );
}

function UserIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
