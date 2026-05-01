'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Users, MonitorPlay, ArrowUpDown, Eye, Sparkles, CheckCircle2, Lock } from 'lucide-react';

export default function AdminPage() {
  const [tourEnabled, setTourEnabled] = useState(false);
  const [cardEnabled, setCardEnabled] = useState(false);
  const canStart = tourEnabled && cardEnabled;

  return (
    <div className="p-8">
      <header className="flex justify-between items-start mb-8 gap-4">
        <h2 className="text-2xl font-bold text-zinc-100 shrink-0">總覽面板</h2>
        <div className="flex flex-wrap gap-3 items-center justify-end">

          {/* 導覽遊戲 */}
          <button
            onClick={() => setTourEnabled(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border ${
              tourEnabled
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-sky-600/50 hover:text-sky-400'
            }`}
          >
            {tourEnabled ? <CheckCircle2 className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            導覽遊戲
          </button>

          {/* 抽卡模式 */}
          <button
            onClick={() => setCardEnabled(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border ${
              cardEnabled
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-purple-600/50 hover:text-purple-400'
            }`}
          >
            {cardEnabled ? <CheckCircle2 className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            抽卡模式
          </button>

          {/* 分隔線 */}
          <div className="w-px h-8 bg-zinc-700" />

          {/* 遊戲開始 */}
          <button
            disabled={!canStart}
            title={canStart ? '' : '請先啟用「導覽遊戲」與「抽卡模式」'}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              canStart
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                : 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed'
            }`}
          >
            {canStart ? '▶ 遊戲開始' : <><Lock className="w-4 h-4" /> 遊戲開始</>}
          </button>

          <button className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-[0_0_15px_rgba(225,29,72,0.3)] flex items-center gap-2">
            ■ 遊戲結束 (計分)
          </button>
          <Link href="/display/board" target="_blank" className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-zinc-700 flex items-center gap-2">
            <MonitorPlay className="w-4 h-4" /> 開啟活動看板
          </Link>
        </div>
      </header>

      {/* 狀態提示列 */}
      {(!tourEnabled || !cardEnabled) && (
        <div className="flex gap-3 mb-6 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 text-xs text-zinc-500">
          <span className={`flex items-center gap-1.5 ${tourEnabled ? 'text-sky-400' : ''}`}>
            {tourEnabled ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border border-zinc-600 inline-block" />}
            導覽遊戲已{tourEnabled ? '啟用' : '關閉'}
          </span>
          <span className="text-zinc-700">·</span>
          <span className={`flex items-center gap-1.5 ${cardEnabled ? 'text-purple-400' : ''}`}>
            {cardEnabled ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border border-zinc-600 inline-block" />}
            抽卡模式已{cardEnabled ? '啟用' : '關閉'}
          </span>
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-600">請先啟用以上兩個模式，才能正式開始遊戲。</span>
        </div>
      )}

      {/* Row 1: Top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <KPICard title="遊戲已進行時間" value="01:30:12" alert={true} />
        <div className="glass-panel p-6 rounded-xl border-t-4 border-t-amber-500">
          <h3 className="text-zinc-500 text-sm font-medium mb-1">系統狀態</h3>
          <p className="text-3xl font-bold text-emerald-400">活動進行中</p>
        </div>
        <KPICard title="目前回合數" value="第 5 回合" />
      </div>

      {/* Row 2: Control Panels */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8">
        {/* 回合控制面板 */}
        <div className="glass-panel p-6 rounded-2xl border-t-4 border-t-blue-500 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-zinc-300">回合控制面板</h3>
              <span className="text-sm font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded">第 5 回合</span>
            </div>
            <p className="text-xs text-zinc-500 mb-4">點擊「下一回合」將結算銀行利息，並依據『股市回合腳本』自動套用股價變化與發送事件推播。</p>
            <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] mb-3">
              推進下一回合
            </button>
          </div>
        </div>

        {/* 即時跑馬燈廣播 */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-300 mb-4">即時跑馬燈廣播</h3>
            <textarea 
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-zinc-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none h-24 mb-4" 
              placeholder="輸入要顯示在大屏幕的突發訊息..."
              defaultValue="【大會公告】股市即將在 10 分鐘後進入劇烈震盪，請各位玩家注意自身持股風險！"
            />
          </div>
          <div className="flex gap-2">
            <button className="flex-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold py-2 rounded-lg transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              發送至看板
            </button>
            <button className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg transition-colors border border-zinc-700">
              清除
            </button>
          </div>
        </div>

        {/* 換匯所即時權重控制 */}
        <div className="glass-panel p-6 rounded-2xl border-t-4 border-t-teal-500 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-300 mb-4 flex items-center justify-between">
              換匯所即時權重控制
              <span className="text-xs bg-teal-500/20 text-teal-400 px-2 py-1 rounded border border-teal-500/30 font-mono shadow-[0_0_10px_rgba(20,184,166,0.2)]">
                目前套用：+50%
              </span>
            </h3>
            
            <div className="flex justify-between gap-1 mb-4">
              {['-50%', '-20%', '0%', '+50%', '+100%', '自訂'].map(w => (
                <button key={w} className={`flex-1 py-1.5 text-xs rounded border transition-all ${w === '+50%' ? 'bg-teal-500 text-zinc-950 font-bold border-teal-400 shadow-[0_0_10px_rgba(20,184,166,0.4)]' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-200'}`}>
                  {w}
                </button>
              ))}
            </div>

            <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/50 mb-4">
              <p className="text-xs text-zinc-400 leading-relaxed text-center">
                所有福報兌換金錢的方案，目前將自動套用 <strong className="text-teal-400 font-bold">150%</strong> 的倍率轉換。
              </p>
            </div>
          </div>

          <Link href="/admin/finance" className="block w-full text-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg transition-colors border border-zinc-700 text-sm mt-auto">
            管理基礎兌換方案與銀行規則
          </Link>
        </div>
      </div>

      {/* Row 3: Leaderboard (Full Width) */}
      <div className="glass-panel rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-zinc-300 mb-6 flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-500" /> 財富排行榜
        </h3>
        
        <table className="w-full text-left">
          <thead>
            <tr className="text-zinc-500 text-sm border-b border-zinc-800">
              <th className="pb-3 pl-2">排名</th>
              <th className="pb-3">姓名</th>
              <th className="pb-3 text-right cursor-pointer hover:text-amber-500 group transition-colors">
                <div className="flex items-center justify-end gap-1">金錢 <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" /></div>
              </th>
              <th className="pb-3 text-right cursor-pointer hover:text-teal-500 group transition-colors">
                <div className="flex items-center justify-end gap-1">福份 <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" /></div>
              </th>
              <th className="pb-3 text-right cursor-pointer hover:text-rose-500 group transition-colors">
                <div className="flex items-center justify-end gap-1">健康 <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" /></div>
              </th>
              <th className="pb-3 text-right cursor-pointer hover:text-purple-500 group transition-colors">
                <div className="flex items-center justify-end gap-1">業力 <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" /></div>
              </th>
              <th className="pb-3 text-right cursor-pointer hover:text-zinc-300 group transition-colors">
                <div className="flex items-center justify-end gap-1">重生次數 <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" /></div>
              </th>
              <th className="pb-3 pr-2 text-right cursor-pointer hover:text-white group transition-colors">
                <div className="flex items-center justify-end gap-1">最終分數 <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" /></div>
              </th>
            </tr>
          </thead>
          <tbody className="text-zinc-200 text-sm">
            {[
              { rank: 1, name: '王大明', money: '2,500,000', bless: '45', health: '80', karma: '10', rebirth: 0, score: '3,200,500' },
              { rank: 2, name: '李小美', money: '1,850,000', bless: '30', health: '100', karma: '0', rebirth: 1, score: '2,100,000' },
              { rank: 3, name: '張老闆', money: '950,000', bless: '99', health: '60', karma: '50', rebirth: 0, score: '1,940,000' },
              { rank: 4, name: '股神阿土伯', money: '1,200,000', bless: '5', health: '90', karma: '5', rebirth: 2, score: '1,800,000' },
            ].map((row, i) => (
              <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                <td className="py-4 pl-2 font-bold text-amber-500">#{row.rank}</td>
                <td className="py-4 font-medium">{row.name}</td>
                <td className="py-4 text-right font-bold text-amber-400">{row.money}</td>
                <td className="py-4 text-right text-teal-400 font-medium">{row.bless}</td>
                <td className="py-4 text-right text-rose-400 font-medium">{row.health}</td>
                <td className="py-4 text-right text-purple-400 font-medium">{row.karma}</td>
                <td className="py-4 text-right text-zinc-400">{row.rebirth}</td>
                <td className="py-4 pr-2 text-right font-bold text-zinc-100">{row.score}</td>
              </tr>
            ))}
        </tbody>
        </table>
      </div>
    </div>
  );
}

function KPICard({ title, value, alert = false }: { title: string, value: string, alert?: boolean }) {
  return (
    <div className={`glass-panel p-6 rounded-xl ${alert ? 'border border-rose-500/50 shadow-[0_0_15px_rgba(225,29,72,0.3)]' : ''}`}>
      <h3 className={`text-sm font-medium mb-1 ${alert ? 'text-rose-400 animate-pulse' : 'text-zinc-500'}`}>
        {title} {alert && '⚠️ 該推進回合了'}
      </h3>
      <p className={`text-3xl font-bold ${alert ? 'text-rose-500 animate-pulse' : 'text-zinc-100'}`}>{value}</p>
    </div>
  );
}
