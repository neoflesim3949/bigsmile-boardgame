'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Edit2, Trash2, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  upsertStationSellMultiplier,
  deleteStationSellMultiplier,
  type CaptainStation,
  type SellMultiplierRow,
} from '@/app/actions/captain';

interface ItemLite { id: string; name: string; icon: string }

export default function MultipliersClient({
  stations, initialMultipliers, items, blessingDivisor,
}: {
  stations: CaptainStation[];
  initialMultipliers: SellMultiplierRow[];
  items: ItemLite[];
  blessingDivisor: number;
}) {
  const [mults, setMults] = useState<SellMultiplierRow[]>(initialMultipliers);
  const [editing, setEditing] = useState<{ stationId: string; row: SellMultiplierRow | null } | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const itemMap = new Map(items.map((i) => [i.id, i]));

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 pb-12">
      <header className="flex items-center gap-3 mb-6">
        <Link href="/captain" className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">股票加乘賣出 · 倍率管理</h1>
          <p className="text-xs text-zinc-500 mt-0.5">每個關卡自管一套倍率方案；掃玩家 QR 後可選用</p>
        </div>
      </header>

      {stations.length === 0 ? (
        <div className="bg-amber-950/30 border border-amber-900/60 text-amber-300 rounded-xl p-4 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-bold mb-1">你目前沒有開放「股票加乘賣出」的關卡</p>
            <p className="text-xs">請聯絡大會管理員為你的關卡開啟此功能（在 /admin/stations 編輯關卡時勾選）。</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {stations.map((s) => {
            const stationMults = mults.filter((m) => m.station_id === s.id);
            return (
              <section key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <div className="flex justify-between items-center mb-3 border-b border-zinc-800 pb-3">
                  <div>
                    <h2 className="font-bold text-zinc-100">{s.name}</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">{stationMults.length} 個倍率方案</p>
                  </div>
                  <button
                    onClick={() => setEditing({ stationId: s.id, row: null })}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 min-h-[36px]"
                  >
                    <Plus className="w-3 h-3" /> 新增倍率
                  </button>
                </div>
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                        <th className="py-2 pr-3">方案名稱</th>
                        <th className="py-2 pr-3 text-right">金錢倍率</th>
                        <th className="py-2 pr-3 text-right">福分扣分倍率</th>
                        <th className="py-2 pr-3">所需道具</th>
                        <th className="py-2 pr-3 text-center">啟用</th>
                        <th className="py-2 pr-3 text-right">排序</th>
                        <th className="py-2 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stationMults.map((m) => (
                        <tr key={m.id} className="border-b border-zinc-800/60">
                          <td className="py-2 pr-3 font-medium text-zinc-200">{m.label}</td>
                          <td className="py-2 pr-3 text-right text-emerald-400 font-mono">×{m.money_multiplier}</td>
                          <td className="py-2 pr-3 text-right text-rose-400 font-mono">×{m.blessing_penalty_multiplier}</td>
                          <td className="py-2 pr-3">
                            {m.req_item_ids.length === 0 ? (
                              <span className="text-xs text-zinc-600">無</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {m.req_item_ids.map((iid) => {
                                  const it = itemMap.get(iid);
                                  return (
                                    <span key={iid} className="inline-flex items-center gap-0.5 bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-1.5 py-0.5">
                                      <span>{it?.icon ?? '❓'}</span>
                                      <span>{it?.name ?? '(已刪除)'}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded ${m.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                              {m.is_active ? '啟用' : '停用'}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-right text-zinc-400 font-mono">{m.sort_order}</td>
                          <td className="py-2 text-right whitespace-nowrap">
                            <button onClick={() => setEditing({ stationId: s.id, row: m })} className="p-1.5 text-zinc-400 hover:text-amber-400">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm(`確定刪除倍率「${m.label}」？`)) return;
                                const r = await deleteStationSellMultiplier(m.id);
                                if (r.ok) {
                                  setMults((arr) => arr.filter((x) => x.id !== m.id));
                                  showToast(true, '已刪除');
                                } else showToast(false, r.error?.message ?? '刪除失敗');
                              }}
                              className="p-1.5 text-zinc-400 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {stationMults.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-zinc-500 text-sm">尚無倍率，按右上方「新增倍率」建立。</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {editing && (
        <MultiplierModal
          stationId={editing.stationId}
          target={editing.row}
          items={items}
          blessingDivisor={blessingDivisor}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setMults((arr) => {
              const idx = arr.findIndex((x) => x.id === saved.id);
              if (idx >= 0) {
                const copy = [...arr];
                copy[idx] = saved;
                return copy;
              }
              return [...arr, saved];
            });
            setEditing(null);
            showToast(true, '已儲存');
          }}
        />
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 ${toast.ok ? 'bg-zinc-900 border-emerald-500/40 text-emerald-300' : 'bg-rose-950 border-rose-700 text-rose-300'} border px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-40`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span className="text-sm">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

function MultiplierModal({
  stationId, target, items, blessingDivisor, onClose, onSaved,
}: {
  stationId: string;
  target: SellMultiplierRow | null;
  items: ItemLite[];
  blessingDivisor: number;
  onClose: () => void;
  onSaved: (m: SellMultiplierRow) => void;
}) {
  const [label, setLabel] = useState(target?.label ?? '');
  const [moneyMult, setMoneyMult] = useState(target?.money_multiplier?.toString() ?? '1');
  const [blessingMult, setBlessingMult] = useState(target?.blessing_penalty_multiplier?.toString() ?? '1');
  const [reqItemIds, setReqItemIds] = useState<string[]>(target?.req_item_ids ?? []);
  const [sortOrder, setSortOrder] = useState(target?.sort_order?.toString() ?? '0');
  const [isActive, setIsActive] = useState(target?.is_active ?? true);
  const [busy, busyTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function toggleItem(id: string) {
    setReqItemIds((arr) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  }

  function handleSave() {
    setErr(null);
    busyTransition(async () => {
      const r = await upsertStationSellMultiplier({
        id: target?.id,
        station_id: stationId,
        label,
        money_multiplier: Number(moneyMult) || 0,
        blessing_penalty_multiplier: Number(blessingMult) || 0,
        req_item_ids: reqItemIds,
        sort_order: Number(sortOrder) || 0,
        is_active: isActive,
      });
      if (r.ok) onSaved(r.data!);
      else setErr(r.error?.message ?? '儲存失敗');
    });
  }

  // 預覽：1 萬獲利時的影響（divisor 來自 AppSettings.StockSellBlessingPenaltyDivisor）
  const profit = 10000;
  const moneyMultNum = Number(moneyMult) || 0;
  const blessingMultNum = Number(blessingMult) || 0;
  const bonusPreview = Math.round(profit * (moneyMultNum - 1));
  const blessingPenaltyPreview = Math.round((profit * blessingMultNum) / blessingDivisor);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-lg font-bold text-zinc-200 mb-4">{target?.id ? '編輯倍率' : '新增倍率'}</h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500">方案名稱</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例：拜財神爺 buff" className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-emerald-400">金錢倍率（×）</label>
              <input type="number" step="0.1" min="0" value={moneyMult} onChange={(e) => setMoneyMult(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 font-mono" />
            </div>
            <div>
              <label className="text-xs text-rose-400">福分扣分倍率（×）</label>
              <input type="number" step="0.1" min="0" value={blessingMult} onChange={(e) => setBlessingMult(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 font-mono" />
            </div>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400">
            <p className="font-bold text-zinc-300 mb-1">📊 預覽（假設獲利 $10,000）</p>
            <p>額外金錢加成：<span className="text-emerald-400 font-mono">+${bonusPreview.toLocaleString()}</span></p>
            <p>福分扣除：<span className="text-rose-400 font-mono">−{blessingPenaltyPreview}</span></p>
            <p className="text-zinc-500 mt-1 italic">基礎規則：每 1,000 獲利扣 0.1 福分；賠錢時不扣福分</p>
          </div>
          <div>
            <label className="text-xs text-zinc-500">前置條件 — 須持有道具（複選，全部具備才符合）</label>
            {items.length === 0 ? (
              <p className="text-xs text-zinc-600 mt-1">目前系統沒有任何道具可選</p>
            ) : (
              <div className="mt-1 max-h-40 overflow-y-auto border border-zinc-700 rounded-lg bg-zinc-950 p-2 space-y-1">
                {items.map((it) => {
                  const checked = reqItemIds.includes(it.id);
                  return (
                    <label
                      key={it.id}
                      className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${checked ? 'bg-emerald-500/15' : 'hover:bg-zinc-900'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleItem(it.id)}
                        className="accent-emerald-500"
                      />
                      <span className="text-base">{it.icon}</span>
                      <span className="text-sm text-zinc-200">{it.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-[0.6875rem] text-zinc-500 mt-1">
              {reqItemIds.length === 0
                ? '未設前置條件 → 任何玩家都可使用此倍率'
                : `已選 ${reqItemIds.length} 項 → 玩家須同時持有這 ${reqItemIds.length} 項道具`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500">排序（小者優先）</label>
              <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 font-mono" />
            </div>
            <label className="flex items-end gap-2 text-sm text-zinc-300 pb-2">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              啟用
            </label>
          </div>
        </div>

        {err && <p className="mt-3 text-rose-400 text-sm">{err}</p>}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm font-bold border border-zinc-700 min-h-[44px]">取消</button>
          <button onClick={handleSave} disabled={busy || !label} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-bold min-h-[44px]">
            {busy ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}
