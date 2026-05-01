'use client';

import { useState, useTransition } from 'react';
import { MonitorPlay, Plus, Edit2, Trash2, X, Megaphone, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  upsertEvent,
  deleteEvent,
  publishMarquee,
  clearMarquee,
  type EventRow,
  type EventPayload,
} from '@/app/actions/admin';

interface Props {
  initialEvents: EventRow[];
  initialMarquee: { text: string; until: string | null };
}

export default function EventsClient({ initialEvents, initialMarquee }: Props) {
  const [events, setEvents] = useState<EventRow[]>(initialEvents);
  const [marqueeText, setMarqueeText] = useState(initialMarquee.text);
  const [marqueeMins, setMarqueeMins] = useState('60');
  const [marqueeBusy, marqueeTransition] = useTransition();
  const [editing, setEditing] = useState<EventRow | 'new' | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  }

  function handlePublish() {
    marqueeTransition(async () => {
      const r = await publishMarquee(marqueeText, Number(marqueeMins) || 60);
      if (r.ok) showToast(true, '已發布跑馬燈');
      else showToast(false, r.error?.message ?? '發布失敗');
    });
  }

  function handleClearMarquee() {
    marqueeTransition(async () => {
      const r = await clearMarquee();
      if (r.ok) {
        setMarqueeText('');
        showToast(true, '已清除');
      } else showToast(false, r.error?.message ?? '');
    });
  }

  return (
    <div className="p-8 max-w-6xl mx-auto pb-20 space-y-8">
      {/* 跑馬燈 */}
      <section className="glass-panel rounded-2xl p-6 border-l-4 border-l-amber-500">
        <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2 mb-2">
          <Megaphone className="w-5 h-5 text-amber-500" /> 跑馬燈即時發布
        </h2>
        <p className="text-xs text-zinc-500 mb-4">寫入 BoardConfig.marquee_text，看板透過 Realtime 立即顯示。TTL 上限由 AppSettings.BoardMarqueeMaxMinutes 控制（預設 120 分鐘）。</p>
        <div className="flex flex-col md:flex-row gap-3">
          <input
            value={marqueeText}
            onChange={(e) => setMarqueeText(e.target.value)}
            placeholder="跑馬燈文字…"
            className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
          />
          <input
            type="number"
            min="1"
            value={marqueeMins}
            onChange={(e) => setMarqueeMins(e.target.value)}
            className="w-28 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
            title="TTL 分鐘"
          />
          <button
            onClick={handlePublish}
            disabled={marqueeBusy || !marqueeText}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 px-4 py-2 rounded-lg font-bold min-h-[44px]"
          >
            發布
          </button>
          <button
            onClick={handleClearMarquee}
            disabled={marqueeBusy}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg text-sm border border-zinc-700 min-h-[44px]"
          >
            清除
          </button>
        </div>
        {initialMarquee.until && (
          <p className="text-xs text-zinc-500 mt-2">目前生效至：{new Date(initialMarquee.until).toLocaleString()}</p>
        )}
      </section>

      {/* Events */}
      <section>
        <header className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
              <MonitorPlay className="w-6 h-6 text-amber-500" /> 看板事件
            </h2>
            <p className="text-sm text-zinc-500 mt-1">看板下方輪播事件清單。priority 越大越優先；start_at / end_at 控制顯示時段。</p>
          </div>
          <button
            onClick={() => setEditing('new')}
            className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-4 py-2 rounded-lg font-bold flex items-center gap-2 min-h-[44px]"
          >
            <Plus className="w-4 h-4" /> 新增事件
          </button>
        </header>

        <div className="glass-panel rounded-2xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="text-zinc-500 text-xs border-b border-zinc-800 bg-zinc-900/30">
                <th className="p-4">標題</th>
                <th className="p-4">內容</th>
                <th className="p-4">時段</th>
                <th className="p-4 text-center">優先度</th>
                <th className="p-4 text-center">狀態</th>
                <th className="p-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="text-zinc-200 text-sm">
              {events.map((e) => (
                <tr key={e.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 group">
                  <td className="p-4 font-medium">{e.title}</td>
                  <td className="p-4 text-zinc-400 max-w-md truncate">{e.text}</td>
                  <td className="p-4 text-xs text-zinc-500">
                    {e.start_at ? new Date(e.start_at).toLocaleString() : '隨時'} ~<br />
                    {e.end_at ? new Date(e.end_at).toLocaleString() : '永久'}
                  </td>
                  <td className="p-4 text-center text-zinc-300">{e.priority}</td>
                  <td className="p-4 text-center">
                    {e.is_active ? <span className="text-emerald-400 text-xs">啟用</span> : <span className="text-zinc-500 text-xs">停用</span>}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                      <button onClick={() => setEditing(e)} className="p-1.5 text-zinc-400 hover:text-amber-400"><Edit2 className="w-4 h-4" /></button>
                      <button
                        onClick={async () => {
                          if (!confirm(`刪除事件「${e.title}」？`)) return;
                          const r = await deleteEvent(e.id);
                          if (r.ok) {
                            setEvents((arr) => arr.filter((x) => x.id !== e.id));
                            showToast(true, '已刪除');
                          } else showToast(false, r.error?.message ?? '');
                        }}
                        className="p-1.5 text-zinc-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={6} className="p-12 text-center text-zinc-500">尚無事件</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <EventModal
          target={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            setEvents((arr) => isNew ? [...arr, saved] : arr.map((x) => x.id === saved.id ? saved : x));
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

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // datetime-local format: yyyy-mm-ddThh:mm
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function EventModal({
  target, onClose, onSaved,
}: {
  target: EventRow | null;
  onClose: () => void;
  onSaved: (saved: EventRow, isNew: boolean) => void;
}) {
  const isNew = target === null;
  const [title, setTitle] = useState(target?.title ?? '');
  const [text, setText] = useState(target?.text ?? '');
  const [startAt, setStartAt] = useState(toLocalInput(target?.start_at ?? null));
  const [endAt, setEndAt] = useState(toLocalInput(target?.end_at ?? null));
  const [priority, setPriority] = useState<string>(target?.priority.toString() ?? '0');
  const [active, setActive] = useState(target?.is_active ?? true);
  const [busy, busyTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleSave() {
    setErr(null);
    busyTransition(async () => {
      const payload: EventPayload = {
        id: target?.id,
        title,
        text,
        start_at: fromLocalInput(startAt),
        end_at: fromLocalInput(endAt),
        priority: Number(priority) || 0,
        is_active: active,
      };
      const r = await upsertEvent(payload);
      if (r.ok) onSaved(r.data!, isNew);
      else setErr(r.error?.message ?? '儲存失敗');
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
        <h3 className="text-lg font-bold text-zinc-200 mb-4">{isNew ? '新增事件' : '編輯事件'}</h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500">內部識別標題</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" />
          </div>
          <div>
            <label className="text-xs text-zinc-500">看板顯示文字</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500">開始時間（留空＝立即）</label>
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 text-sm" />
            </div>
            <div>
              <label className="text-xs text-zinc-500">結束時間（留空＝永久）</label>
              <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500">優先度（越大越優先）</label>
            <input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" />
          </div>
          <label className="flex items-center gap-2 text-zinc-300 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            啟用
          </label>
        </div>

        {err && <p className="mt-3 text-rose-400 text-sm">{err}</p>}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm font-bold border border-zinc-700 min-h-[44px]">取消</button>
          <button onClick={handleSave} disabled={busy || !title || !text} className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 py-2 rounded-lg text-sm font-bold min-h-[44px]">
            {busy ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}
