'use client';

import { useState } from 'react';
import { Coins, Landmark, Plus, Edit2, Trash2, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  upsertExchangeOption,
  deleteExchangeOption,
  upsertBankLoanOption,
  deleteBankLoanOption,
  type ExchangeOptionRow,
  type BankLoanOptionRow,
  type ExchangeOptionPayload,
  type BankLoanOptionPayload,
} from '@/app/actions/admin';
import { useConfirm } from '@/components/shared/ConfirmProvider';
import { useWriteGuard } from '@/components/shared/WriteGuard';

interface Props {
  initialExchange: ExchangeOptionRow[];
  initialLoan: BankLoanOptionRow[];
}

export default function FinanceClient({ initialExchange, initialLoan }: Props) {
  const [exchange, setExchange] = useState<ExchangeOptionRow[]>(initialExchange);
  const [loan, setLoan] = useState<BankLoanOptionRow[]>(initialLoan);
  const [editingEx, setEditingEx] = useState<ExchangeOptionRow | 'new' | null>(null);
  const [editingLoan, setEditingLoan] = useState<BankLoanOptionRow | 'new' | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const confirm = useConfirm();
  const { run } = useWriteGuard();

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div className="p-8 max-w-6xl mx-auto pb-20 space-y-8">
      {/* 換匯所方案 */}
      <section>
        <header className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
              <Coins className="w-6 h-6 text-amber-500" /> 換匯所方案
            </h2>
            <p className="text-sm text-zinc-500 mt-1">設定每方案「每單位消耗福報、每單位獲得金錢」。前台不顯示福報資訊。</p>
          </div>
          <button
            onClick={() => setEditingEx('new')}
            className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-4 py-2 rounded-lg font-bold flex items-center gap-2 min-h-[44px]"
          >
            <Plus className="w-4 h-4" /> 新增方案
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {exchange.map((opt) => (
            <div key={opt.id} className="glass-panel rounded-2xl p-5 relative group">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-zinc-100">{opt.label}</h3>
                  {!opt.is_active && <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">停用</span>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                  <button onClick={() => setEditingEx(opt)} className="p-1.5 text-zinc-400 hover:text-amber-400"><Edit2 className="w-4 h-4" /></button>
                  <button
                    onClick={async () => {
                      if (!(await confirm({ message: `刪除方案「${opt.label}」？`, danger: true }))) return;
                      const r = await run(() => deleteExchangeOption(opt.id));
                      if (r?.ok) {
                        setExchange((arr) => arr.filter((x) => x.id !== opt.id));
                        showToast(true, '已刪除');
                      }
                    }}
                    className="p-1.5 text-zinc-400 hover:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-zinc-500">每單位消耗福報</span><span className="text-teal-400">{opt.blessing_cost_per_unit}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">每單位換得金錢</span><span className="text-amber-400">{opt.money_gain_per_unit.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">排序</span><span className="text-zinc-400">{opt.display_order}</span></div>
              </div>
            </div>
          ))}
          {exchange.length === 0 && (
            <div className="col-span-full glass-panel rounded-2xl p-8 text-center text-zinc-500">尚無換匯方案</div>
          )}
        </div>
      </section>

      {/* 銀行借貸方案 */}
      <section>
        <header className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
              <Landmark className="w-6 h-6 text-amber-500" /> 銀行借貸方案
            </h2>
            <p className="text-sm text-zinc-500 mt-1">每方案：每單位抵押福報、可借入金錢、每回合扣金錢/福分。前台不顯示福報資訊。</p>
          </div>
          <button
            onClick={() => setEditingLoan('new')}
            className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-4 py-2 rounded-lg font-bold flex items-center gap-2 min-h-[44px]"
          >
            <Plus className="w-4 h-4" /> 新增方案
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loan.map((opt) => (
            <div key={opt.id} className="glass-panel rounded-2xl p-5 relative group">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-zinc-100">{opt.label}</h3>
                  {!opt.is_active && <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">停用</span>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                  <button onClick={() => setEditingLoan(opt)} className="p-1.5 text-zinc-400 hover:text-amber-400"><Edit2 className="w-4 h-4" /></button>
                  <button
                    onClick={async () => {
                      if (!(await confirm({ message: `刪除方案「${opt.label}」？`, danger: true }))) return;
                      const r = await run(() => deleteBankLoanOption(opt.id));
                      if (r?.ok) {
                        setLoan((arr) => arr.filter((x) => x.id !== opt.id));
                        showToast(true, '已刪除');
                      }
                    }}
                    className="p-1.5 text-zinc-400 hover:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-zinc-500">每單位抵押福報</span><span className="text-teal-400">{opt.blessing_collateral_per_unit}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">每單位借入金錢</span><span className="text-amber-400">{opt.money_per_unit.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">每回合扣金錢</span><span className="text-rose-400">{opt.interest_money_per_round}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">每回合扣福分</span><span className="text-teal-400">{opt.interest_blessing_per_round}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">排序</span><span className="text-zinc-400">{opt.display_order}</span></div>
              </div>
            </div>
          ))}
          {loan.length === 0 && (
            <div className="col-span-full glass-panel rounded-2xl p-8 text-center text-zinc-500">尚無借貸方案</div>
          )}
        </div>
      </section>

      {editingEx && (
        <ExchangeModal
          target={editingEx === 'new' ? null : editingEx}
          onClose={() => setEditingEx(null)}
          onSaved={(saved, isNew) => {
            setExchange((arr) => isNew ? [...arr, saved] : arr.map((x) => x.id === saved.id ? saved : x));
            setEditingEx(null);
            showToast(true, isNew ? '已建立' : '已更新');
          }}
        />
      )}
      {editingLoan && (
        <LoanModal
          target={editingLoan === 'new' ? null : editingLoan}
          onClose={() => setEditingLoan(null)}
          onSaved={(saved, isNew) => {
            setLoan((arr) => isNew ? [...arr, saved] : arr.map((x) => x.id === saved.id ? saved : x));
            setEditingLoan(null);
            showToast(true, isNew ? '已建立' : '已更新');
          }}
        />
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 ${toast.ok ? 'bg-zinc-900 border-amber-500/40 text-amber-300' : 'bg-rose-950 border-rose-700 text-rose-300'} border px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-40`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span className="text-sm">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

function ExchangeModal({
  target, onClose, onSaved,
}: {
  target: ExchangeOptionRow | null;
  onClose: () => void;
  onSaved: (saved: ExchangeOptionRow, isNew: boolean) => void;
}) {
  const isNew = target === null;
  const [label, setLabel] = useState(target?.label ?? '');
  const [bcost, setBcost] = useState<string>(target?.blessing_cost_per_unit.toString() ?? '1');
  const [mgain, setMgain] = useState<string>(target?.money_gain_per_unit.toString() ?? '10');
  const [order, setOrder] = useState<string>(target?.display_order.toString() ?? '0');
  const [active, setActive] = useState(target?.is_active ?? true);
  const { busy, run } = useWriteGuard();
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    setErr(null);
    const payload: ExchangeOptionPayload = {
      id: target?.id,
      label,
      blessing_cost_per_unit: Number(bcost) || 1,
      money_gain_per_unit: Number(mgain) || 1,
      display_order: Number(order) || 0,
      is_active: active,
    };
    const r = await run(() => upsertExchangeOption(payload));
    if (r?.ok) onSaved(r.data!, isNew);
  }

  return (
    <Modal onClose={onClose} title={isNew ? '新增換匯方案' : '編輯換匯方案'}>
      <div className="space-y-3">
        <Field label="方案名稱"><input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="每單位消耗福報"><input type="number" min="1" value={bcost} onChange={(e) => setBcost(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" /></Field>
          <Field label="每單位換得金錢"><input type="number" min="1" value={mgain} onChange={(e) => setMgain(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" /></Field>
        </div>
        <Field label="排序權重（小→上）"><input type="number" value={order} onChange={(e) => setOrder(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" /></Field>
        <label className="flex items-center gap-2 text-zinc-300 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          啟用
        </label>
      </div>
      {err && <p className="mt-3 text-rose-400 text-sm">{err}</p>}
      <ModalButtons onCancel={onClose} onSave={handleSave} busy={busy} disabled={!label} />
    </Modal>
  );
}

function LoanModal({
  target, onClose, onSaved,
}: {
  target: BankLoanOptionRow | null;
  onClose: () => void;
  onSaved: (saved: BankLoanOptionRow, isNew: boolean) => void;
}) {
  const isNew = target === null;
  const [label, setLabel] = useState(target?.label ?? '');
  const [collateral, setCol] = useState<string>(target?.blessing_collateral_per_unit.toString() ?? '1');
  const [money, setMoney] = useState<string>(target?.money_per_unit.toString() ?? '100');
  const [intMoney, setIntMoney] = useState<string>(target?.interest_money_per_round.toString() ?? '5');
  const [intBless, setIntBless] = useState<string>(target?.interest_blessing_per_round.toString() ?? '0');
  const [order, setOrder] = useState<string>(target?.display_order.toString() ?? '0');
  const [active, setActive] = useState(target?.is_active ?? true);
  const { busy, run } = useWriteGuard();
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    setErr(null);
    const payload: BankLoanOptionPayload = {
      id: target?.id,
      label,
      blessing_collateral_per_unit: Number(collateral) || 1,
      money_per_unit: Number(money) || 1,
      interest_money_per_round: Math.max(0, Number(intMoney) || 0),
      interest_blessing_per_round: Math.max(0, Number(intBless) || 0),
      display_order: Number(order) || 0,
      is_active: active,
    };
    const r = await run(() => upsertBankLoanOption(payload));
    if (r?.ok) onSaved(r.data!, isNew);
  }

  return (
    <Modal onClose={onClose} title={isNew ? '新增借貸方案' : '編輯借貸方案'}>
      <div className="space-y-3">
        <Field label="方案名稱"><input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="每單位抵押福報"><input type="number" min="1" value={collateral} onChange={(e) => setCol(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" /></Field>
          <Field label="每單位借入金錢"><input type="number" min="1" value={money} onChange={(e) => setMoney(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" /></Field>
          <Field label="每回合扣金錢（利息）"><input type="number" min="0" value={intMoney} onChange={(e) => setIntMoney(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" /></Field>
          <Field label="每回合扣福分（靜默）"><input type="number" min="0" value={intBless} onChange={(e) => setIntBless(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" /></Field>
        </div>
        <Field label="排序權重（小→上）"><input type="number" value={order} onChange={(e) => setOrder(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" /></Field>
        <label className="flex items-center gap-2 text-zinc-300 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          啟用
        </label>
      </div>
      {err && <p className="mt-3 text-rose-400 text-sm">{err}</p>}
      <ModalButtons onCancel={onClose} onSave={handleSave} busy={busy} disabled={!label} />
    </Modal>
  );
}

function Modal({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
        <h3 className="text-lg font-bold text-zinc-200 mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

function ModalButtons({
  onCancel, onSave, busy, disabled,
}: {
  onCancel: () => void; onSave: () => void; busy: boolean; disabled?: boolean;
}) {
  return (
    <div className="flex gap-3 mt-5">
      <button onClick={onCancel} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm font-bold border border-zinc-700 min-h-[44px]">取消</button>
      <button onClick={onSave} disabled={busy || disabled} className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 py-2 rounded-lg text-sm font-bold min-h-[44px]">
        {busy ? '儲存中…' : '儲存'}
      </button>
    </div>
  );
}
