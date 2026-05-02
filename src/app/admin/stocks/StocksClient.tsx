'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Activity, Plus, Search, Eye, EyeOff, Edit, Trash2, X,
  CalendarDays, AlertCircle, CheckCircle2,
} from 'lucide-react';
import {
  upsertStock,
  deleteStock,
  upsertStockScriptCell,
  deleteStockScriptCell,
  setRoundEvent,
  deleteWholeRoundScript,
  type StockRow,
  type StockPayload,
  type StockRoundScriptsView,
  type StockScriptCell,
  type ScriptChangeType,
} from '@/app/actions/admin';

interface Props {
  initialStocks: StockRow[];
  initialScripts: StockRoundScriptsView;
}

export default function StocksClient({ initialStocks, initialScripts }: Props) {
  const [stocks, setStocks] = useState<StockRow[]>(initialStocks);
  const [scripts, setScripts] = useState<StockRoundScriptsView>(initialScripts);
  const [editing, setEditing] = useState<StockRow | 'new' | null>(null);
  const [search, setSearch] = useState('');
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

  function handleScriptCellSave(round: number, stockId: string, type: ScriptChangeType, value: string) {
    const num = Number(value);
    // 只有「空值」或「非數字」才刪除 cell。
    // value=0 是合法的：fixed=0 表示暴跌歸零、percent=0 表示該回合鎖定不變（與無腳本走 ±5% 隨機不同）
    if (value.trim() === '' || !Number.isFinite(num)) {
      deleteStockScriptCell(round, stockId).then((r) => {
        if (r.ok) {
          setScripts((s) => {
            const next = { ...s };
            const newCells = { ...next.cells };
            delete newCells[`${round}_${stockId}`];
            return { ...next, cells: newCells };
          });
        }
      });
      return;
    }
    upsertStockScriptCell({ round, stock_id: stockId, change_type: type, change_value: num }).then((r) => {
      if (r.ok) {
        setScripts((s) => ({
          ...s,
          cells: { ...s.cells, [`${round}_${stockId}`]: r.data! },
        }));
      } else showToast(false, r.error?.message ?? '');
    });
  }

  function handleEventSave(round: number, text: string) {
    setRoundEvent(round, text).then((r) => {
      if (r.ok) {
        setScripts((s) => ({
          ...s,
          events: { ...s.events, [round]: text },
        }));
      } else showToast(false, r.error?.message ?? '');
    });
  }

  function handleAddRound() {
    const maxRound = scripts.rounds.length > 0 ? Math.max(...scripts.rounds) : 0;
    setScripts((s) => ({
      ...s,
      rounds: [...s.rounds, maxRound + 1],
    }));
  }

  async function handleDeleteRound(round: number) {
    if (!confirm(`刪除第 ${round} 回合的所有腳本與事件？`)) return;
    const r = await deleteWholeRoundScript(round);
    if (r.ok) {
      setScripts((s) => {
        const cells = { ...s.cells };
        Object.keys(cells).forEach((k) => {
          if (k.startsWith(`${round}_`)) delete cells[k];
        });
        const events = { ...s.events };
        delete events[round];
        return {
          ...s,
          rounds: s.rounds.filter((r) => r !== round),
          cells,
          events,
        };
      });
      showToast(true, `已刪除第 ${round} 回合腳本`);
    } else showToast(false, r.error?.message ?? '');
  }

  const filteredStocks = stocks.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
  });

  return (
    <div className="p-8 max-w-7xl mx-auto pb-20">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Activity className="w-6 h-6 text-amber-500" /> 股市商品管理
          </h2>
          <p className="text-sm text-zinc-500 mt-1">設定遊戲內股市的商品項目與漲跌規則</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          disabled={stocks.length >= 10}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 px-4 py-2 rounded-lg font-bold transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center gap-2 min-h-[40px]"
        >
          <Plus className="w-4 h-4" /> 新增商品
        </button>
      </header>

      {/* 商品列表 */}
      <div className="glass-panel rounded-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋代碼或名稱..."
              className="bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none w-64"
            />
          </div>
          <div className="text-sm text-zinc-500">
            共 {stocks.length} 檔商品（上限 10 檔）
          </div>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left">
            <thead>
              <tr className="text-zinc-500 text-sm border-b border-zinc-800 bg-zinc-900/30">
                <th className="p-4 font-medium">代碼</th>
                <th className="p-4 font-medium">名稱</th>
                <th className="p-4 font-medium text-right">當前價格</th>
                <th className="p-4 font-medium text-center">前台顯示</th>
                <th className="p-4 font-medium text-center">交易狀態</th>
                <th className="p-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300 text-sm">
              {filteredStocks.map((row) => (
                <tr key={row.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors group">
                  <td className="p-4 font-mono font-bold text-amber-400">{row.code}</td>
                  <td className="p-4 font-semibold text-zinc-200">{row.name}</td>
                  <td className="p-4 text-right font-bold text-blue-300">{row.current_price.toLocaleString()}</td>
                  <td className="p-4 text-center">
                    {row.is_visible
                      ? <Eye className="w-4 h-4 mx-auto text-emerald-500" />
                      : <EyeOff className="w-4 h-4 mx-auto text-zinc-600" />}
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded text-xs">買</span>
                      {row.is_sellable
                        ? <span className="bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded text-xs">賣</span>
                        : <span className="bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded text-xs line-through">賣</span>}
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditing(row)} className="p-1.5 text-zinc-400 hover:text-amber-400 hover:bg-amber-400/10 rounded transition-colors" title="編輯設定">
                        <Edit className="w-4 h-4" />
                      </button>
                      <Link href={`/admin/stocks/${row.id}`} className="p-1.5 text-zinc-400 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors" title="查看歷史價格">
                        <Activity className="w-4 h-4" />
                      </Link>
                      <button onClick={() => handleDelete(row)} className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-400/10 rounded transition-colors" title="刪除">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredStocks.length === 0 && (
                <tr><td colSpan={6} className="p-12 text-center text-zinc-500">{search ? '沒有符合條件的商品' : '尚無股票，按右上角「新增商品」建立'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 股市大盤回合腳本總表 */}
      <div className="glass-panel rounded-2xl overflow-hidden flex flex-col mt-8 border-t-4 border-t-blue-500">
        <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-zinc-200 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-blue-500" /> 股市大盤回合腳本總表
            </h3>
            <p className="text-sm text-zinc-400 mt-2">
              統籌設定每一回合各檔股票的漲跌與事件跑馬燈。未填寫的欄位該回合保持隨機波動（±5%）。
            </p>
          </div>
          <button
            onClick={handleAddRound}
            className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-4 py-2 rounded-lg font-bold transition-colors border border-blue-500/30 flex items-center gap-2 text-sm min-h-[40px]"
          >
            <Plus className="w-4 h-4" /> 新增回合
          </button>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-800 bg-zinc-900/80">
                <th className="p-4 font-bold sticky left-0 bg-zinc-900 z-10 w-24 border-r border-zinc-800">回合</th>
                {stocks.map((s) => (
                  <th key={s.id} className="p-4 font-medium text-amber-400 text-center w-32">
                    {s.code}<br />
                    <span className="text-xs text-zinc-500 font-normal">{s.name}</span>
                  </th>
                ))}
                <th className="p-4 font-medium pl-8 w-[400px]">事件跑馬燈（推進回合時推到看板 5 分鐘）</th>
                <th className="p-2 w-12"></th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {scripts.rounds.length === 0 ? (
                <tr>
                  <td colSpan={stocks.length + 3} className="p-8 text-center text-zinc-500">
                    尚未建立任何回合腳本，按右上角「新增回合」開始
                  </td>
                </tr>
              ) : (
                scripts.rounds.map((round) => (
                  <tr key={round} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="p-4 font-bold text-zinc-200 sticky left-0 bg-zinc-900/95 backdrop-blur-sm border-r border-zinc-800">
                      第 {round} 回合
                    </td>
                    {stocks.map((s) => (
                      <td key={s.id} className="p-2 text-center">
                        <ScriptCell
                          cell={scripts.cells[`${round}_${s.id}`]}
                          onSave={(type, value) => handleScriptCellSave(round, s.id, type, value)}
                        />
                      </td>
                    ))}
                    <td className="p-2 pl-8 pr-4">
                      <input
                        type="text"
                        defaultValue={scripts.events[round] ?? ''}
                        placeholder="無特定事件..."
                        onBlur={(e) => {
                          if (e.target.value !== (scripts.events[round] ?? '')) {
                            handleEventSave(round, e.target.value);
                          }
                        }}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 px-3 focus:border-amber-500 focus:outline-none text-amber-400/90"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <button onClick={() => handleDeleteRound(round)} className="p-1.5 text-zinc-500 hover:text-rose-400" title="刪除整回合">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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

function ScriptCell({
  cell, onSave,
}: {
  cell: StockScriptCell | undefined;
  onSave: (type: ScriptChangeType, value: string) => void;
}) {
  const [type, setType] = useState<ScriptChangeType>(cell?.change_type ?? 'percent');
  const [value, setValue] = useState<string>(cell ? String(cell.change_value) : '');

  const hasValue = value.trim() !== '';
  let textColor = 'text-zinc-500';
  if (hasValue) {
    if (value.includes('-')) textColor = 'text-rose-400';
    else if (type === 'fixed') textColor = 'text-blue-300';
    else textColor = 'text-emerald-400';
  }

  return (
    <div className={`flex items-stretch mx-auto w-[110px] bg-zinc-950 border ${hasValue ? 'border-zinc-600' : 'border-zinc-800/50'} rounded focus-within:border-blue-500 overflow-hidden transition-colors`}>
      <select
        value={type}
        onChange={(e) => {
          const newType = e.target.value as ScriptChangeType;
          setType(newType);
          if (hasValue) onSave(newType, value);
        }}
        className="bg-zinc-900 text-zinc-400 text-xs px-1 outline-none border-r border-zinc-800 cursor-pointer"
      >
        <option value="percent">%</option>
        <option value="fixed">$</option>
      </select>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onSave(type, value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        placeholder="-"
        className={`w-full bg-transparent p-1.5 text-center text-sm outline-none font-medium ${textColor}`}
      />
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
