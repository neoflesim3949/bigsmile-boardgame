'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  Users, Users2, MapPin, Package, Activity,
  Sparkles, Trophy, Play, RefreshCw, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { triggerFinalScoring, getAdminDashboard, type AdminDashboardData } from '@/app/actions/admin';
import { tickRound } from '@/app/actions/round';

interface Props { initial: AdminDashboardData }

export default function AdminDashboardClient({ initial }: Props) {
  const [data, setData] = useState<AdminDashboardData>(initial);
  const [busy, busyTransition] = useTransition();
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3000);
  }

  function handleRefresh() {
    busyTransition(async () => {
      const r = await getAdminDashboard();
      if (r.ok) {
        setData(r.data!);
        showToast(true, '已更新');
      }
    });
  }

  function handleTick() {
    busyTransition(async () => {
      const r = await tickRound();
      if (r.ok) {
        showToast(true, `已推進到第 ${r.data!.round} 回合（結算 ${r.data!.players_settled} 位借款玩家）`);
        const dr = await getAdminDashboard();
        if (dr.ok) setData(dr.data!);
      } else showToast(false, r.error?.message ?? '');
    });
  }

  function handleTriggerScoring() {
    if (!confirm('確定觸發終局結算？此操作會凍結遊戲狀態並產出排行榜。\n觸發後玩家無法再執行寫入操作。')) return;
    busyTransition(async () => {
      const r = await triggerFinalScoring();
      if (r.ok) {
        showToast(true, '終局結算已觸發');
        const dr = await getAdminDashboard();
        if (dr.ok) setData(dr.data!);
      } else showToast(false, r.error?.message ?? '');
    });
  }

  return (
    <div className="p-8 max-w-7xl mx-auto pb-20">
      <header className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">大會管理員後台</h1>
          <p className="text-sm text-zinc-500 mt-1">
            目前回合 <span className="text-amber-400 font-bold">{data.board.current_round}</span>
            {data.board.last_tick_at && <> ／ 上次推進 {new Date(data.board.last_tick_at).toLocaleTimeString()}</>}
            {data.scoring.enabled && (
              <span className="ml-3 text-rose-400">⚠ 已觸發終局結算（{new Date(data.scoring.triggered_at!).toLocaleString()}）</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={busy}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-2 rounded-lg text-sm border border-zinc-700 flex items-center gap-2 min-h-[44px]"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            重新整理
          </button>
          <button
            onClick={handleTick}
            disabled={busy || data.scoring.enabled}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 px-4 py-2 rounded-lg font-bold flex items-center gap-2 min-h-[44px]"
            title="推進股價 + 結算所有借款利息（30 秒節流）"
          >
            <Play className="w-4 h-4" />
            下一回合
          </button>
        </div>
      </header>

      {/* 統計 + 連結 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <CountCard icon={<Users2 className="w-5 h-5" />} label="玩家" value={data.counts.players} href="/admin/accounts" />
        <CountCard icon={<Users className="w-5 h-5" />} label="關主" value={data.counts.captains} href="/admin/accounts" />
        <CountCard icon={<MapPin className="w-5 h-5" />} label="關卡" value={data.counts.stations} href="/admin/stations" />
        <CountCard icon={<Package className="w-5 h-5" />} label="道具" value={data.counts.items} href="/admin/items" />
        <CountCard icon={<Activity className="w-5 h-5" />} label="股票" value={data.counts.stocks} href="/admin/stocks" />
      </div>

      {/* 後台快速入口 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Link href="/admin/players" className="glass-panel p-4 rounded-xl hover:border-amber-500/40 transition-colors">
          <div className="text-amber-400 text-sm font-bold">玩家總覽</div>
          <div className="text-xs text-zinc-500">數值、持股、道具、重置</div>
        </Link>
        <Link href="/admin/finance" className="glass-panel p-4 rounded-xl hover:border-amber-500/40 transition-colors">
          <div className="text-amber-400 text-sm font-bold">財務方案</div>
          <div className="text-xs text-zinc-500">換匯所 + 銀行借貸</div>
        </Link>
        <Link href="/admin/events" className="glass-panel p-4 rounded-xl hover:border-amber-500/40 transition-colors">
          <div className="text-amber-400 text-sm font-bold">事件 / 跑馬燈</div>
          <div className="text-xs text-zinc-500">看板輪播事件 + 即時跑馬燈</div>
        </Link>
        <Link href="/admin/board" className="glass-panel p-4 rounded-xl hover:border-amber-500/40 transition-colors">
          <div className="text-amber-400 text-sm font-bold">看板與 Token</div>
          <div className="text-xs text-zinc-500">版型、配色、display token</div>
        </Link>
        <Link href="/admin/settings" className="glass-panel p-4 rounded-xl hover:border-amber-500/40 transition-colors">
          <div className="text-amber-400 text-sm font-bold">系統參數</div>
          <div className="text-xs text-zinc-500">遊戲旗標、計分權重、命格範本</div>
        </Link>
        <Link href="/admin/stations" className="glass-panel p-4 rounded-xl hover:border-amber-500/40 transition-colors">
          <div className="text-amber-400 text-sm font-bold">關卡 / 關主</div>
          <div className="text-xs text-zinc-500">指派、限額、重生鍵</div>
        </Link>
        <Link href="/admin/items" className="glass-panel p-4 rounded-xl hover:border-amber-500/40 transition-colors">
          <div className="text-amber-400 text-sm font-bold">道具池</div>
          <div className="text-xs text-zinc-500">道具定義 CRUD</div>
        </Link>
        <Link href="/admin/stocks" className="glass-panel p-4 rounded-xl hover:border-amber-500/40 transition-colors">
          <div className="text-amber-400 text-sm font-bold">股市商品</div>
          <div className="text-xs text-zinc-500">≤ 10 檔，含當前價</div>
        </Link>
      </div>

      {/* 終局結算 */}
      <div className="glass-panel rounded-2xl p-6 mb-8 border-l-4 border-l-rose-500 bg-gradient-to-br from-rose-950/20 to-zinc-950">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-bold text-rose-400 flex items-center gap-2">
              <Sparkles className="w-5 h-5" /> 終局結算
            </h3>
            <p className="text-xs text-zinc-500 mt-1">觸發後玩家寫入操作全部停用，看板自動切換為最終排行榜畫面。**此操作不可復原。**</p>
          </div>
          {data.scoring.enabled ? (
            <span className="px-4 py-2 bg-rose-950/60 border border-rose-700 text-rose-300 rounded-lg text-sm">
              已於 {new Date(data.scoring.triggered_at!).toLocaleString()} 觸發
            </span>
          ) : (
            <button
              onClick={handleTriggerScoring}
              disabled={busy}
              className="bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white px-4 py-2 rounded-lg font-bold min-h-[44px]"
            >
              觸發終局結算
            </button>
          )}
        </div>
      </div>

      {/* 排行榜 */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h3 className="text-lg font-bold text-zinc-100">即時排行榜（前 50 名）</h3>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="text-zinc-500 text-xs border-b border-zinc-800">
              <th className="p-4">名次</th>
              <th className="p-4">玩家</th>
              <th className="p-4 text-right">最終分數</th>
              <th className="p-4 text-right">金錢</th>
              <th className="p-4 text-right">福分</th>
              <th className="p-4 text-right">健康</th>
              <th className="p-4 text-right">業力</th>
              <th className="p-4 text-right">重生</th>
            </tr>
          </thead>
          <tbody className="text-zinc-200 text-sm">
            {data.leaderboard.map((row, idx) => (
              <tr key={row.user_id} className="border-b border-zinc-800/50">
                <td className="p-4 font-bold text-amber-400">#{idx + 1}</td>
                <td className="p-4">
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-zinc-500 font-mono">{row.user_id}</div>
                </td>
                <td className="p-4 text-right font-mono text-amber-300">{row.final_score?.toLocaleString() ?? 0}</td>
                <td className="p-4 text-right text-amber-400">{row.money?.toLocaleString() ?? 0}</td>
                <td className="p-4 text-right text-teal-400">{row.blessing ?? 0}</td>
                <td className="p-4 text-right text-rose-400">{row.health ?? 0}</td>
                <td className="p-4 text-right text-purple-400">{row.karma ?? 0}</td>
                <td className="p-4 text-right text-zinc-500 text-xs">×{row.rebirth_count ?? 0}</td>
              </tr>
            ))}
            {data.leaderboard.length === 0 && (
              <tr><td colSpan={8} className="p-12 text-center text-zinc-500">尚無玩家</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 ${toast.ok ? 'bg-zinc-900 border-amber-500/40 text-amber-300' : 'bg-rose-950 border-rose-700 text-rose-300'} border px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-40`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span className="text-sm">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

function CountCard({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: number; href: string }) {
  return (
    <Link href={href} className="glass-panel p-4 rounded-xl hover:border-amber-500/40 transition-colors">
      <div className="flex items-center gap-2 text-zinc-500 text-xs">{icon}<span>{label}</span></div>
      <div className="text-2xl font-bold text-zinc-100 mt-1">{value}</div>
    </Link>
  );
}
