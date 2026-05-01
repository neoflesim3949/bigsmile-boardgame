'use client';

import Link from 'next/link';
import { use } from 'react';
import { ArrowLeft, Wallet, Heart, Sparkles, Scale, ArrowUpRight, ArrowDownRight, Lock } from 'lucide-react';

// ── 四項參數 metadata（class 必須寫死，避免 Tailwind JIT 漏掃）──
const STAT_META = {
  money: {
    label: '金錢', icon: Wallet, hidden: false,
    iconColor: 'text-amber-500', badge: 'bg-amber-500/10 border border-amber-500/30',
  },
  health: {
    label: '健康', icon: Heart, hidden: false, cap: 100,
    iconColor: 'text-rose-500', badge: 'bg-rose-500/10 border border-rose-500/30',
  },
  blessing: {
    label: '福分', icon: Sparkles, hidden: true,
    iconColor: 'text-teal-400', badge: 'bg-teal-500/10 border border-teal-500/30',
  },
  karma: {
    label: '業力', icon: Scale, hidden: true,
    iconColor: 'text-purple-500', badge: 'bg-purple-500/10 border border-purple-500/30',
  },
} as const;

type StatType = keyof typeof STAT_META;

// ── 隱藏資訊保護開關（對應 AppSettings.ShowAllStats）──
// false = 福分／業力的數值與明細皆隱藏；true = 全部公開
const SHOW_ALL_STATS = false;
// 終局結算後強制全開（不論 ShowAllStats 為何，最終排行榜會顯示完整明細）
const FINAL_SCORING_TRIGGERED = true;

// ── Mock 交易明細（實際由後端依 user_id 取 Transaction 表）──
const MOCK_LOG: Record<StatType, Tx[]> = {
  money: [
    { at: '13:02', delta:   1000, source: '初始抽卡（富貴命）',  by: '系統' },
    { at: '13:25', delta:   +800, source: '完成挑戰：面試',      by: '關主 A' },
    { at: '14:12', delta:  -2500, source: '股市買入：AAA × 25', by: '玩家自己' },
    { at: '14:45', delta:  +3200, source: '股市賣出：AAA × 20', by: '玩家自己' },
    { at: '15:08', delta:  -2000, source: '銀行借款',            by: '玩家自己' },
    { at: '15:33', delta:    -50, source: '玩家轉帳給 U-7821',   by: '玩家自己' },
    { at: '15:50', delta:  +9550, source: '中獎事件',            by: '系統' },
    { at: '16:15', delta:  +1500, source: '換匯：5 福分',        by: '玩家自己' },
  ],
  health: [
    { at: '13:00', delta:   +50, source: '初始抽卡（富貴命）',    by: '系統' },
    { at: '14:18', delta:   +30, source: '通過健康關卡',          by: '關主 B' },
    { at: '15:25', delta:   -10, source: '失敗懲罰',              by: '關主 C' },
    { at: '16:02', delta:   +10, source: '財神爺 BUFF 加成',      by: '系統' },
  ],
  blessing: [
    { at: '13:00', delta:    +10, source: '初始抽卡（富貴命）',    by: '系統' },
    { at: '13:55', delta:     +5, source: '行善任務',              by: '關主 D' },
    { at: '14:30', delta:    -15, source: '股市投機（業力轉換）',  by: '系統' },
    { at: '15:08', delta: 'mute', source: '銀行利息扣除（隱藏）',  by: '系統' },
    { at: '16:30', delta: 'mute', source: '銀行利息扣除（隱藏）',  by: '系統' },
  ],
  karma: [
    { at: '13:00', delta:    +20, source: '初始抽卡（富貴命）',    by: '系統' },
    { at: '14:30', delta:    +15, source: '股市投機（業力增加）',  by: '系統' },
    { at: '16:30', delta:    -10, source: '通過修行關卡',          by: '關主 E' },
  ],
};

type Tx = {
  at:     string;
  delta:  number | 'mute';   // mute = 該筆變動對玩家隱藏（仍存在於後端）
  source: string;
  by:     string;
};

export default function StatHistoryPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);

  // 驗證 type 合法性
  if (!isStatType(type)) {
    return <NotFound />;
  }

  const meta = STAT_META[type];
  const log  = MOCK_LOG[type];

  // 隱藏判定：福分／業力 + ShowAllStats=false + 非終局 → 鎖住
  const locked = meta.hidden && !SHOW_ALL_STATS && !FINAL_SCORING_TRIGGERED;

  if (locked) {
    return <LockedPage type={type} meta={meta} />;
  }

  // 計算累計值（用於右側 running balance）
  let running = 0;
  const enriched = log.map((tx) => {
    if (tx.delta !== 'mute') running += tx.delta;
    return { ...tx, running };
  });

  const Icon       = meta.icon;
  const finalValue = running;
  const cap        = 'cap' in meta ? meta.cap : undefined;

  return (
    <div className="min-h-screen page-bg p-4 pb-20">
      {/* Header */}
      <header className="flex items-center gap-2 mb-6 mt-2">
        <Link href="/" className="w-10 h-10 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-amber-500 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-bold text-amber-500 flex items-center gap-2">
          <Icon className={`w-5 h-5 ${meta.iconColor}`} />
          {meta.label} 明細
        </h1>
      </header>

      {/* Summary card */}
      <div className="glass-panel rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 mb-1">當前數值</p>
            <p className="text-4xl font-bold text-zinc-100 flex items-end gap-1">
              {finalValue.toLocaleString()}
              {cap && <span className="text-sm text-zinc-500 pb-2">/ {cap}</span>}
            </p>
          </div>
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${meta.badge}`}>
            <Icon className={`w-8 h-8 ${meta.iconColor}`} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-zinc-800">
          <Stat label="累計筆數" value={enriched.length.toString()} />
          <Stat label="正向變動" value={enriched.filter(t => t.delta !== 'mute' && (t.delta as number) > 0).length.toString()} />
          <Stat label="負向變動" value={enriched.filter(t => t.delta !== 'mute' && (t.delta as number) < 0).length.toString()} />
        </div>
      </div>

      {/* Log header */}
      <h2 className="text-sm font-semibold text-zinc-400 mb-2 px-2">交易明細（依時間倒序）</h2>

      {/* Log list */}
      <div className="space-y-2">
        {[...enriched].reverse().map((tx, i) => {
          const muted = tx.delta === 'mute';
          const v     = muted ? null : (tx.delta as number);
          const up    = !muted && v! > 0;
          return (
            <div key={i} className="glass-panel rounded-xl p-3 flex items-center gap-3">
              <div className={
                'w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ' +
                (muted ? 'bg-zinc-800 text-zinc-500' : up ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400')
              }>
                {muted ? <Lock className="w-4 h-4" /> : up ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200 truncate">{tx.source}</p>
                <p className="text-[0.6875rem] text-zinc-500">{tx.at} · {tx.by}</p>
              </div>
              <div className="text-right shrink-0">
                {muted ? (
                  <p className="text-sm font-mono text-zinc-600">隱藏</p>
                ) : (
                  <>
                    <p className={'text-sm font-mono font-semibold ' + (up ? 'text-emerald-400' : 'text-rose-400')}>
                      {up ? '+' : ''}{v!.toLocaleString()}
                    </p>
                    <p className="text-[0.625rem] text-zinc-500 font-mono">→ {tx.running.toLocaleString()}</p>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note for hidden stats */}
      {meta.hidden && FINAL_SCORING_TRIGGERED && (
        <div className="mt-6 glass-panel rounded-xl p-4 border border-amber-500/20 bg-amber-500/5">
          <p className="text-xs text-amber-300/80 leading-relaxed">
            🎉 活動已結算，{meta.label}的完整明細已對你公開。
            標註為「隱藏」的紀錄是活動進行中刻意對玩家保留的訊息（例如銀行靜默扣息）。
          </p>
        </div>
      )}
    </div>
  );
}

function isStatType(t: string): t is StatType {
  return t in STAT_META;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.6875rem] text-zinc-500">{label}</p>
      <p className="text-sm font-bold text-zinc-200 font-mono">{value}</p>
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen page-bg p-4 flex flex-col items-center justify-center">
      <p className="text-zinc-400">找不到此明細頁。</p>
      <Link href="/" className="mt-3 text-amber-500 text-sm">返回</Link>
    </div>
  );
}

function LockedPage({ meta }: { type: StatType; meta: typeof STAT_META[StatType] }) {
  const Icon = meta.icon;
  return (
    <div className="min-h-screen page-bg p-4">
      <header className="flex items-center gap-2 mb-6 mt-2">
        <Link href="/" className="w-10 h-10 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-amber-500 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-bold text-zinc-400 flex items-center gap-2">
          <Icon className="w-5 h-5 text-zinc-500" />
          {meta.label} 明細
        </h1>
      </header>
      <div className="glass-panel rounded-2xl p-8 flex flex-col items-center text-center">
        <Lock className="w-16 h-16 text-zinc-600 mb-4" />
        <h2 className="text-xl font-bold text-zinc-300 mb-2">明細未公開</h2>
        <p className="text-sm text-zinc-500 leading-relaxed max-w-sm">
          此項數值與明細在活動進行中**刻意對玩家保留**。<br />
          請待活動結束、最終結算後再查看完整內容。
        </p>
      </div>
    </div>
  );
}
