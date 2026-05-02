'use client';

import Link from 'next/link';
import { useState, useTransition, useEffect } from 'react';
import {
  Users, MonitorPlay, ArrowUpDown, Eye, Sparkles, CheckCircle2, Lock,
  AlertCircle, RefreshCw, AlertTriangle, X,
} from 'lucide-react';
import {
  setQuickFlag,
  setExchangeRateMultiplier,
  triggerFinalScoring,
  restartGameCycle,
  getAdminDashboard,
  publishMarquee,
  clearMarquee,
  type AdminDashboardData,
} from '@/app/actions/admin';
import { tickRound } from '@/app/actions/round';

interface Props {
  initial: AdminDashboardData;
}

const PRESET_MULTIPLIERS = [
  { label: '-50%', value: 0.5 },
  { label: '-20%', value: 0.8 },
  { label: '0%', value: 1.0 },
  { label: '+50%', value: 1.5 },
  { label: '+100%', value: 2.0 },
];

export default function AdminDashboardClient({ initial }: Props) {
  const [data, setData] = useState<AdminDashboardData>(initial);
  const [marqueeText, setMarqueeText] = useState(initial.board.marquee_text);
  const [marqueeMins, setMarqueeMins] = useState(60);
  const [busy, busyTransition] = useTransition();
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  }

  async function reload() {
    const r = await getAdminDashboard();
    if (r.ok) setData(r.data!);
  }

  function handleToggle(key: 'TourMode' | 'CardDrawMode', value: boolean) {
    busyTransition(async () => {
      const r = await setQuickFlag(key, value);
      if (r.ok) {
        await reload();
        showToast(true, `${key === 'TourMode' ? '導覽遊戲' : '抽卡模式'}：${value ? '已啟用' : '已關閉'}`);
      } else showToast(false, r.error?.message ?? '');
    });
  }

  function handleStartGame() {
    if (!data.flags.tour_mode || !data.flags.card_draw_mode) return;
    busyTransition(async () => {
      const r = await setQuickFlag('BoardGameEnabled', true);
      if (r.ok) {
        await reload();
        showToast(true, '遊戲已開始');
      } else showToast(false, r.error?.message ?? '');
    });
  }

  function handleTriggerScoring() {
    if (!confirm('觸發終局結算？\n玩家寫入操作將全部停用，看板自動切換為最終排行榜。\n此操作不可復原。')) return;
    busyTransition(async () => {
      const r = await triggerFinalScoring();
      if (r.ok) {
        await reload();
        showToast(true, '終局結算已觸發');
      } else showToast(false, r.error?.message ?? '');
    });
  }

  const [restartModalOpen, setRestartModalOpen] = useState(false);

  async function performRestart() {
    const r = await restartGameCycle();
    if (r.ok) {
      await reload();
      showToast(true, '系統已重置，請依序按「導覽遊戲」「抽卡模式」再按「遊戲開始」');
    } else {
      showToast(false, r.error?.message ?? '重啟失敗');
      throw new Error(r.error?.message ?? 'failed');
    }
  }

  function handleTick() {
    busyTransition(async () => {
      const r = await tickRound();
      if (r.ok) {
        await reload();
        showToast(true, `推進到第 ${r.data!.round} 回合（結算 ${r.data!.players_settled} 位借款玩家）`);
      } else showToast(false, r.error?.message ?? '');
    });
  }

  function handlePublishMarquee() {
    if (!marqueeText.trim()) return;
    busyTransition(async () => {
      const r = await publishMarquee(marqueeText, marqueeMins);
      if (r.ok) {
        showToast(true, '已發送至看板');
        await reload();
      } else showToast(false, r.error?.message ?? '');
    });
  }

  function handleClearMarquee() {
    busyTransition(async () => {
      const r = await clearMarquee();
      if (r.ok) {
        setMarqueeText('');
        await reload();
        showToast(true, '已清除跑馬燈');
      } else showToast(false, r.error?.message ?? '');
    });
  }

  function handleSetMultiplier(v: number) {
    busyTransition(async () => {
      const r = await setExchangeRateMultiplier(v);
      if (r.ok) {
        await reload();
        showToast(true, `匯率倍率：${formatMultiplier(v)}`);
      } else showToast(false, r.error?.message ?? '');
    });
  }

  function handleCustomMultiplier() {
    const input = window.prompt('輸入自訂倍率（0.0–10.0，例：1.25）', data.flags.exchange_rate_multiplier.toFixed(2));
    if (input === null) return;
    const v = Number(input);
    if (!Number.isFinite(v) || v < 0 || v > 10) {
      showToast(false, '倍率需介於 0–10 之間');
      return;
    }
    handleSetMultiplier(v);
  }

  // KPI 計算
  const elapsedText = data.flags.game_started_at && data.flags.game_enabled
    ? formatElapsed(now - new Date(data.flags.game_started_at).getTime())
    : '尚未開始';
  const overdueRound = data.board.last_tick_at
    ? (now - new Date(data.board.last_tick_at).getTime()) > 10 * 60 * 1000
    : data.flags.game_enabled;
  const systemStatus = data.scoring.enabled
    ? { text: '已結算', color: 'text-rose-400' }
    : data.flags.game_enabled
      ? { text: '活動進行中', color: 'text-emerald-400' }
      : { text: '尚未開始', color: 'text-zinc-400' };

  const canStart = data.flags.tour_mode && data.flags.card_draw_mode && !data.flags.game_enabled;
  const currentMultiplier = data.flags.exchange_rate_multiplier;

  return (
    <div className="p-8">
      <header className="flex justify-between items-start mb-8 gap-4 flex-wrap">
        <h2 className="text-2xl font-bold text-zinc-100 shrink-0">總覽面板</h2>
        <div className="flex flex-wrap gap-3 items-center justify-end">
          <button
            onClick={() => handleToggle('TourMode', !data.flags.tour_mode)}
            disabled={busy}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border min-h-[40px] ${
              data.flags.tour_mode
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-sky-600/50 hover:text-sky-400'
            }`}
          >
            {data.flags.tour_mode ? <CheckCircle2 className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            導覽遊戲
          </button>

          <button
            onClick={() => handleToggle('CardDrawMode', !data.flags.card_draw_mode)}
            disabled={busy}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border min-h-[40px] ${
              data.flags.card_draw_mode
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-purple-600/50 hover:text-purple-400'
            }`}
          >
            {data.flags.card_draw_mode ? <CheckCircle2 className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            抽卡模式
          </button>

          <div className="w-px h-8 bg-zinc-700" />

          {data.flags.game_enabled ? (
            <span className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              <CheckCircle2 className="w-4 h-4" /> 遊戲進行中
            </span>
          ) : (
            <button
              onClick={handleStartGame}
              disabled={!canStart || busy}
              title={canStart ? '' : '請先啟用「導覽遊戲」與「抽卡模式」'}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all min-h-[40px] ${
                canStart
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed'
              }`}
            >
              {canStart ? '▶ 遊戲開始' : <><Lock className="w-4 h-4" /> 遊戲開始</>}
            </button>
          )}

          {data.scoring.enabled ? (
            <button
              onClick={() => setRestartModalOpen(true)}
              disabled={busy}
              className="bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-700 hover:border-rose-500 px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 min-h-[40px]"
              title="重置系統（會清空所有玩家狀態與明細）"
            >
              <RefreshCw className="w-4 h-4" /> 重置系統
            </button>
          ) : (
            <button
              onClick={handleTriggerScoring}
              disabled={busy}
              className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-[0_0_15px_rgba(225,29,72,0.3)] flex items-center gap-2 min-h-[40px]"
            >
              ■ 遊戲結束 (計分)
            </button>
          )}

          <Link
            href="/admin/events"
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-zinc-700 flex items-center gap-2 min-h-[40px]"
            title="到事件與看板管理頁發 display token"
          >
            <MonitorPlay className="w-4 h-4" /> 開啟活動看板
          </Link>
        </div>
      </header>

      {(!data.flags.tour_mode || !data.flags.card_draw_mode) && !data.flags.game_enabled && (
        <div className="flex gap-3 mb-6 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 text-xs text-zinc-500 flex-wrap">
          <span className={`flex items-center gap-1.5 ${data.flags.tour_mode ? 'text-sky-400' : ''}`}>
            {data.flags.tour_mode ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border border-zinc-600 inline-block" />}
            導覽遊戲已{data.flags.tour_mode ? '啟用' : '關閉'}
          </span>
          <span className="text-zinc-700">·</span>
          <span className={`flex items-center gap-1.5 ${data.flags.card_draw_mode ? 'text-purple-400' : ''}`}>
            {data.flags.card_draw_mode ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border border-zinc-600 inline-block" />}
            抽卡模式已{data.flags.card_draw_mode ? '啟用' : '關閉'}
          </span>
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-600">請先啟用以上兩個模式，才能正式開始遊戲。</span>
        </div>
      )}

      {/* Row 1: KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <KPICard title="遊戲已進行時間" value={elapsedText} alert={overdueRound && data.flags.game_enabled} alertText="該推進回合了" />
        <div className="glass-panel p-6 rounded-xl border-t-4 border-t-amber-500">
          <h3 className="text-zinc-500 text-sm font-medium mb-1">系統狀態</h3>
          <p className={`text-3xl font-bold ${systemStatus.color}`}>{systemStatus.text}</p>
        </div>
        <KPICard title="目前回合數" value={`第 ${data.board.current_round} 回合`} />
      </div>

      {/* Row 2: Control Panels */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8">
        {/* 回合控制 */}
        <div className="glass-panel p-6 rounded-2xl border-t-4 border-t-blue-500 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-zinc-300">回合控制面板</h3>
              <span className="text-sm font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded">第 {data.board.current_round} 回合</span>
            </div>
            <p className="text-xs text-zinc-500 mb-4">點擊「下一回合」會推進股價、結算所有借款利息（單條批次 SQL）。30 秒節流。</p>
            <button
              onClick={handleTick}
              disabled={busy || data.scoring.enabled}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] mb-3 min-h-[44px]"
            >
              {busy ? '處理中…' : '推進下一回合'}
            </button>
            {data.tickHistory && data.tickHistory.length > 0 && (
              <div className="mt-4 pt-3 border-t border-zinc-800">
                <p className="text-[0.6875rem] uppercase tracking-widest text-zinc-500 mb-2">推進歷史</p>
                <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                  {data.tickHistory.map((t, i) => (
                    <li
                      key={`${t.round}_${t.ticked_at}`}
                      className={`flex items-center justify-between text-xs px-2 py-1.5 rounded ${
                        i === 0 ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-zinc-900/40'
                      }`}
                    >
                      <span className={`font-mono font-bold ${i === 0 ? 'text-blue-300' : 'text-zinc-400'}`}>
                        #{t.round}
                      </span>
                      <span className="text-zinc-300 font-mono">
                        {new Date(t.ticked_at).toLocaleTimeString('zh-TW', { hour12: false })}
                        <span className="mx-1.5 text-zinc-600">|</span>
                        <span className="text-amber-400">{formatGameTime(t.game_time_seconds)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* 跑馬燈 */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-300 mb-4">即時跑馬燈廣播</h3>
            <textarea
              value={marqueeText}
              onChange={(e) => setMarqueeText(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-zinc-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none h-24 mb-3"
              placeholder="輸入要顯示在大屏幕的突發訊息..."
            />
            <div className="flex items-center gap-2 mb-3 text-xs text-zinc-500">
              <span>TTL（分鐘）</span>
              <input
                type="number"
                min="1"
                value={marqueeMins}
                onChange={(e) => setMarqueeMins(Number(e.target.value) || 60)}
                className="w-20 bg-zinc-900 border border-zinc-700 rounded p-1 text-zinc-200 text-center"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePublishMarquee}
              disabled={busy || !marqueeText.trim()}
              className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold py-2 rounded-lg transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)] min-h-[40px]"
            >
              發送至看板
            </button>
            <button
              onClick={handleClearMarquee}
              disabled={busy}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg transition-colors border border-zinc-700 min-h-[40px]"
            >
              清除
            </button>
          </div>
        </div>

        {/* 換匯所即時權重 */}
        <div className="glass-panel p-6 rounded-2xl border-t-4 border-t-teal-500 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-300 mb-4 flex items-center justify-between gap-2">
              <span>換匯所即時權重控制</span>
              <span className="text-xs bg-teal-500/20 text-teal-400 px-2 py-1 rounded border border-teal-500/30 font-mono shadow-[0_0_10px_rgba(20,184,166,0.2)]">
                目前套用：{formatMultiplier(currentMultiplier)}
              </span>
            </h3>

            <div className="flex justify-between gap-1 mb-4">
              {PRESET_MULTIPLIERS.map((p) => {
                const isActive = Math.abs(currentMultiplier - p.value) < 0.01;
                return (
                  <button
                    key={p.label}
                    onClick={() => handleSetMultiplier(p.value)}
                    disabled={busy}
                    className={`flex-1 py-1.5 text-xs rounded border transition-all min-h-[36px] ${
                      isActive
                        ? 'bg-teal-500 text-zinc-950 font-bold border-teal-400 shadow-[0_0_10px_rgba(20,184,166,0.4)]'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
              <button
                onClick={handleCustomMultiplier}
                disabled={busy}
                className="flex-1 py-1.5 text-xs rounded border bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-200 min-h-[36px]"
              >
                自訂
              </button>
            </div>

            <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/50 mb-4">
              <p className="text-xs text-zinc-400 leading-relaxed text-center">
                所有福報兌換金錢的方案，目前自動套用{' '}
                <strong className="text-teal-400 font-bold">{(currentMultiplier * 100).toFixed(0)}%</strong>{' '}
                的倍率轉換。
              </p>
            </div>
          </div>

          <Link
            href="/admin/finance"
            className="block w-full text-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg transition-colors border border-zinc-700 text-sm mt-auto min-h-[40px] flex items-center justify-center"
          >
            管理基礎兌換方案與銀行規則
          </Link>
        </div>
      </div>

      {/* Row 3: Leaderboard */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-zinc-300 flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-500" /> 財富排行榜
            <span className="text-xs text-zinc-500 font-normal">（前 {data.leaderboard.length} 名）</span>
          </h3>
          <button
            onClick={() => busyTransition(reload)}
            disabled={busy}
            className="text-zinc-500 hover:text-amber-400 text-xs flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} />
            重新整理
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-zinc-500 text-sm border-b border-zinc-800">
                <th className="pb-3 pl-2">排名</th>
                <th className="pb-3">姓名</th>
                <ColTh title="金錢" color="amber" />
                <ColTh title="福份" color="teal" />
                <ColTh title="健康" color="rose" />
                <ColTh title="業力" color="purple" />
                <ColTh title="重生次數" color="zinc" />
                <ColTh title="最終分數" color="white" />
              </tr>
            </thead>
            <tbody className="text-zinc-200 text-sm">
              {data.leaderboard.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-zinc-500">尚無玩家資料</td></tr>
              ) : (
                data.leaderboard.map((row, i) => (
                  <tr key={row.user_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="py-4 pl-2 font-bold text-amber-500">#{i + 1}</td>
                    <td className="py-4 font-medium">
                      {row.name}
                      <span className="text-xs text-zinc-500 ml-2 font-mono">{row.user_id}</span>
                    </td>
                    <td className="py-4 text-right font-bold text-amber-400">{row.money?.toLocaleString() ?? 0}</td>
                    <td className="py-4 text-right text-teal-400 font-medium">{row.blessing ?? 0}</td>
                    <td className="py-4 text-right text-rose-400 font-medium">{row.health ?? 0}</td>
                    <td className="py-4 text-right text-purple-400 font-medium">{row.karma ?? 0}</td>
                    <td className="py-4 text-right text-zinc-400">{row.rebirth_count ?? 0}</td>
                    <td className="py-4 pr-2 text-right font-bold text-zinc-100">{row.final_score?.toLocaleString() ?? 0}</td>
                  </tr>
                ))
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

      {restartModalOpen && (
        <RestartConfirmModal
          onClose={() => setRestartModalOpen(false)}
          onConfirmed={async () => {
            await performRestart();
          }}
        />
      )}
    </div>
  );
}

const RESTART_STEPS = [
  '你即將重置系統 — 確定要繼續嗎？',
  '此操作會清空所有玩家狀態、四項值明細與遊戲進度，無法復原。',
  '清空項目：玩家四項數值、命格、持股、借貸、道具、股票歷史曲線、使用次數、玩家交易明細（金錢/福分/業力歷史）。',
  '保留項目：帳號、商品定義、道具、關卡、財務方案、命格範本、**股票回合腳本與事件文字**（這些是預先設好的活動內容）。',
  '重置後：旗標全關，需重新按「導覽遊戲」「抽卡模式」「遊戲開始」三鍵才會啟動。最後確認？',
];

function RestartConfirmModal({
  onClose, onConfirmed,
}: {
  onClose: () => void;
  onConfirmed: () => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [busy, busyTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function handleNext() {
    if (step < RESTART_STEPS.length - 1) {
      setStep((s) => s + 1);
      return;
    }
    busyTransition(async () => {
      try {
        await onConfirmed();
        setDone(true);
        setTimeout(onClose, 1500);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : '執行失敗');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-rose-900/60 rounded-2xl shadow-[0_0_40px_rgba(225,29,72,0.25)] p-8 max-w-md w-full relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300">
          <X className="w-4 h-4" />
        </button>
        {done ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-3">✅</div>
            <p className="text-emerald-400 font-bold text-lg">系統已重置</p>
            <p className="text-zinc-500 text-sm mt-2">請重新按「遊戲開始」啟動</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-7 h-7 text-rose-500 shrink-0" />
              <div>
                <h4 className="font-bold text-rose-400 text-base">重置系統（核重置）</h4>
                <p className="text-xs text-zinc-500 mt-0.5">需經 5 次確認才會執行</p>
              </div>
            </div>

            {/* 5 step indicators */}
            <div className="flex gap-2 mb-5">
              {RESTART_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-1.5 rounded-full transition-all ${
                    i <= step ? 'bg-rose-500' : 'bg-zinc-800'
                  }`}
                />
              ))}
            </div>

            <p className="text-zinc-200 text-sm mb-6 text-center leading-relaxed min-h-[3em]">
              {RESTART_STEPS[step]}
            </p>

            {err && <p className="text-rose-400 text-sm mb-3 text-center">{err}</p>}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={busy}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm font-bold border border-zinc-700 disabled:opacity-50 min-h-[44px]"
              >
                取消
              </button>
              <button
                onClick={handleNext}
                disabled={busy}
                className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-bold min-h-[44px]"
              >
                {busy
                  ? '執行中…'
                  : step < RESTART_STEPS.length - 1
                    ? `確認 ${step + 1}/5`
                    : '🔥 最終確認，重置系統'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function KPICard({ title, value, alert = false, alertText }: { title: string; value: string; alert?: boolean; alertText?: string }) {
  return (
    <div className={`glass-panel p-6 rounded-xl ${alert ? 'border border-rose-500/50 shadow-[0_0_15px_rgba(225,29,72,0.3)]' : ''}`}>
      <h3 className={`text-sm font-medium mb-1 ${alert ? 'text-rose-400 animate-pulse' : 'text-zinc-500'}`}>
        {title} {alert && alertText && `⚠️ ${alertText}`}
      </h3>
      <p className={`text-3xl font-bold ${alert ? 'text-rose-500 animate-pulse' : 'text-zinc-100'}`}>{value}</p>
    </div>
  );
}

function ColTh({ title, color }: { title: string; color: string }) {
  const map: Record<string, string> = {
    amber: 'hover:text-amber-500',
    teal: 'hover:text-teal-500',
    rose: 'hover:text-rose-500',
    purple: 'hover:text-purple-500',
    zinc: 'hover:text-zinc-300',
    white: 'hover:text-white',
  };
  return (
    <th className={`pb-3 text-right ${map[color] ?? ''} group transition-colors`}>
      <div className="flex items-center justify-end gap-1">{title} <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" /></div>
    </th>
  );
}

function formatMultiplier(v: number): string {
  const pct = (v - 1) * 100;
  if (Math.abs(pct) < 0.5) return '+0%';
  return pct > 0 ? `+${pct.toFixed(0)}%` : `${pct.toFixed(0)}%`;
}

function formatElapsed(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** 把遊戲時間（秒）格式化為「H:MM:SS」或「-」 */
function formatGameTime(sec: number | null): string {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
