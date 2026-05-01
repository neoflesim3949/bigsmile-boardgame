'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, RefreshCcw, Building2, Save, CheckCircle2, Plus, Trash2 } from 'lucide-react';

// ── 型別 ──────────────────────────────────────────────────────────
interface ExchangeRate {
  id: string;
  label: string;
  blessingPerUnit: number;   // 每單位消耗福報
  moneyPerUnit: number;      // 每單位換得金錢
}

interface LoanPlan {
  id: string;
  label: string;
  blessingPerUnit: number;          // 每單位抵押福報
  blessingInterestPerRound: number; // 每單位每回合扣除福報
  amount: number;                   // 每單位獲得借款金錢
  interestRatePerRound: number;     // 每單位每回合產生金錢利息 (固定金額)
}

// ── 初始 Mock 設定 ────────────────────────────────────────────────
const INIT_RATES: ExchangeRate[] = [
  { id: 'r1', label: '標準方案', blessingPerUnit: 1,  moneyPerUnit: 80  },
  { id: 'r2', label: '優惠方案', blessingPerUnit: 5,  moneyPerUnit: 450 },
  { id: 'r3', label: 'VIP 方案', blessingPerUnit: 10, moneyPerUnit: 950 },
];

const INIT_LOANS: LoanPlan[] = [
  { id: 'l1', label: '標準信貸', blessingPerUnit: 1, blessingInterestPerRound: 1, amount: 1000, interestRatePerRound: 50 },
  { id: 'l2', label: '企業融資', blessingPerUnit: 5, blessingInterestPerRound: 3, amount: 6000, interestRatePerRound: 250 },
];

// ── Helper ────────────────────────────────────────────────────────
function uid() { return 'r' + Date.now(); }

function RateRow({
  rate,
  onChange,
  onDelete,
}: {
  rate: ExchangeRate;
  onChange: (r: ExchangeRate) => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <input
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-teal-500/50"
          value={rate.label}
          onChange={(e) => onChange({ ...rate, label: e.target.value })}
          placeholder="方案名稱"
        />
        <button onClick={onDelete} className="w-8 h-8 flex items-center justify-center text-zinc-600 hover:text-rose-400 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <p className="text-xs text-zinc-500">每單位消耗福報</p>
          <input
            type="number"
            min={1}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-teal-300 font-bold focus:outline-none focus:border-teal-500/50"
            value={rate.blessingPerUnit}
            onChange={(e) => onChange({ ...rate, blessingPerUnit: Number(e.target.value) })}
          />
        </label>
        <label className="space-y-1">
          <p className="text-xs text-zinc-500">每單位換得金錢</p>
          <input
            type="number"
            min={1}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-amber-300 font-bold focus:outline-none focus:border-amber-500/50"
            value={rate.moneyPerUnit}
            onChange={(e) => onChange({ ...rate, moneyPerUnit: Number(e.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}

function LoanRow({
  plan,
  onChange,
  onDelete,
}: {
  plan: LoanPlan;
  onChange: (p: LoanPlan) => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <input
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-blue-500/50"
          value={plan.label}
          onChange={(e) => onChange({ ...plan, label: e.target.value })}
          placeholder="方案名稱"
        />
        <button onClick={onDelete} className="w-8 h-8 flex items-center justify-center text-zinc-600 hover:text-rose-400 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <label className="space-y-1">
          <p className="text-xs text-zinc-500">每單位抵押福報</p>
          <input
            type="number"
            min={1}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-teal-300 font-bold focus:outline-none focus:border-teal-500/50"
            value={plan.blessingPerUnit}
            onChange={(e) => onChange({ ...plan, blessingPerUnit: Number(e.target.value) })}
          />
        </label>
        <label className="space-y-1">
          <p className="text-xs text-zinc-500">每回合扣福報</p>
          <input
            type="number"
            min={0}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-amber-300 font-bold focus:outline-none focus:border-amber-500/50"
            value={plan.blessingInterestPerRound}
            onChange={(e) => onChange({ ...plan, blessingInterestPerRound: Number(e.target.value) })}
          />
        </label>
        <label className="space-y-1">
          <p className="text-xs text-zinc-500">每單位借入金錢</p>
          <input
            type="number"
            min={1}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-blue-300 font-bold focus:outline-none focus:border-blue-500/50"
            value={plan.amount}
            onChange={(e) => onChange({ ...plan, amount: Number(e.target.value) })}
          />
        </label>
        <label className="space-y-1">
          <p className="text-xs text-zinc-500">每回合扣金錢</p>
          <input
            type="number"
            min={0}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-rose-300 font-bold focus:outline-none focus:border-rose-500/50"
            value={plan.interestRatePerRound}
            onChange={(e) => onChange({ ...plan, interestRatePerRound: Number(e.target.value) })}
          />
        </label>
      </div>
      {/* Preview row */}
      <div className="flex flex-wrap gap-2 text-xs pt-1">
        <span className="bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded px-2 py-0.5">
          總借款上限依玩家福報決定
        </span>
        <span className="bg-teal-500/10 text-teal-300 border border-teal-500/20 rounded px-2 py-0.5">
          抵押 {plan.blessingPerUnit} 福報
        </span>
        <span className="bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded px-2 py-0.5">
          每回合扣 {plan.blessingInterestPerRound} 福報
        </span>
        <span className="bg-rose-500/10 text-rose-300 border border-rose-500/20 rounded px-2 py-0.5">
          每回合扣 {plan.interestRatePerRound.toLocaleString()} 金錢
        </span>
      </div>
    </div>
  );
}

// ── 主頁面 ────────────────────────────────────────────────────────
export default function AdminFinancePage() {
  const [rates, setRates] = useState<ExchangeRate[]>(INIT_RATES);
  const [loans, setLoans] = useState<LoanPlan[]>(INIT_LOANS);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const updateRate = (id: string, r: ExchangeRate) =>
    setRates((prev) => prev.map((x) => (x.id === id ? r : x)));

  const updateLoan = (id: string, p: LoanPlan) =>
    setLoans((prev) => prev.map((x) => (x.id === id ? p : x)));

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100">財務系統設定</h2>
          <p className="text-zinc-500 text-sm mt-0.5">換匯所 & 銀行借貸規則管理</p>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all active:scale-95 ${
            saved
              ? 'bg-emerald-500 text-zinc-950'
              : 'bg-teal-500 hover:bg-teal-400 text-zinc-950'
          }`}
        >
          {saved ? <><CheckCircle2 className="w-4 h-4" /> 已儲存</> : <><Save className="w-4 h-4" /> 儲存設定</>}
        </button>
      </div>

      {/* ── 換匯所設定 ─────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <RefreshCcw className="w-4 h-4 text-teal-400" />
          <h3 className="text-lg font-semibold text-zinc-200">換匯所方案</h3>
        </div>

        <div className="space-y-3">
          {rates.map((r) => (
            <RateRow
              key={r.id}
              rate={r}
              onChange={(updated) => updateRate(r.id, updated)}
              onDelete={() => setRates((prev) => prev.filter((x) => x.id !== r.id))}
            />
          ))}
        </div>

        <button
          onClick={() =>
            setRates((prev) => [
              ...prev,
              { id: uid(), label: '新方案', blessingPerUnit: 1, moneyPerUnit: 100 },
            ])
          }
          className="mt-3 w-full py-2.5 rounded-xl border border-dashed border-zinc-700 text-zinc-500 hover:border-teal-500/50 hover:text-teal-400 transition-colors flex items-center justify-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" /> 新增方案
        </button>
      </section>

      <div className="border-t border-zinc-800" />

      {/* ── 銀行借貸設定 ───────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-4 h-4 text-blue-400" />
          <h3 className="text-lg font-semibold text-zinc-200">銀行借貸規則</h3>
          <span className="ml-auto text-xs text-zinc-600">每回合自動結算福報 + 利息</span>
        </div>

        <div className="space-y-3">
          {loans.map((p) => (
            <LoanRow
              key={p.id}
              plan={p}
              onChange={(updated) => updateLoan(p.id, updated)}
              onDelete={() => setLoans((prev) => prev.filter((x) => x.id !== p.id))}
            />
          ))}
        </div>

        <button
          onClick={() =>
            setLoans((prev) => [
              ...prev,
              { id: uid(), label: '新借貸方案', blessingPerUnit: 1, blessingInterestPerRound: 1, amount: 1000, interestRatePerRound: 50 },
            ])
          }
          className="mt-3 w-full py-2.5 rounded-xl border border-dashed border-zinc-700 text-zinc-500 hover:border-blue-500/50 hover:text-blue-400 transition-colors flex items-center justify-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" /> 新增借款方案
        </button>
      </section>

      {/* Bottom save */}
      <button
        onClick={handleSave}
        className={`w-full py-4 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 ${
          saved
            ? 'bg-emerald-500 text-zinc-950'
            : 'bg-teal-500 hover:bg-teal-400 text-zinc-950'
        }`}
      >
        {saved ? <><CheckCircle2 className="w-5 h-5" /> 設定已儲存！</> : <><Save className="w-5 h-5" /> 儲存所有設定</>}
      </button>
    </div>
  );
}
