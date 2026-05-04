'use client';

import { useState, useTransition } from 'react';
import { MapPin, Plus, Edit2, Trash2, X, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import {
  upsertStation,
  deleteStation,
  type StationRow,
  type StationPayload,
} from '@/app/actions/admin';

interface Captain { user_id: string; name: string }

interface Props {
  initialStations: StationRow[];
  captains: Captain[];
}

export default function StationsClient({ initialStations, captains }: Props) {
  const [stations, setStations] = useState<StationRow[]>(initialStations);
  const [editing, setEditing] = useState<StationRow | 'new' | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  }

  async function handleDelete(s: StationRow) {
    if (!confirm(`確定刪除關卡「${s.name}」？\n關聯的快捷模組與使用紀錄也會被刪除。`)) return;
    const r = await deleteStation(s.id);
    if (r.ok) {
      setStations((arr) => arr.filter((x) => x.id !== s.id));
      showToast(true, '已刪除');
    } else showToast(false, r.error?.message ?? '刪除失敗');
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-amber-500" /> 關卡與關主指派
          </h2>
          <p className="text-sm text-zinc-500 mt-1">建立關卡、指派關主、設定限額與重生鍵權限</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-4 py-2 rounded-lg font-bold transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center gap-2 min-h-[44px]"
        >
          <Plus className="w-4 h-4" /> 新增關卡
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stations.map((s) => {
          const captainNames = s.captain_user_ids
            .map((uid) => captains.find((c) => c.user_id === uid)?.name ?? uid)
            .join('、');
          return (
            <div key={s.id} className="glass-panel rounded-2xl p-5 relative group">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-bold text-zinc-100">{s.name}</h3>
                    {s.allow_rebirth && (
                      <span className="px-2 py-0.5 rounded text-xs bg-purple-500/10 text-purple-400 border border-purple-500/30 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> 重生鍵
                      </span>
                    )}
                    {s.allow_stock_sell_multiplier && (
                      <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        股票加乘賣出
                      </span>
                    )}
                    {!s.is_active && <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">停用</span>}
                  </div>
                  {s.description && <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{s.description}</p>}
                </div>
                <div className="flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setEditing(s)} className="p-1.5 text-zinc-400 hover:text-amber-400">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(s)} className="p-1.5 text-zinc-400 hover:text-rose-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">關主</span>
                  <span className="text-zinc-300">{captainNames || '未指派'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">每玩家上限</span>
                  <span className="text-zinc-300">{s.player_max_uses ?? '不限'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">全場上限</span>
                  <span className="text-zinc-300">{s.global_max_uses ?? '不限'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">已使用</span>
                  <span className="text-amber-400">{s.global_use_count}</span>
                </div>
              </div>
            </div>
          );
        })}
        {stations.length === 0 && (
          <div className="col-span-2 glass-panel rounded-2xl p-12 text-center text-zinc-500">
            尚無關卡，按右上角「新增關卡」建立。
          </div>
        )}
      </div>

      {editing && (
        <StationModal
          target={editing === 'new' ? null : editing}
          captains={captains}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            setStations((arr) => {
              if (isNew) return [...arr, saved];
              return arr.map((x) => (x.id === saved.id ? saved : x));
            });
            setEditing(null);
            showToast(true, isNew ? '已建立關卡' : '已更新關卡');
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

function StationModal({
  target, captains, onClose, onSaved,
}: {
  target: StationRow | null;
  captains: Captain[];
  onClose: () => void;
  onSaved: (saved: StationRow, isNew: boolean) => void;
}) {
  const isNew = target === null;
  const [name, setName] = useState(target?.name ?? '');
  const [description, setDesc] = useState(target?.description ?? '');
  const [captainIds, setCaptainIds] = useState<string[]>(target?.captain_user_ids ?? []);
  const [allowRebirth, setAllowRebirth] = useState(target?.allow_rebirth ?? false);
  const [allowStockMult, setAllowStockMult] = useState(target?.allow_stock_sell_multiplier ?? false);
  const [playerMax, setPlayerMax] = useState<string>(target?.player_max_uses?.toString() ?? '');
  const [globalMax, setGlobalMax] = useState<string>(target?.global_max_uses?.toString() ?? '');
  const [isActive, setIsActive] = useState(target?.is_active ?? true);
  const [busy, busyTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function toggleCaptain(uid: string) {
    setCaptainIds((arr) => (arr.includes(uid) ? arr.filter((x) => x !== uid) : [...arr, uid]));
  }

  function handleSave() {
    setErr(null);
    busyTransition(async () => {
      const payload: StationPayload = {
        id: target?.id,
        name,
        description,
        captain_user_ids: captainIds,
        allow_rebirth: allowRebirth,
        allow_stock_sell_multiplier: allowStockMult,
        player_max_uses: playerMax ? Number(playerMax) : null,
        global_max_uses: globalMax ? Number(globalMax) : null,
        is_active: isActive,
      };
      const r = await upsertStation(payload);
      if (r.ok) onSaved(r.data!, isNew);
      else setErr(r.error?.message ?? '儲存失敗');
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-lg font-bold text-zinc-200 mb-4">{isNew ? '新增關卡' : '編輯關卡'}</h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500">關卡名稱</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" />
          </div>
          <div>
            <label className="text-xs text-zinc-500">描述</label>
            <textarea value={description} onChange={(e) => setDesc(e.target.value)} rows={2} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 text-sm" />
          </div>
          <div>
            <label className="text-xs text-zinc-500">指派關主（複選）</label>
            <div className="border border-zinc-700 rounded-lg p-2 max-h-40 overflow-y-auto bg-zinc-950">
              {captains.length === 0 ? (
                <p className="text-xs text-zinc-500 p-2">尚無 captain 角色帳號，請先到「帳號管理」建立關主</p>
              ) : (
                captains.map((c) => (
                  <label key={c.user_id} className="flex items-center gap-2 text-sm text-zinc-300 py-1 px-1 hover:bg-zinc-900 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={captainIds.includes(c.user_id)}
                      onChange={() => toggleCaptain(c.user_id)}
                    />
                    {c.name} <span className="text-zinc-500 text-xs">({c.user_id})</span>
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500">每玩家上限（留空＝不限）</label>
              <input type="number" min="1" value={playerMax} onChange={(e) => setPlayerMax(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" />
            </div>
            <div>
              <label className="text-xs text-zinc-500">全場上限（留空＝不限）</label>
              <input type="number" min="1" value={globalMax} onChange={(e) => setGlobalMax(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" />
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <label className="flex items-center gap-2 text-zinc-300 text-sm">
              <input type="checkbox" checked={allowRebirth} onChange={(e) => setAllowRebirth(e.target.checked)} />
              <Sparkles className="w-4 h-4 text-purple-400" />
              關主可使用「重生鍵」（地獄狀態玩家掃 QR 才會出現）
            </label>
            <label className="flex items-center gap-2 text-zinc-300 text-sm">
              <input type="checkbox" checked={allowStockMult} onChange={(e) => setAllowStockMult(e.target.checked)} />
              <span className="text-emerald-400">📈</span>
              關主可使用「股票加乘賣出」（自設倍率代售玩家持股）
            </label>
            <label className="flex items-center gap-2 text-zinc-300 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              啟用此關卡
            </label>
          </div>
        </div>

        {err && <p className="mt-3 text-rose-400 text-sm">{err}</p>}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm font-bold border border-zinc-700 min-h-[44px]">取消</button>
          <button onClick={handleSave} disabled={busy || !name} className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 py-2 rounded-lg text-sm font-bold min-h-[44px]">
            {busy ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}
