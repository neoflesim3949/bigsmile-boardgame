'use client';

import Link from 'next/link';
import { ArrowLeft, Wallet, Heart, Sparkles, Scale } from 'lucide-react';
import type { HistoryType, HistoryEntry } from '@/app/actions/player';

const TITLE: Record<HistoryType, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  money: { label: '金錢', icon: Wallet, color: 'text-amber-400' },
  health: { label: '健康', icon: Heart, color: 'text-rose-400' },
  blessing: { label: '福分', icon: Sparkles, color: 'text-teal-400' },
  karma: { label: '業力', icon: Scale, color: 'text-purple-400' },
};

const TX_TYPE_LABEL: Record<string, string> = {
  destiny_draw: '抽取命格',
  rebirth: '重生',
  transfer: '轉帳',
  exchange: '換匯',
  bank_borrow: '銀行借款',
  bank_repay: '銀行還款',
  bank_interest: '銀行利息結算',
  stock_buy: '買進股票',
  stock_sell: '賣出股票',
  quick_action: '關主套用快捷',
  item_grant: '取得道具',
  account_update: '帳號變更',
  settings_update: '系統設定變更',
  final_scoring: '終局結算',
  danger_zone_reset: '危險操作重置',
};

interface Initial {
  entries: HistoryEntry[];
  current_value: number;
  show_all_stats: boolean;
  scoring_done: boolean;
}

export default function HistoryClient({ type, initial }: { type: HistoryType; initial: Initial }) {
  const meta = TITLE[type];
  const Icon = meta.icon;

  return (
    <div className="min-h-screen page-bg p-4 pb-12">
      <header className="flex items-center gap-3 mb-6">
        <Link href="/" className="w-9 h-9 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-zinc-300">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <Icon className={`w-5 h-5 ${meta.color}`} /> {meta.label}明細
        </h1>
      </header>

      <div className="glass-panel rounded-2xl p-5 mb-4">
        <p className="text-xs text-zinc-500">當前數值</p>
        <p className={`text-4xl font-bold ${meta.color}`}>
          {initial.current_value.toLocaleString()}
          {type === 'health' && <span className="text-base text-zinc-500 ml-1">/100</span>}
        </p>
      </div>

      {!initial.show_all_stats && initial.scoring_done && (type === 'blessing' || type === 'karma') && (
        <div className="bg-amber-950/30 border border-amber-900/60 text-amber-300 rounded-lg p-3 mb-4 text-sm">
          活動已結束，本明細已解鎖供你回顧大起大落。
        </div>
      )}

      <div className="space-y-2">
        {initial.entries.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 text-center text-zinc-500">尚無交易紀錄</div>
        ) : (
          initial.entries
            .filter((e) => type === 'money' ? true : (e.delta !== 0 || e.delta === null))
            .map((e) => {
              const txLabel = TX_TYPE_LABEL[e.tx_type] ?? e.tx_type;
              const showDelta = e.delta !== null;
              const positive = (e.delta ?? 0) >= 0;
              return (
                <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{txLabel}</p>
                    <p className="text-xs text-zinc-500">{new Date(e.created_at).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    {showDelta ? (
                      <span className={`font-mono text-lg font-bold ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {positive ? '+' : ''}{e.delta!.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-zinc-500 text-xs">—</span>
                    )}
                  </div>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}
