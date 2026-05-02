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

function s(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function n(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

/** 把 payload 細節渲染成一句人類可讀的描述。回傳 null 代表沒有額外細節要顯示。 */
function describe(txType: string, payload: Record<string, unknown>): string | null {
  switch (txType) {
    case 'quick_action': {
      const station = s(payload.station_name);
      const label = s(payload.quick_action_label);
      const itemName = s(payload.granted_item_name);
      const head = station && label
        ? `${station} 關 關主套用 ${label}`
        : label
          ? `關主套用 ${label}`
          : null;
      const tail = itemName ? `（含發放道具：${itemName}）` : '';
      return head ? head + tail : null;
    }
    case 'stock_buy': {
      const code = s(payload.stock_code);
      const name = s(payload.stock_name);
      const shares = n(payload.shares);
      const price = n(payload.price);
      const cost = n(payload.cost);
      if (shares == null || price == null) return null;
      const left = code && name ? `${code} ${name}` : code || name || '股票';
      const costStr = cost != null ? `共 $${cost.toLocaleString()}` : '';
      return `買進 ${left} ×${shares} @${price.toLocaleString()} ${costStr}`.trim();
    }
    case 'stock_sell': {
      const code = s(payload.stock_code);
      const name = s(payload.stock_name);
      const shares = n(payload.shares);
      const price = n(payload.price);
      const proceeds = n(payload.proceeds);
      const profit = n(payload.profit);
      if (shares == null || price == null) return null;
      const left = code && name ? `${code} ${name}` : code || name || '股票';
      const profitStr = profit != null
        ? `（${profit >= 0 ? '利潤 +' : '虧損 '}${profit.toLocaleString()}）`
        : '';
      const proceedsStr = proceeds != null ? `共 $${proceeds.toLocaleString()}` : '';
      return `賣出 ${left} ×${shares} @${price.toLocaleString()} ${proceedsStr}${profitStr}`.trim();
    }
    case 'transfer': {
      const counterparty = s(payload.counterparty_name) ?? s(payload.to_user_name) ?? s(payload.from_user_name);
      const direction = payload.direction === 'out' ? '轉出至' : payload.direction === 'in' ? '收到自' : '轉帳';
      return counterparty ? `${direction} ${counterparty}` : null;
    }
    case 'exchange': {
      const units = n(payload.units);
      const moneyGained = n(payload.money_gained);
      if (units != null && moneyGained != null) return `兌換 ${units} 單位 → +$${moneyGained.toLocaleString()}`;
      return null;
    }
    case 'bank_borrow': {
      const amt = n(payload.amount);
      return amt != null ? `借入 $${amt.toLocaleString()}` : null;
    }
    case 'bank_repay': {
      const amt = n(payload.amount);
      return amt != null ? `償還 $${amt.toLocaleString()}` : null;
    }
    case 'rebirth': {
      const stocks = n(payload.cleared_stocks);
      const loans = n(payload.cleared_loans);
      const items = n(payload.cleared_items);
      const parts = [];
      if (stocks) parts.push(`${stocks} 股`);
      if (loans) parts.push(`${loans} 借貸`);
      if (items) parts.push(`${items} 道具`);
      return parts.length > 0 ? `重生（清 ${parts.join('、')}）` : null;
    }
    default:
      return null;
  }
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
              const detail = describe(e.tx_type, e.payload);
              const showDelta = e.delta !== null;
              const positive = (e.delta ?? 0) >= 0;
              return (
                <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex justify-between items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-200">
                      {detail ?? txLabel}
                    </p>
                    {detail && (
                      <p className="text-[0.6875rem] text-zinc-500 mt-0.5">{txLabel}</p>
                    )}
                    <p className="text-xs text-zinc-600 mt-0.5">{new Date(e.created_at).toLocaleString()}</p>
                  </div>
                  <div className="text-right shrink-0">
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
