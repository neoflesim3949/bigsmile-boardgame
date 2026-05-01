'use client';

import { useState, useTransition, useMemo } from 'react';
import { Search, RefreshCw, Users, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  listPlayersOverview,
  resetSinglePlayer,
  type PlayerOverviewRow,
} from '@/app/actions/admin';

interface Props {
  initialRows: PlayerOverviewRow[];
}

export default function PlayersClient({ initialRows }: Props) {
  const [rows, setRows] = useState<PlayerOverviewRow[]>(initialRows);
  const [search, setSearch] = useState('');
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.user_id.toLowerCase().includes(q) ||
        (r.login_id ?? '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totalActive = rows.filter((r) => r.is_active).length;
  const totalDead = rows.filter((r) => r.health <= 0 || r.blessing <= 0).length;

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  }

  function refresh() {
    startTransition(async () => {
      const r = await listPlayersOverview();
      if (r.ok) setRows(r.data!);
    });
  }

  async function handleReset(row: PlayerOverviewRow) {
    if (!confirm(`重置玩家「${row.name}」？\n清空：四項參數、命格、持股、借貸、道具\n保留：帳號\n此操作不可復原。`)) return;
    const r = await resetSinglePlayer(row.user_id);
    if (r.ok) {
      showToast(true, `已重置 ${row.name}`);
      refresh();
    } else showToast(false, r.error?.message ?? '重置失敗');
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Users className="w-6 h-6 text-amber-500" /> 玩家數值總覽
          </h2>
          <p className="text-sm text-zinc-500 mt-1">查看與重置每位玩家的四項參數、持股、借貸、道具</p>
        </div>
        <div className="flex gap-2 items-center text-sm">
          <span className="border border-zinc-800 bg-zinc-800/50 text-zinc-300 px-3 py-1 rounded-full">玩家：{rows.length} 人</span>
          <span className="border border-zinc-800 bg-zinc-800/50 text-emerald-400 px-3 py-1 rounded-full">啟用：{totalActive}</span>
          {totalDead > 0 && (
            <span className="border border-rose-900/60 bg-rose-950/40 text-rose-400 px-3 py-1 rounded-full">地獄：{totalDead}</span>
          )}
        </div>
      </header>

      <div className="glass-panel rounded-2xl p-6">
        <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
          <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 w-96 max-w-full">
            <Search className="w-4 h-4 text-zinc-500 mr-2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋姓名 / userId / login..."
              className="bg-transparent border-none outline-none text-sm text-zinc-200 w-full"
            />
          </div>
          <button
            onClick={refresh}
            disabled={pending}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-2 rounded-lg text-sm border border-zinc-700 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${pending ? 'animate-spin' : ''}`} />
            重新整理
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-zinc-500 text-xs border-b border-zinc-800 bg-zinc-900/30">
                <th className="py-3 pl-4">User ID</th>
                <th className="py-3">姓名</th>
                <th className="py-3">命格</th>
                <th className="py-3 text-right">金錢</th>
                <th className="py-3 text-right">健康</th>
                <th className="py-3 text-right">福分</th>
                <th className="py-3 text-right">業力</th>
                <th className="py-3 text-right">借款</th>
                <th className="py-3 text-right">持股</th>
                <th className="py-3 text-right">道具</th>
                <th className="py-3 text-right">重生</th>
                <th className="py-3 text-right pr-4">操作</th>
              </tr>
            </thead>
            <tbody className="text-zinc-200 text-sm">
              {filtered.map((row) => {
                const isDead = row.health <= 0 || row.blessing <= 0;
                return (
                  <tr key={row.user_id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${isDead ? 'bg-rose-950/10' : ''}`}>
                    <td className="py-3 pl-4 text-zinc-400 font-mono text-xs">{row.user_id}</td>
                    <td className="py-3">
                      <div className="font-medium flex items-center gap-2">
                        {row.name}
                        {isDead && <span className="text-xs text-rose-400 px-1.5 py-0.5 bg-rose-950/40 border border-rose-900/60 rounded">地獄</span>}
                        {!row.is_active && <span className="text-xs text-zinc-500 px-1.5 py-0.5 bg-zinc-800 rounded">停用</span>}
                      </div>
                    </td>
                    <td className="py-3 text-zinc-400 text-xs">{row.destiny_name ?? '—'}</td>
                    <td className="py-3 text-right text-amber-400 font-medium">{row.money?.toLocaleString() ?? 0}</td>
                    <td className={`py-3 text-right font-medium ${row.health <= 0 ? 'text-rose-500' : 'text-rose-300'}`}>{row.health ?? 0}</td>
                    <td className={`py-3 text-right font-medium ${row.blessing <= 0 ? 'text-rose-500' : 'text-teal-300'}`}>{row.blessing ?? 0}</td>
                    <td className="py-3 text-right text-purple-300 font-medium">{row.karma ?? 0}</td>
                    <td className="py-3 text-right text-zinc-400">{row.bank_loan?.toLocaleString() ?? 0}</td>
                    <td className="py-3 text-right text-zinc-400">{row.holdings_count ?? 0}</td>
                    <td className="py-3 text-right text-zinc-400">{row.items_count ?? 0}</td>
                    <td className="py-3 text-right text-zinc-500 text-xs">×{row.rebirth_count ?? 0}</td>
                    <td className="py-3 text-right pr-4">
                      <button
                        onClick={() => handleReset(row)}
                        className="px-3 py-1 bg-rose-950/40 hover:bg-rose-600 text-rose-300 hover:text-white text-xs font-bold rounded border border-rose-900/60 hover:border-rose-500 transition-colors"
                        title="清空此玩家全部遊戲狀態"
                      >
                        重置
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-12 text-center text-zinc-500 text-sm">沒有玩家</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
