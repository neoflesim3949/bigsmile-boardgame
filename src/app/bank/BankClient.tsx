'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ArrowLeft, Building2, CheckCircle2, AlertCircle, Wallet, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import {
  borrowFromBank,
  repayBank,
  listBankLoanOptionsForPlayer,
  type BankLoanOptionViewPlayer,
} from '@/app/actions/player';

interface Props {
  myMoney: number;
  bankLoan: number;
  isDead: boolean;
  gameEnabled: boolean;
  finalScoringAt: string | null;
  initialOptions: BankLoanOptionViewPlayer[];
}

export default function BankClient({
  myMoney, bankLoan, isDead, gameEnabled, finalScoringAt, initialOptions,
}: Props) {
  const [tab, setTab] = useState<'borrow' | 'repay'>('borrow');
  const [options, setOptions] = useState<BankLoanOptionViewPlayer[]>(initialOptions);
  const [money, setMoney] = useState(myMoney);
  const [loan, setLoan] = useState(bankLoan);
  const [selected, setSelected] = useState<string | null>(null);
  const [units, setUnits] = useState('1');
  const [repayAmount, setRepayAmount] = useState('');
  const [busy, busyTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const writeDisabled = isDead || !gameEnabled || !!finalScoringAt;
  const cur = options.find((o) => o.id === selected);
  const n = Math.max(0, Math.floor(Number(units) || 0));

  function handleBorrow() {
    if (!cur) return;
    if (n <= 0 || n > cur.available_units) {
      setMsg({ ok: false, text: '單位數不在可借範圍' });
      return;
    }
    busyTransition(async () => {
      const r = await borrowFromBank({ optionId: cur.id, units: n });
      if (r.ok) {
        setMoney(r.data!.new_balance.money);
        setLoan(r.data!.new_balance.bank_loan);
        setMsg({ ok: true, text: `已借入 ${r.data!.borrowed_money.toLocaleString()}` });
        const updated = await listBankLoanOptionsForPlayer();
        if (updated.ok) setOptions(updated.data!);
        setUnits('1');
      } else {
        setMsg({ ok: false, text: r.error?.message ?? '借款失敗' });
      }
    });
  }

  function handleRepay() {
    const amt = Number(repayAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setMsg({ ok: false, text: '請輸入有效金額' });
      return;
    }
    busyTransition(async () => {
      const r = await repayBank({ amount: amt });
      if (r.ok) {
        setMoney(r.data!.new_balance.money);
        setLoan(r.data!.new_balance.bank_loan);
        setRepayAmount('');
        setMsg({ ok: true, text: '已還款' });
      } else {
        setMsg({ ok: false, text: r.error?.message ?? '還款失敗' });
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
          <Building2 className="w-5 h-5 text-blue-400" /> 銀行借貸
        </h1>
      </header>

      {writeDisabled && (
        <div className="bg-rose-950/30 border border-rose-900/60 text-rose-300 rounded-xl p-3 mb-4 text-sm text-center">
          {isDead ? '地獄狀態下無法借貸' : finalScoringAt ? '終局結算已觸發' : '活動尚未開始'}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-zinc-400 text-xs">我的金錢</p>
          <p className="text-2xl font-bold text-amber-400 flex items-center gap-1">
            <Wallet className="w-4 h-4" />
            {money.toLocaleString()}
          </p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-zinc-400 text-xs">當前借款</p>
          <p className="text-2xl font-bold text-rose-400">{loan.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('borrow')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors min-h-[44px] flex items-center justify-center gap-2 ${
            tab === 'borrow' ? 'bg-amber-500 text-zinc-950 border-amber-500' : 'bg-zinc-800 text-zinc-400 border-zinc-700'
          }`}
        >
          <ArrowDownToLine className="w-4 h-4" /> 借款
        </button>
        <button
          onClick={() => setTab('repay')}
          disabled={loan === 0}
          className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2 ${
            tab === 'repay' ? 'bg-amber-500 text-zinc-950 border-amber-500' : 'bg-zinc-800 text-zinc-400 border-zinc-700'
          }`}
        >
          <ArrowUpFromLine className="w-4 h-4" /> 還款
        </button>
      </div>

      {tab === 'borrow' && (
        <>
          <div className="space-y-3 mb-4">
            {options.map((o) => {
              const isSel = selected === o.id;
              const disabled = o.available_units === 0;
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
                    <span className="text-xs text-zinc-500">可借 {o.available_units} 單位</span>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">每單位借入</span>
                      <span className="text-amber-400">+{o.money_per_unit.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">每回合利息</span>
                      <span className="text-rose-400">−{o.interest_money_per_round}</span>
                    </div>
                    {o.current_units > 0 && (
                      <div className="flex justify-between">
                        <span className="text-zinc-500">已持有</span>
                        <span className="text-zinc-300">{o.current_units} 單位</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
            {options.length === 0 && (
              <div className="glass-panel rounded-2xl p-8 text-center text-zinc-500">目前沒有可用的借貸方案</div>
            )}
          </div>

          {cur && (
            <div className="glass-panel rounded-2xl p-5 space-y-3">
              <div>
                <label className="text-xs text-zinc-500">借入單位數（上限 {cur.available_units}）</label>
                <input
                  type="number"
                  min="1"
                  max={cur.available_units}
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
                />
              </div>
              <div className="bg-zinc-950 border border-zinc-700 rounded-lg p-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-400 text-sm">將借入</span>
                  <span className="text-amber-400 font-bold">+{(n * cur.money_per_unit).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">每回合扣金錢</span>
                  <span className="text-rose-400">−{n * cur.interest_money_per_round}</span>
                </div>
              </div>
              <button
                onClick={handleBorrow}
                disabled={busy || n <= 0 || n > cur.available_units || writeDisabled}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 py-3 rounded-lg font-bold min-h-[44px]"
              >
                {busy ? '處理中…' : '確認借款'}
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'repay' && (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <div>
            <label className="text-xs text-zinc-500">還款金額（上限 {loan.toLocaleString()}）</label>
            <div className="flex gap-2 mt-1">
              <input
                type="number"
                min="1"
                max={loan}
                value={repayAmount}
                onChange={(e) => setRepayAmount(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
              />
              <button
                onClick={() => setRepayAmount(loan.toString())}
                className="px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm border border-zinc-700"
              >
                全額
              </button>
            </div>
          </div>
          <button
            onClick={handleRepay}
            disabled={busy || !repayAmount || writeDisabled}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 py-3 rounded-lg font-bold min-h-[44px]"
          >
            {busy ? '處理中…' : '確認還款'}
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
