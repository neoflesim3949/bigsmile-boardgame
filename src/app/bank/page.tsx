'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Building2, AlertTriangle, CheckCircle2 } from 'lucide-react';

// ── Mock config（由後台 /admin/finance 設定）─────────────────────
// 前台玩家完全不知道福報是否被扣除，後台結算時靜默處理
const LOAN_PLANS = [
  {
    id: 'l1',
    label: '標準信貸',
    amount: 1000,
    interestRatePerRound: 50,
    desc: '低門檻借款，每回合自動結算',
  },
  {
    id: 'l2',
    label: '企業融資',
    amount: 6000,
    interestRatePerRound: 250,
    desc: '高槓桿高風險',
  },
];

const EXISTING_DEBT     = 2000;
const EXISTING_INTEREST = 300;

export default function BankPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [done, setDone]         = useState<'borrow' | 'repay' | null>(null);

  const plan       = LOAN_PLANS.find((p) => p.id === selected);
  const repayTotal = EXISTING_DEBT + EXISTING_INTEREST;

  const handleBorrow = () => { if (!plan) return; setDone('borrow'); setTimeout(() => setDone(null), 2500); };
  const handleRepay  = () => { setDone('repay');  setTimeout(() => setDone(null), 2500); };

  return (
    <div className="min-h-screen page-bg flex flex-col max-w-md mx-auto border-x border-theme">
      <header className="p-4 flex items-center gap-4 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <Link href="/" className="w-10 h-10 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-zinc-100">銀行借貸</h1>
          <p className="text-xs text-zinc-500">借款與還款管理</p>
        </div>
      </header>

      <div className="p-4 space-y-5">

        {/* ── 目前借款狀況 ─────────────────────────────────── */}
        <div className="rounded-xl border bg-rose-950/20 border-rose-700/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              <p className="text-sm font-semibold text-zinc-300">目前借款狀況</p>
            </div>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">借款本金</span>
              <span className="font-bold text-zinc-100">{EXISTING_DEBT.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">本回合利息</span>
              <span className="font-bold text-rose-400">+ {EXISTING_INTEREST.toLocaleString()}</span>
            </div>
            <div className="border-t border-zinc-800 pt-2 flex justify-between">
              <span className="text-sm text-zinc-400 font-medium">應還總額</span>
              <span className="font-bold text-lg text-rose-300">{repayTotal.toLocaleString()}</span>
            </div>
          </div>

          <button
            onClick={handleRepay}
            className={`mt-4 w-full py-3 rounded-xl font-bold transition-all active:scale-95 ${
              done === 'repay'
                ? 'bg-emerald-500 text-zinc-950'
                : 'bg-rose-500/20 border border-rose-500/50 text-rose-400 hover:bg-rose-500/30'
            }`}
          >
            {done === 'repay'
              ? <span className="flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" /> 還款成功！</span>
              : `立即還款 ${repayTotal.toLocaleString()}`}
          </button>
        </div>

        {/* ── 申請新借款 ───────────────────────────────────── */}
        <div>
          <p className="text-sm font-semibold text-zinc-400 mb-2">申請新借貸方案</p>
          <div className="space-y-2">
            {LOAN_PLANS.map((p) => {
              // 模擬：隱藏福報推算出的最高借款單位數
              const maxUnits = 5;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(p.id === selected ? null : p.id)}
                  className={`w-full text-left rounded-xl border px-4 py-3.5 transition-all ${
                    selected === p.id
                      ? 'border-blue-500/60 bg-blue-500/10'
                      : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">{p.label}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">最高可借：<span className="text-blue-400 font-semibold">{(p.amount * maxUnits).toLocaleString()}</span> 元</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-base font-bold text-blue-300">+{p.amount.toLocaleString()} / 單位</p>
                      <p className="text-xs text-rose-400">利息 −{p.interestRatePerRound.toLocaleString()} / 單位</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 借貸單位數（當選定方案後顯示） */}
        {plan && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-zinc-400">借貸單位</p>
              <p className="text-xs text-zinc-600">最多可借 5 單位</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="w-11 h-11 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-xl font-bold hover:bg-zinc-700 transition-colors active:scale-95">
                −
              </button>
              <div className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl h-11 flex items-center justify-center text-xl font-bold text-zinc-100">
                1
              </div>
              <button className="w-11 h-11 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-xl font-bold hover:bg-zinc-700 transition-colors active:scale-95">
                ＋
              </button>
            </div>
          </div>
        )}

        {/* ── 借款預覽 ─────────────────────────────────────── */}
        {plan && (
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3 mt-4">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">借款預覽</p>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">借款單位</span>
              <span className="font-bold text-zinc-300">1 單位</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">獲得借款</span>
              <span className="font-bold text-blue-300">+ {(plan.amount * 1).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">每回合利息</span>
              <span className="font-bold text-rose-400">
                − {(plan.interestRatePerRound * 1).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm border-t border-zinc-800 pt-3">
              <span className="text-zinc-400">每回合結算方式</span>
              <span className="text-xs text-zinc-500">由系統自動扣除</span>
            </div>
          </div>
        )}

        {/* ── CTA ─────────────────────────────────────────── */}
        <button
          onClick={handleBorrow}
          disabled={!plan}
          className={`w-full py-4 rounded-xl font-bold transition-all active:scale-95 mt-4 ${
            done === 'borrow'
              ? 'bg-emerald-400 text-zinc-950 shadow-[0_0_20px_rgba(52,211,153,0.4)]'
              : plan
              ? 'bg-blue-500 hover:bg-blue-400 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
        >
          {done === 'borrow'
            ? <span className="flex items-center justify-center gap-2"><CheckCircle2 className="w-5 h-5" /> 借款成功！</span>
            : plan ? `確認借入 ${(plan.amount * 1).toLocaleString()}` : '請選擇借款方案'}
        </button>

        <p className="text-center text-xs text-zinc-600 px-4">
          ⚠️ 借款期間每回合將由系統自動結算，逾期未還將記錄懲罰。
        </p>
      </div>
    </div>
  );
}
