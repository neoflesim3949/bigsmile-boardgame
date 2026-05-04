'use client';

import Link from 'next/link';
import { useState, useTransition, useEffect, useRef } from 'react';
import {
  Wallet, Heart, Sparkles, Scale, Star, RefreshCcw, Package, TrendingUp,
  Building2, Lock, Settings, Send, Skull, AlertCircle, CheckCircle2, Download,
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
  const [showFinalModal, setShowFinalModal] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // 終局結算後揭曉成績彈窗：每次回首頁都顯示，玩家可勾「不再顯示」永久關掉（localStorage 跟著 final_scoring_at 時間戳，之後若 admin 重啟新場次會自動重置）
  useEffect(() => {
    if (!stats.final_scoring_at) {
      setShowFinalModal(false);
      return;
    }
    try {
      const key = `final_score_dismissed_${stats.user_id}`;
      const dismissedAt = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
      // 用 final_scoring_at 當 versioning — 不同場次 / admin 重啟新場次後會重設
      if (dismissedAt !== stats.final_scoring_at) {
        setShowFinalModal(true);
      }
    } catch {
      // localStorage 不可用 → 仍顯示（保守做法）
      setShowFinalModal(true);
    }
  }, [stats.final_scoring_at, stats.user_id]);

  function dismissFinalModal(remember: boolean) {
    if (remember && stats.final_scoring_at) {
      try {
        localStorage.setItem(`final_score_dismissed_${stats.user_id}`, stats.final_scoring_at);
      } catch { /* ignore */ }
    }
    setShowFinalModal(false);
  }

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
  // 導覽模式下不顯示地獄畫面（admin 在示範時可切到 dead state 看數值畫面）
  // 終局結算後不再顯示地獄畫面（讓玩家回玩家中心查看明細，所有寫入已被後端 assertNotDuringFinalScoring 擋）
  if (stats.is_dead && !stats.tour_mode && !stats.final_scoring_at) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <Skull className="w-16 h-16 text-rose-500 mb-4 animate-pulse" />
        <h1 className="text-3xl font-bold text-rose-400 mb-2">你已下地獄</h1>
        <p className="text-zinc-400 max-w-sm mb-6">
          {stats.show_all_stats
            ? (stats.health <= 0 && stats.blessing <= 0
                ? '健康與福分均歸零'
                : stats.health <= 0
                  ? '健康歸零'
                  : '福分歸零')
            : (stats.health <= 0
                ? '健康歸零'
                : '指標已歸零')}
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
      <header className="flex justify-between items-center mb-4 pl-2 pr-2 mt-2">
        <div className="min-w-0 flex-1 flex items-baseline gap-2">
          <h1 className="text-2xl font-bold text-amber-500 truncate">{stats.name}</h1>
          <span className="text-zinc-600">｜</span>
          <p className="text-zinc-500 text-sm truncate">ID:{stats.user_id}</p>
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

      {stats.tour_mode && (
        <div className="bg-sky-950/40 border border-sky-700/60 text-sky-300 rounded-xl p-3 mb-4 text-sm text-center">
          🧭 導覽模式中 — 你可以瀏覽所有頁面，但所有寫入動作（換匯 / 轉帳 / 股市 / 借貸）都會被擋
        </div>
      )}
      {!stats.game_enabled && !stats.tour_mode && (
        <div className="bg-amber-950/30 border border-amber-900/60 text-amber-300 rounded-xl p-3 mb-4 text-sm text-center">
          活動尚未開始，所有寫入操作停用
        </div>
      )}
      {stats.final_scoring_at && (
        <div className="bg-rose-950/30 border border-rose-900/60 text-rose-300 rounded-xl p-3 mb-4 text-sm text-center">
          終局結算已觸發，玩家寫入停用
        </div>
      )}

      {/* 命格 + 狀態（永遠顯示，依各自 theme 套色）*/}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {(() => {
          const dt = themeStyle(stats.destiny_theme);
          return (
            <div className={`glass-panel p-4 rounded-2xl relative overflow-hidden border ${dt.card}`}>
              <div className={`absolute -right-4 -bottom-4 opacity-10 ${dt.text}`}><Star className="w-24 h-24" /></div>
              <div className="flex items-center gap-2 mb-1.5 text-zinc-400">
                <Star className={`w-4 h-4 ${dt.text}`} />
                <span className="text-sm font-medium">命格</span>
              </div>
              <p className={`text-xl font-bold truncate ${dt.text}`}>
                {stats.destiny_name ?? '—'}
              </p>
            </div>
          );
        })()}
        {(() => {
          const kt = themeStyle(stats.karma_band_theme);
          return (
            <div className={`glass-panel p-4 rounded-2xl relative overflow-hidden border ${kt.card}`}>
              <div className={`absolute -right-4 -bottom-4 opacity-10 ${kt.text}`}><Scale className="w-24 h-24" /></div>
              <div className="flex items-center gap-2 mb-1.5 text-zinc-400">
                <Scale className={`w-4 h-4 ${kt.text}`} />
                <span className="text-sm font-medium">狀態</span>
              </div>
              <p className={`text-xl font-bold truncate ${kt.text}`}>
                {stats.karma_band_label ?? '—'}
              </p>
            </div>
          );
        })()}
      </div>

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

        {/* 福分 / 業力：ShowAllStats=true 或 終局結算後 都顯示（V2 §6.2 規格：玩家最終結算後可見） */}
        {(stats.show_all_stats || stats.final_scoring_at) ? (
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

      {/* Action shortcuts — 終局結算後改 disabled 占位（後端 assertNotDuringFinalScoring 也會擋）*/}
      <div className="flex gap-3 mb-8">
        {stats.final_scoring_at ? (
          <>
            <DisabledAction icon={<RefreshCcw className="w-4 h-4" />} label="換匯所" />
            <DisabledAction icon={<Building2 className="w-4 h-4" />} label="銀行借貸" />
            <DisabledAction icon={<Send className="w-4 h-4" />} label="轉帳" />
          </>
        ) : (
          <>
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
          </>
        )}
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

      {showFinalModal && stats.final_scoring_at && (
        <FinalScoreModal stats={stats} onDismiss={dismissFinalModal} />
      )}
    </div>
  );
}

function DisabledAction({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      title="活動已結束，操作停用"
      className="flex-1 bg-zinc-900/60 text-zinc-600 border border-zinc-800 rounded-xl py-3 px-2 flex flex-col items-center justify-center gap-1 min-h-[44px] cursor-not-allowed select-none"
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-medium">{label}</span>
      </div>
      <span className="text-[0.625rem]">已結算停用</span>
    </div>
  );
}

function FinalScoreModal({
  stats, onDismiss,
}: {
  stats: PlayerStatsView;
  onDismiss: (remember: boolean) => void;
}) {
  const [remember, setRemember] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const dt = themeStyle(stats.destiny_theme);
  const kt = themeStyle(stats.karma_band_theme);
  const rankClass = stats.final_rank === 1 ? 'text-yellow-300'
    : stats.final_rank === 2 ? 'text-zinc-200'
    : stats.final_rank === 3 ? 'text-amber-500'
    : 'text-zinc-400';
  const medalEmoji = stats.final_rank === 1 ? '🥇'
    : stats.final_rank === 2 ? '🥈'
    : stats.final_rank === 3 ? '🥉'
    : '🏅';

  async function handleDownload() {
    if (!captureRef.current || downloading) return;
    setDownloading(true);
    try {
      // Dynamic import — html-to-image 只在使用者點下載才載入，不影響首頁初始 bundle
      const { toPng } = await import('html-to-image');
      // 強制深色背景 + 2x DPI，避免 user 使用淺色主題時截圖背景太淡
      const dataUrl = await toPng(captureRef.current, {
        pixelRatio: 2,
        backgroundColor: '#18181b',
        cacheBust: true,
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `開運大富翁_${stats.name}_第${stats.final_rank}名.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error('download failed', e);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/85 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border-2 border-amber-500/40 rounded-2xl shadow-[0_0_60px_rgba(245,158,11,0.25)] p-6 max-w-md w-full max-h-[90vh] overflow-y-auto relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 rounded-t-2xl"></div>

        {/* 下載截圖目標：包含成績核心資訊（不含 checkbox / 按鈕）*/}
        <div ref={captureRef} className="bg-zinc-900 p-1">
        <div className="text-center mb-5">
          <p className="text-3xl mb-2">🎉</p>
          <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500">
            成績揭曉
          </h2>
          <p className="text-xs text-zinc-500 mt-1">活動已結束，恭喜完成這場開運大富翁</p>
        </div>

        {/* 排名大字 — 標籤字級對齊「確認」button (text-base) */}
        <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-5 text-center mb-4">
          <p className="text-base text-zinc-500 mb-1">你的排名</p>
          <p className={`text-6xl font-black ${rankClass} flex items-center justify-center gap-2`}>
            <span>{medalEmoji}</span>
            <span>第 {stats.final_rank}</span>
          </p>
          <p className="text-zinc-500 text-base mt-1">/ 共 {stats.total_players} 位玩家</p>
          <div className="mt-4 pt-4 border-t border-zinc-800/60">
            <p className="text-base text-zinc-500 mb-1">最終分數</p>
            <p className="text-4xl font-black text-amber-400">{stats.final_score.toLocaleString()}</p>
          </div>
        </div>

        {/* 命格 / 狀態 + 四項數值（每格用各自色系半透明底 + base 字級，淺色模式也清晰）*/}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className={`rounded-lg p-3 border ${dt.card}`}>
            <p className="text-zinc-500 text-sm mb-1">命格</p>
            <p className={`font-bold text-base ${dt.text}`}>{stats.destiny_name ?? '—'}</p>
          </div>
          <div className={`rounded-lg p-3 border ${kt.card}`}>
            <p className="text-zinc-500 text-sm mb-1">狀態</p>
            <p className={`font-bold text-base ${kt.text}`}>{stats.karma_band_label ?? '—'}</p>
          </div>
          <div className="rounded-lg p-3 bg-amber-500/10 border border-amber-500/30">
            <p className="text-zinc-500 text-sm mb-1">金錢</p>
            <p className="font-bold text-base text-amber-400">${stats.money.toLocaleString()}</p>
          </div>
          <div className="rounded-lg p-3 bg-rose-500/10 border border-rose-500/30">
            <p className="text-zinc-500 text-sm mb-1">健康</p>
            <p className="font-bold text-base text-rose-400">{stats.health}/100</p>
          </div>
          <div className="rounded-lg p-3 bg-teal-500/10 border border-teal-500/30">
            <p className="text-zinc-500 text-sm mb-1">福分</p>
            <p className="font-bold text-base text-teal-400">{stats.blessing}</p>
          </div>
          <div className="rounded-lg p-3 bg-purple-500/10 border border-purple-500/30">
            <p className="text-zinc-500 text-sm mb-1">業力</p>
            <p className="font-bold text-base text-purple-400">{stats.karma}</p>
          </div>
        </div>

        <p className="text-xs text-zinc-500 text-center mb-2 italic">
          點下方四項數值卡片可查看完整明細，回顧整局的大起大落
        </p>
        </div>
        {/* /capture region — 下方按鈕 / checkbox 不會出現在截圖 */}

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full mt-3 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-zinc-200 font-bold py-2.5 rounded-xl transition-colors min-h-[44px] flex items-center justify-center gap-2 border border-zinc-700"
        >
          <Download className="w-4 h-4" />
          {downloading ? '產生圖片中…' : '下載成績圖片'}
        </button>

        <label className="flex items-center gap-2 text-xs text-zinc-400 mt-4 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="accent-amber-500"
          />
          不再顯示此彈窗（直到下一場活動）
        </label>

        <button
          onClick={() => onDismiss(remember)}
          className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold py-3 rounded-xl transition-colors min-h-[44px] shadow-[0_0_20px_rgba(245,158,11,0.3)]"
        >
          確認
        </button>
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

/**
 * 6 色系 palette — 玩家首頁命格 / 狀態卡通用
 * - 命格卡讀 stats.destiny_theme（從 InitialValueTemplate.theme，fallback 'amber'）
 * - 狀態卡讀 stats.karma_band_theme（從 KarmaBand.theme，fallback 'zinc'）
 * - admin 在 /admin/settings 命格範本 / 業力影響 各自設 theme
 */
const THEME_PALETTE: Record<string, { card: string; text: string }> = {
  amber: { card: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-400' },
  teal: { card: 'bg-teal-500/10 border-teal-500/30', text: 'text-teal-400' },
  purple: { card: 'bg-purple-500/10 border-purple-500/30', text: 'text-purple-400' },
  rose: { card: 'bg-rose-500/10 border-rose-500/30', text: 'text-rose-400' },
  sky: { card: 'bg-sky-500/10 border-sky-500/30', text: 'text-sky-400' },
  zinc: { card: 'bg-zinc-700/30 border-zinc-600/40', text: 'text-zinc-200' },
};
function themeStyle(theme: string): { card: string; text: string } {
  return THEME_PALETTE[theme] ?? THEME_PALETTE.zinc;
}
