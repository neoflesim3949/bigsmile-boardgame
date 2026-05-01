'use client';

import { useState, useTransition } from 'react';
import { Activity, Plus, Edit2, Trash2, X, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { upsertStock, deleteStock, type StockRow, type StockPayload } from '@/app/actions/admin';

interface Props { initialStocks: StockRow[] }

export default function StocksClient({ initialStocks }: Props) {
  const [stocks, setStocks] = useState<StockRow[]>(initialStocks);
  const [editing, setEditing] = useState<StockRow | 'new' | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  }

  async function handleDelete(s: StockRow) {
    if (!confirm(`刪除股票「${s.name}」？所有持股紀錄與歷史價格都會一併刪除。`)) return;
    const r = await deleteStock(s.id);
    if (r.ok) {
      setStocks((arr) => arr.filter((x) => x.id !== s.id));
      showToast(true, '已刪除');
    } else showToast(false, r.error?.message ?? '刪除失敗');
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Activity className="w-6 h-6 text-amber-500" /> 股市商品（≤ 10 檔）
          </h2>
          <p className="text-sm text-zinc-500 mt-1">調整當前價會自動寫入歷史；不顯示但仍可由代碼搜尋購買</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          disabled={stocks.length >= 10}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 px-4 py-2 rounded-lg font-bold transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center gap-2 min-h-[44px]"
        >
          <Plus className="w-4 h-4" /> 新增股票（{stocks.length}/10）
        </button>
      </header>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="text-zinc-500 text-xs border-b border-zinc-800 bg-zinc-900/30">
              <th className="p-4">代碼</th>
              <th className="p-4">名稱</th>
              <th className="p-4 text-right">當前價</th>
              <th className="p-4 text-center">前台顯示</th>
              <th className="p-4 text-center">可賣</th>
              <th className="p-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="text-zinc-200 text-sm">
            {stocks.map((s) => (
              <tr key={s.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 group">
                <td className="p-4 font-mono text-amber-300">{s.code}</td>
                <td className="p-4 font-medium">{s.name}</td>
                <td className="p-4 text-right font-mono text-amber-400">{s.current_price.toLocaleString()}</td>
                <td className="p-4 text-center">
                  {s.is_visible ? <Eye className="w-4 h-4 text-emerald-400 inline" /> : <EyeOff className="w-4 h-4 text-zinc-600 inline" />}
                </td>
                <td className="p-4 text-center">
                  {s.is_sellable ? <span className="text-emerald-400 text-xs">✓</span> : <span className="text-rose-400 text-xs">✗</span>}
                </td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditing(s)} className="p-1.5 text-zinc-400 hover:text-amber-400">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(s)} className="p-1.5 text-zinc-400 hover:text-rose-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {stocks.length === 0 && (
              <tr><td colSpan={6} className="p-12 text-center text-zinc-500">尚無股票，按右上角「新增股票」建立。</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <StockModal
          target={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            setStocks((arr) => isNew ? [...arr, saved] : arr.map((x) => x.id === saved.id ? saved : x));
            setEditing(null);
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

function StockModal({
  target, onClose, onSaved,
}: {
  target: StockRow | null;
  onClose: () => void;
  onSaved: (saved: StockRow, isNew: boolean) => void;
}) {
  const isNew = target === null;
  const [code, setCode] = useState(target?.code ?? '');
  const [name, setName] = useState(target?.name ?? '');
  const [price, setPrice] = useState<string>(target?.current_price.toString() ?? '100');
  const [visible, setVisible] = useState(target?.is_visible ?? true);
  const [sellable, setSellable] = useState(target?.is_sellable ?? true);
  const [busy, busyTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleSave() {
    setErr(null);
    busyTransition(async () => {
      const payload: StockPayload = {
        id: target?.id,
        code: code.toUpperCase(),
        name,
        current_price: Number(price) || 0,
        is_visible: visible,
        is_sellable: sellable,
      };
      const r = await upsertStock(payload);
      if (r.ok) onSaved(r.data!, isNew);
      else setErr(r.error?.message ?? '儲存失敗');
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-lg font-bold text-zinc-200 mb-4">{isNew ? '新增股票' : '編輯股票'}</h3>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500">代碼</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="例：BTC" className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 font-mono uppercase" />
            </div>
            <div>
              <label className="text-xs text-zinc-500">名稱</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" />
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500">當前價（變動會寫入歷史曲線）</label>
            <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
            前台列表顯示（不顯示時玩家仍可由代碼搜尋）
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={sellable} onChange={(e) => setSellable(e.target.checked)} />
            玩家可賣回（取消打勾＝「只進不出」）
          </label>
        </div>

        {err && <p className="mt-3 text-rose-400 text-sm">{err}</p>}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm font-bold border border-zinc-700 min-h-[44px]">取消</button>
          <button onClick={handleSave} disabled={busy || !code || !name} className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 py-2 rounded-lg text-sm font-bold min-h-[44px]">
            {busy ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}
