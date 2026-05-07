'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ArrowLeft, Plus, Trash2, X, Edit2, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  upsertQuickAction,
  deleteQuickAction,
  type CaptainStation,
  type QuickActionRow,
  type QuickActionPayload,
} from '@/app/actions/captain';
import { useConfirm } from '@/components/shared/ConfirmProvider';

interface ItemDef { id: string; name: string; icon: string }

interface Props {
  stations: CaptainStation[];
  initialQuickActions: QuickActionRow[];
  items: ItemDef[];
}

export default function CaptainActionsClient({ stations, initialQuickActions, items }: Props) {
  const [list, setList] = useState<QuickActionRow[]>(initialQuickActions);
  const [editing, setEditing] = useState<QuickActionRow | 'new' | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const confirm = useConfirm();

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 pb-12">
      <header className="flex items-center gap-3 mb-4">
        <Link href="/captain" className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-bold text-zinc-100">快捷模組編輯</h1>
        <button
          onClick={() => setEditing('new')}
          disabled={stations.length === 0}
          className="ml-auto bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 px-3 py-2 rounded-lg font-bold flex items-center gap-1 text-sm min-h-[44px]"
        >
          <Plus className="w-4 h-4" /> 新增
        </button>
      </header>

      {stations.length === 0 && (
        <div className="bg-amber-950/30 border border-amber-900/60 text-amber-300 rounded-xl p-3 mb-4 text-sm text-center">
          請先請大會管理員把你指派到至少一個關卡
        </div>
      )}

      <div className="space-y-2">
        {list.map((qa) => (
          <div key={qa.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <div className="flex justify-between items-start mb-2 gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-zinc-100 truncate">{qa.label}</p>
                <p className="text-xs text-zinc-500">{qa.station_name}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setEditing(qa)} className="p-1.5 text-zinc-400 hover:text-amber-400">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={async () => {
                    if (!(await confirm({ message: `刪除快捷模組「${qa.label}」？`, danger: true }))) return;
                    const r = await deleteQuickAction(qa.id);
                    if (r.ok) {
                      setList((arr) => arr.filter((x) => x.id !== qa.id));
                      showToast(true, '已刪除');
                    } else showToast(false, r.error?.message ?? '');
                  }}
                  className="p-1.5 text-zinc-400 hover:text-rose-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap text-xs">
              {qa.delta_money !== 0 && <Badge color="amber" text={`金錢 ${qa.delta_money > 0 ? '+' : ''}${qa.delta_money}`} />}
              {qa.delta_health !== 0 && <Badge color="rose" text={`健康 ${qa.delta_health > 0 ? '+' : ''}${qa.delta_health}`} />}
              {qa.delta_blessing !== 0 && <Badge color="teal" text={`福分 ${qa.delta_blessing > 0 ? '+' : ''}${qa.delta_blessing}`} />}
              {qa.delta_karma !== 0 && <Badge color="purple" text={`業力 ${qa.delta_karma > 0 ? '+' : ''}${qa.delta_karma}`} />}
              {qa.bound_item_name && <Badge color="zinc" text={`🎁 ${qa.bound_item_name}`} />}
            </div>
            <div className="text-xs text-zinc-500 mt-2">
              已用 {qa.global_use_count}{qa.global_max_uses !== null ? ` / ${qa.global_max_uses}` : ''}
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center text-zinc-500 text-sm">
            尚未建立快捷模組
          </div>
        )}
      </div>

      {editing && (
        <QuickActionEditor
          target={editing === 'new' ? null : editing}
          stations={stations}
          items={items}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            setList((arr) => isNew ? [...arr, saved] : arr.map((x) => x.id === saved.id ? saved : x));
            setEditing(null);
            showToast(true, isNew ? '已建立' : '已更新');
          }}
        />
      )}

      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 ${toast.ok ? 'bg-zinc-900 border-amber-500/40 text-amber-300' : 'bg-rose-950 border-rose-700 text-rose-300'} border px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-40 text-sm`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Badge({ color, text }: { color: 'amber' | 'rose' | 'teal' | 'purple' | 'zinc'; text: string }) {
  const map = {
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    teal: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    zinc: 'bg-zinc-700/40 text-zinc-300 border-zinc-600',
  };
  return <span className={`px-2 py-0.5 rounded border ${map[color]}`}>{text}</span>;
}

function QuickActionEditor({
  target, stations, items, onClose, onSaved,
}: {
  target: QuickActionRow | null;
  stations: CaptainStation[];
  items: ItemDef[];
  onClose: () => void;
  onSaved: (saved: QuickActionRow, isNew: boolean) => void;
}) {
  const isNew = target === null;
  const [stationId, setStationId] = useState(target?.station_id ?? stations[0]?.id ?? '');
  const [label, setLabel] = useState(target?.label ?? '');
  const [dm, setDm] = useState(target?.delta_money?.toString() ?? '0');
  const [dh, setDh] = useState(target?.delta_health?.toString() ?? '0');
  const [db, setDb] = useState(target?.delta_blessing?.toString() ?? '0');
  const [dk, setDk] = useState(target?.delta_karma?.toString() ?? '0');
  const [boundItem, setBoundItem] = useState<string>(target?.bound_item_id ?? '');
  const [reqMoney, setReqMoney] = useState(target?.req_money?.toString() ?? '');
  const [reqHealth, setReqHealth] = useState(target?.req_health?.toString() ?? '');
  const [reqBlessing, setReqBlessing] = useState(target?.req_blessing?.toString() ?? '');
  const [reqKarma, setReqKarma] = useState(target?.req_karma?.toString() ?? '');
  const [reqItem, setReqItem] = useState<string>(target?.req_item_id ?? '');
  const [playerMax, setPlayerMax] = useState(target?.player_max_uses?.toString() ?? '');
  const [globalMax, setGlobalMax] = useState(target?.global_max_uses?.toString() ?? '');
  const [busy, busyTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleSave() {
    setErr(null);
    busyTransition(async () => {
      const payload: QuickActionPayload = {
        id: target?.id,
        station_id: stationId,
        label,
        delta_money: Number(dm) || 0,
        delta_health: Number(dh) || 0,
        delta_blessing: Number(db) || 0,
        delta_karma: Number(dk) || 0,
        bound_item_id: boundItem || null,
        req_money: reqMoney ? Number(reqMoney) : null,
        req_health: reqHealth ? Number(reqHealth) : null,
        req_blessing: reqBlessing ? Number(reqBlessing) : null,
        req_karma: reqKarma ? Number(reqKarma) : null,
        req_item_id: reqItem || null,
        player_max_uses: playerMax ? Number(playerMax) : null,
        global_max_uses: globalMax ? Number(globalMax) : null,
      };
      const r = await upsertQuickAction(payload);
      if (r.ok) onSaved(r.data!, isNew);
      else setErr(r.error?.message ?? '儲存失敗');
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-2">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-md max-h-[92vh] overflow-y-auto relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-200">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-lg font-bold text-zinc-200 mb-4">{isNew ? '新增快捷模組' : '編輯快捷模組'}</h3>

        <div className="space-y-3 text-sm">
          <Field label="所屬關卡">
            <select value={stationId} onChange={(e) => setStationId(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200">
              {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="顯示名稱">
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" />
          </Field>

          <fieldset className="border border-zinc-800 rounded-lg p-3 space-y-2">
            <legend className="text-xs text-zinc-500 px-1">套用變動</legend>
            <div className="grid grid-cols-2 gap-2">
              <Num label="金錢" value={dm} onChange={setDm} />
              <Num label="健康" value={dh} onChange={setDh} />
              <Num label="福分" value={db} onChange={setDb} />
              <Num label="業力" value={dk} onChange={setDk} />
            </div>
            <Field label="同時發放道具（選填）">
              <select value={boundItem} onChange={(e) => setBoundItem(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200">
                <option value="">— 不發放 —</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.icon} {it.name}</option>)}
              </select>
            </Field>
          </fieldset>

          <fieldset className="border border-zinc-800 rounded-lg p-3 space-y-2">
            <legend className="text-xs text-zinc-500 px-1">前置條件（留空＝不檢查）</legend>
            <div className="grid grid-cols-2 gap-2">
              <Num label="金錢 ≥" value={reqMoney} onChange={setReqMoney} placeholder="" />
              <Num label="健康 ≥" value={reqHealth} onChange={setReqHealth} placeholder="" />
              <Num label="福分 ≥" value={reqBlessing} onChange={setReqBlessing} placeholder="" />
              <Num label="業力 ≥" value={reqKarma} onChange={setReqKarma} placeholder="" />
            </div>
            <Field label="持有道具">
              <select value={reqItem} onChange={(e) => setReqItem(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200">
                <option value="">— 不檢查 —</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.icon} {it.name}</option>)}
              </select>
            </Field>
          </fieldset>

          <fieldset className="border border-zinc-800 rounded-lg p-3 space-y-2">
            <legend className="text-xs text-zinc-500 px-1">使用上限（留空＝不限）</legend>
            <div className="grid grid-cols-2 gap-2">
              <Num label="每位玩家" value={playerMax} onChange={setPlayerMax} placeholder="" min="1" />
              <Num label="全場累計" value={globalMax} onChange={setGlobalMax} placeholder="" min="1" />
            </div>
          </fieldset>
        </div>

        {err && <p className="text-rose-400 text-sm mt-3">{err}</p>}

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm font-bold border border-zinc-700 min-h-[44px]">
            取消
          </button>
          <button onClick={handleSave} disabled={busy || !label || !stationId} className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 py-2 rounded-lg text-sm font-bold min-h-[44px]">
            {busy ? '儲存中…' : '儲存'}
          </button>
        </div>
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

function Num({
  label, value, onChange, placeholder = '0', min,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; min?: string;
}) {
  return (
    <div>
      <label className="text-xs text-zinc-500">{label}</label>
      <input
        type="number"
        min={min}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
      />
    </div>
  );
}
