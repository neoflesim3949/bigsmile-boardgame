'use client';

import Link from 'next/link';
import { useState, useTransition, useEffect } from 'react';
import {
  Wallet, Heart, Sparkles, Scale, RefreshCcw, Package, TrendingUp,
  Building2, Lock, Settings, Send, Skull, AlertCircle, CheckCircle2,
} from 'lucide-react';
import QrButton from '@/components/QrButton';
import { getMyStats, type PlayerStatsView, type PlayerItemView } from '@/app/actions/player';

interface Props {
  initialStats: PlayerStatsView;
  initialItems: PlayerItemView[];
}

export default function PlayerHomeClient({ initialStats, initialItems }: Props) {
  const [stats, setStats] = useState<PlayerStatsView>(initialStats);
  const [items, setItems] = useState<PlayerItemView[]>(initialItems);
  const [pending, startTransition] = useTransition();
  const [cooldown, setCooldown] = useState<number>(initialStats.refresh_remaining_seconds);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  }

  function handleRefresh() {
    if (cooldown > 0 || pending) return;
    startTransition(async () => {
      const r = await getMyStats(true);
      if (r.ok) {
        setStats(r.data!.stats);
        setItems(r.data!.items);
        setCooldown(r.data!.stats.refresh_cooldown_seconds);
      } else {
        if (r.error?.code === 'REFRESH_RATE_LIMITED') {
          setCooldown(stats.refresh_cooldown_seconds);
        }
        showToast(false, r.error?.message ?? '刷新失敗');
      }
    });
  }

  // ─── 地獄畫面 ────────────────────────────────────────────────
  if (stats.is_dead) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <Skull className="w-16 h-16 text-rose-500 mb-4 animate-pulse" />
        <h1 className="text-3xl font-bold text-rose-400 mb-2">你已下地獄</h1>
        <p className="text-zinc-400 max-w-sm mb-6">
          {stats.health <= 0 && stats.blessing <= 0
            ? '健康與福分均歸零'
            : stats.health <= 0
              ? '健康歸零'
              : '福分歸零'}
          ，所有功能停用。請找擁有「重生鍵」的關主掃描你的 QR Code 執行重生。
        </p>
        <div className="bg-zinc-900 border border-rose-900/40 rounded-2xl p-6 mb-4">
          <QrButton name={stats.name} userId={stats.user_id} />
          <p className="text-xs text-zinc-500 mt-3">點擊上方按鈕展示你的 QR Code</p>
        </div>
        <p className="text-xs text-zinc-600">{stats.name} · {stats.user_id}</p>
      </div>
    );
  }

  // ─── 正常畫面 ────────────────────────────────────────────────
  return (
    <div className="min-h-screen page-bg p-4 pb-20">
      <header className="flex justify-between items-center mb-6 pl-2 pr-2 mt-2">
        <div>
          <h1 className="text-2xl font-bold text-amber-500">{stats.name}</h1>
          <p className="text-zinc-500 text-sm">{stats.user_id}</p>
          {stats.destiny_name && <p className="text-xs text-zinc-500 mt-0.5">命格：{stats.destiny_name}</p>}
        </div>
        <div className="flex items-center gap-2">
          <QrButton name={stats.name} userId={stats.user_id} />
          <button
            onClick={handleRefresh}
            disabled={cooldown > 0 || pending}
            className="relative w-10 h-10 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-amber-500 hover:border-amber-500/50 transition-colors disabled:opacity-60"
            title={cooldown > 0 ? `冷卻 ${cooldown}s` : '重新整理'}
          >
            {cooldown > 0 ? (
              <span className="text-[0.625rem] font-bold">{cooldown}</span>
            ) : (
              <RefreshCcw className={`w-4 h-4 ${pending ? 'animate-spin' : ''}`} />
            )}
          </button>
          <Link href="/settings" className="w-10 h-10 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-amber-500 hover:border-amber-500/50 transition-colors">
            <Settings className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {!stats.game_enabled && (
        <div className="bg-amber-950/30 border border-amber-900/60 text-amber-300 rounded-xl p-3 mb-4 text-sm text-center">
          活動尚未開始，所有寫入操作停用
        </div>
      )}
      {stats.final_scoring_at && (
        <div className="bg-rose-950/30 border border-rose-900/60 text-rose-300 rounded-xl p-3 mb-4 text-sm text-center">
          終局結算已觸發，玩家寫入停用
        </div>
      )}

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link href="/history/money" className="glass-panel p-4 rounded-2xl relative overflow-hidden group hover:border-amber-500/40 transition-colors">
          <div className="absolute -right-4 -bottom-4 opacity-5"><Wallet className="w-24 h-24" /></div>
          <div className="flex items-center gap-2 mb-2 text-zinc-400">
            <Wallet className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium">金錢</span>
          </div>
          <p className="text-3xl font-bold text-zinc-100">{stats.money.toLocaleString()}</p>
          {stats.bank_loan > 0 && (
            <p className="text-xs text-rose-400 mt-1">借款 {stats.bank_loan.toLocaleString()}</p>
          )}
        </Link>

        <Link href="/history/health" className="glass-panel p-4 rounded-2xl relative overflow-hidden group hover:border-rose-500/40 transition-colors">
          <div className="absolute -right-4 -bottom-4 opacity-5"><Heart className="w-24 h-24" /></div>
          <div className="flex items-center gap-2 mb-2 text-zinc-400">
            <Heart className="w-4 h-4 text-rose-500" />
            <span className="text-sm font-medium">健康</span>
          </div>
          <p className="text-3xl font-bold text-zinc-100 flex items-end gap-1">
            {stats.health}<span className="text-sm text-zinc-500 pb-1">/100</span>
          </p>
        </Link>

        {stats.show_all_stats ? (
          <>
            <Link href="/history/blessing" className="glass-panel p-4 rounded-2xl relative overflow-hidden group hover:border-teal-500/40 transition-colors">
              <div className="absolute -right-4 -bottom-4 opacity-5"><Sparkles className="w-24 h-24" /></div>
              <div className="flex items-center gap-2 mb-2 text-zinc-400">
                <Sparkles className="w-4 h-4 text-teal-400" />
                <span className="text-sm font-medium">福分</span>
              </div>
              <p className="text-3xl font-bold text-zinc-100">{stats.blessing}</p>
            </Link>
            <Link href="/history/karma" className="glass-panel p-4 rounded-2xl relative overflow-hidden group hover:border-purple-500/40 transition-colors">
              <div className="absolute -right-4 -bottom-4 opacity-5"><Scale className="w-24 h-24" /></div>
              <div className="flex items-center gap-2 mb-2 text-zinc-400">
                <Scale className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium">業力</span>
              </div>
              <p className="text-3xl font-bold text-zinc-100">{stats.karma}</p>
            </Link>
          </>
        ) : (
          <>
            <div className="glass-panel p-4 rounded-2xl relative overflow-hidden opacity-60">
              <div className="flex items-center justify-between mb-2 text-zinc-400">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-400/50" />
                  <span className="text-sm font-medium">福分</span>
                </div>
                <Lock className="w-3 h-3 text-zinc-500" />
              </div>
              <p className="text-2xl font-bold text-zinc-500 mt-1">***</p>
            </div>
            <div className="glass-panel p-4 rounded-2xl relative overflow-hidden opacity-60">
              <div className="flex items-center justify-between mb-2 text-zinc-400">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-purple-400/50" />
                  <span className="text-sm font-medium">業力</span>
                </div>
                <Lock className="w-3 h-3 text-zinc-500" />
              </div>
              <p className="text-2xl font-bold text-zinc-500 mt-1">***</p>
            </div>
          </>
        )}
      </div>

      {/* Action shortcuts */}
      <div className="flex gap-3 mb-8">
        <Link href="/exchange" className="flex-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-xl py-3 px-2 flex flex-col items-center justify-center gap-1 transition-colors min-h-[44px]">
          <div className="flex items-center gap-2">
            <RefreshCcw className="w-4 h-4" />
            <span className="font-medium">換匯所</span>
          </div>
          <span className="text-[0.625rem] opacity-70">兌換金錢</span>
        </Link>
        <Link href="/bank" className="flex-1 bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 border border-zinc-700 rounded-xl py-3 px-2 flex flex-col items-center justify-center gap-1 transition-colors min-h-[44px]">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-400" />
            <span className="font-medium">銀行借貸</span>
          </div>
          <span className="text-[0.625rem] text-zinc-500">借款 {stats.bank_loan.toLocaleString()}</span>
        </Link>
        <Link href="/transfer" className="flex-1 bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 border border-zinc-700 rounded-xl py-3 px-2 flex flex-col items-center justify-center gap-1 transition-colors min-h-[44px]">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-amber-400" />
            <span className="font-medium">轉帳</span>
          </div>
          <span className="text-[0.625rem] text-zinc-500">玩家間匯款</span>
        </Link>
      </div>

      {/* Items */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <Package className="w-5 h-5 text-zinc-500" />
          我的道具 <span className="text-zinc-500 text-sm font-normal">({items.length})</span>
        </h2>
        <div className="space-y-3">
          {items.map((it) => (
            <div key={it.item_id} className="glass-panel p-4 rounded-xl flex items-center gap-4 border-l-4 border-l-amber-500">
              <div className="w-12 h-12 rounded-lg bg-amber-500/20 flex items-center justify-center text-2xl">
                {it.icon || '🎁'}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-zinc-100 truncate">{it.name}</h3>
                <p className="text-xs text-zinc-500 truncate">{it.description}</p>
                <p className="text-xs text-zinc-600 mt-0.5">取得於 {new Date(it.granted_at).toLocaleString()}</p>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-zinc-500 text-sm text-center py-6">尚無道具</p>
          )}
        </div>
      </div>

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

      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 ${toast.ok ? 'bg-zinc-900 border-amber-500/40 text-amber-300' : 'bg-rose-950 border-rose-700 text-rose-300'} border px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-40 text-sm`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
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
