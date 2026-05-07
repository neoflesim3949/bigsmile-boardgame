'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ArrowLeft, ArrowRightLeft, Wallet, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  exchangeBlessing,
  listExchangeOptionsForPlayer,
  type ExchangeOptionViewPlayer,
} from '@/app/actions/player';

interface Props {
  myMoney: number;
  isDead: boolean;
  gameEnabled: boolean;
  finalScoringAt: string | null;
  initialOptions: ExchangeOptionViewPlayer[];
}

export default function ExchangeClient({ myMoney, isDead, gameEnabled, finalScoringAt, initialOptions }: Props) {
  const [options, setOptions] = useState<ExchangeOptionViewPlayer[]>(initialOptions);
  const [balance, setBalance] = useState(myMoney);
  const [selected, setSelected] = useState<string | null>(null);
  const [units, setUnits] = useState('1');
  const [busy, busyTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const writeDisabled = isDead || !gameEnabled || !!finalScoringAt;
  const cur = options.find((o) => o.id === selected);
  const n = Math.max(0, Math.floor(Number(units) || 0));
  const expectedMoney = cur ? n * cur.money_gain_per_unit : 0;

  function handleSubmit() {
    if (!cur) return;
    if (n <= 0 || n > cur.max_units) {
      setMsg({ ok: false, text: '兌換單位數不在可用範圍內' });
      return;
    }
    busyTransition(async () => {
      const r = await exchangeBlessing({ optionId: cur.id, units: n });
      if (r.ok) {
        setBalance(r.data!.new_balance.money);
        setMsg({ ok: true, text: `已兌換 +${r.data!.money_gained.toLocaleString()} 金錢` });
        // reload options（max_units 會更新）
        const updated = await listExchangeOptionsForPlayer();
        if (updated.ok) setOptions(updated.data!);
        setUnits('1');
      } else {
        setMsg({ ok: false, text: r.error?.message ?? '兌換失敗' });
      }
    });
  }

  return (
    <div className="min-h-screen page-bg p-4 pb-12">
      <header className="flex items-center gap-3 mb-6">
        <Link href="/" className="w-9 h-9 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-zinc-300">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-amber-500" /> 換匯所
        </h1>
      </header>

      {writeDisabled && (
        <div className="bg-rose-950/30 border border-rose-900/60 text-rose-300 rounded-xl p-3 mb-4 text-sm text-center">
          {isDead ? '地獄狀態下無法兌換' : finalScoringAt ? '終局結算已觸發' : '活動尚未開始'}
        </div>
      )}

      <div className="glass-panel rounded-2xl p-5 mb-4 flex justify-between items-center">
        <div>
          <p className="text-zinc-400 text-sm">我的金錢</p>
          <p className="text-2xl font-bold text-amber-400 flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            {balance.toLocaleString()}
          </p>
        </div>
      </div>

      <h2 className="text-sm text-zinc-400 mb-2">選擇方案</h2>
      <div className="space-y-3 mb-4">
        {options.map((o) => {
          const isSel = selected === o.id;
          const disabled = o.max_units === 0;
          return (
            <button
              key={o.id}
              onClick={() => !disabled && setSelected(o.id)}
              disabled={disabled || writeDisabled}
              className={`w-full text-left glass-panel p-4 rounded-2xl border-2 transition-all ${
                isSel ? 'border-amber-500 bg-amber-500/5' : 'border-zinc-800 hover:border-zinc-600'
              } ${disabled || writeDisabled ? 'opacity-50' : ''}`}
            >
              <div className="flex justify-between items-baseline mb-2">
                <span className="font-bold text-zinc-100">{o.label}</span>
                <span className="text-xs text-zinc-500">最高可兌換 {o.max_money.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">每單位獲得</span>
                <span className="text-amber-400 font-medium">+{o.money_gain_per_unit.toLocaleString()}</span>
              </div>
            </button>
          );
        })}
        {options.length === 0 && (
          <div className="glass-panel rounded-2xl p-8 text-center text-zinc-500">目前沒有可用的兌換方案</div>
        )}
      </div>

      {cur && (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <div>
            <label className="text-xs text-zinc-500">兌換單位數（上限 {cur.max_units}）</label>
            <input
              type="number"
              min="1"
              max={cur.max_units}
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
            />
          </div>
          <div className="bg-zinc-950 border border-zinc-700 rounded-lg p-3 flex justify-between items-center">
            <span className="text-zinc-400 text-sm">將獲得</span>
            <span className="text-2xl font-bold text-amber-400">+{expectedMoney.toLocaleString()}</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={busy || n <= 0 || n > cur.max_units || writeDisabled}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 py-3 rounded-lg font-bold flex items-center justify-center gap-2 min-h-[44px]"
          >
            <ArrowRightLeft className="w-4 h-4" />
            {busy ? '兌換中…' : '確認兌換'}
          </button>
        </div>
      )}

      {msg && (
        <div className={`mt-4 flex items-center gap-2 rounded-lg p-3 text-sm ${msg.ok ? 'bg-emerald-950/40 border border-emerald-900/60 text-emerald-300' : 'bg-rose-950/40 border border-rose-900/60 text-rose-300'}`}>
          {msg.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}
    </div>
  );
}
