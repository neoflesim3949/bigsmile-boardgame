'use client';

import { useState, useTransition } from 'react';
import { Package, Plus, Edit2, Trash2, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { upsertItem, deleteItem, type ItemRow, type ItemPayload } from '@/app/actions/admin';
import { useConfirm } from '@/components/shared/ConfirmProvider';

interface Props { initialItems: ItemRow[] }

export default function ItemsClient({ initialItems }: Props) {
  const [items, setItems] = useState<ItemRow[]>(initialItems);
  const [editing, setEditing] = useState<ItemRow | 'new' | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const confirm = useConfirm();

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  }

  async function handleDelete(item: ItemRow) {
    if (!(await confirm({ message: `刪除道具「${item.name}」？玩家持有的此道具與綁定快捷模組的關聯也會一併處理。`, danger: true }))) return;
    const r = await deleteItem(item.id);
    if (r.ok) {
      setItems((arr) => arr.filter((x) => x.id !== item.id));
      showToast(true, '已刪除');
    } else showToast(false, r.error?.message ?? '刪除失敗');
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Package className="w-6 h-6 text-amber-500" /> 道具定義
          </h2>
          <p className="text-sm text-zinc-500 mt-1">管理活動中的道具池（手術執照、財神爺 BUFF…）</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-4 py-2 rounded-lg font-bold transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center gap-2 min-h-[44px]"
        >
          <Plus className="w-4 h-4" /> 新增道具
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((it) => (
          <div key={it.id} className="glass-panel rounded-2xl p-5 relative group">
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-3">
                <div className="text-3xl">{it.icon || '🎁'}</div>
                <div>
                  <h3 className="font-bold text-zinc-100">{it.name}</h3>
                  {!it.is_active && <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">停用</span>}
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditing(it)} className="p-1.5 text-zinc-400 hover:text-amber-400">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(it)} className="p-1.5 text-zinc-400 hover:text-rose-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-sm text-zinc-500 leading-relaxed line-clamp-3">{it.description || '—'}</p>
          </div>
        ))}
        {items.length === 0 && (
          <div className="col-span-full glass-panel rounded-2xl p-12 text-center text-zinc-500">
            尚無道具，按右上角「新增道具」建立。
          </div>
        )}
      </div>

      {editing && (
        <ItemModal
          target={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            setItems((arr) => {
              if (isNew) return [...arr, saved];
              return arr.map((x) => (x.id === saved.id ? saved : x));
            });
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

function ItemModal({
  target, onClose, onSaved,
}: {
  target: ItemRow | null;
  onClose: () => void;
  onSaved: (saved: ItemRow, isNew: boolean) => void;
}) {
  const isNew = target === null;
  const [name, setName] = useState(target?.name ?? '');
  const [icon, setIcon] = useState(target?.icon ?? '🎁');
  const [description, setDesc] = useState(target?.description ?? '');
  const [isActive, setIsActive] = useState(target?.is_active ?? true);
  const [busy, busyTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleSave() {
    setErr(null);
    busyTransition(async () => {
      const payload: ItemPayload = { id: target?.id, name, icon, description, is_active: isActive };
      const r = await upsertItem(payload);
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
        <h3 className="text-lg font-bold text-zinc-200 mb-4">{isNew ? '新增道具' : '編輯道具'}</h3>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-zinc-500">名稱</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" />
            </div>
            <div>
              <label className="text-xs text-zinc-500">圖示</label>
              <input value={icon} onChange={(e) => setIcon(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 text-center text-xl" />
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500">描述</label>
            <textarea value={description} onChange={(e) => setDesc(e.target.value)} rows={3} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-zinc-300 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            啟用
          </label>
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
