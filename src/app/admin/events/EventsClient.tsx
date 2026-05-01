'use client';

import { useState, useTransition } from 'react';
import {
  MonitorPlay, Plus, Clock, Key, Copy, Trash2, X, Edit2, ExternalLink,
  AlertCircle, CheckCircle2,
} from 'lucide-react';
import {
  upsertEvent,
  deleteEvent,
  updateBoardConfig,
  issueDisplayToken,
  revokeDisplayToken,
  type EventRow,
  type EventPayload,
  type BoardConfigRow,
  type StockRow,
  type DisplayTokenRow,
} from '@/app/actions/admin';

interface Props {
  initialEvents: EventRow[];
  initialBoard: BoardConfigRow | null;
  stocks: StockRow[];
  initialTokens: DisplayTokenRow[];
}

export default function EventsClient({ initialEvents, initialBoard, stocks, initialTokens }: Props) {
  const [events, setEvents] = useState<EventRow[]>(initialEvents);
  const [board, setBoard] = useState<BoardConfigRow | null>(initialBoard);
  const [tokens, setTokens] = useState<DisplayTokenRow[]>(initialTokens);
  const [editingEvent, setEditingEvent] = useState<EventRow | 'new' | null>(null);
  const [boardBusy, boardBusyTransition] = useTransition();
  const [tokenBusy, tokenBusyTransition] = useTransition();
  const [tokenLabel, setTokenLabel] = useState('主舞台大電視');
  const [tokenDays, setTokenDays] = useState('3');
  const [justIssued, setJustIssued] = useState<{ token: string; jti: string } | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  }

  function handleSaveBoard() {
    if (!board) return;
    boardBusyTransition(async () => {
      const r = await updateBoardConfig({
        title: board.title,
        featured_stock_ids: board.featured_stock_ids,
        color_scheme: board.color_scheme,
        event_rotate_seconds: board.event_rotate_seconds,
      });
      if (r.ok) {
        setBoard(r.data!);
        showToast(true, '已儲存看板設定');
      } else showToast(false, r.error?.message ?? '');
    });
  }

  function handleIssueToken() {
    tokenBusyTransition(async () => {
      const r = await issueDisplayToken(tokenLabel, Number(tokenDays) || 3);
      if (r.ok) {
        setJustIssued({ token: r.data!.token, jti: r.data!.jti });
        setTokens((arr) => [
          { jti: r.data!.jti, label: tokenLabel, expires_at: r.data!.expires_at, revoked_at: null, created_at: new Date().toISOString() },
          ...arr,
        ]);
        showToast(true, '已發行 token');
      } else showToast(false, r.error?.message ?? '');
    });
  }

  async function handleRevokeToken(jti: string) {
    if (!confirm('撤銷此 token？對應的看板畫面將立即失效。')) return;
    const r = await revokeDisplayToken(jti);
    if (r.ok) {
      setTokens((arr) => arr.map((t) => t.jti === jti ? { ...t, revoked_at: new Date().toISOString() } : t));
      showToast(true, '已撤銷');
    } else showToast(false, r.error?.message ?? '');
  }

  function toggleFeatured(stockId: string) {
    if (!board) return;
    const cur = board.featured_stock_ids;
    if (cur.includes(stockId)) {
      setBoard({ ...board, featured_stock_ids: cur.filter((x) => x !== stockId) });
    } else if (cur.length < 4) {
      setBoard({ ...board, featured_stock_ids: [...cur, stockId] });
    } else {
      showToast(false, '最多 4 檔');
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto pb-20">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <MonitorPlay className="w-6 h-6 text-amber-500" /> 看板與事件管理
          </h2>
          <p className="text-sm text-zinc-500 mt-1">設定輪播事件劇情與發行大屏授權</p>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* 左：劇情事件排程 */}
        <div className="xl:col-span-2 space-y-6">
          <div className="flex justify-between items-end">
            <h3 className="text-lg font-bold text-zinc-200">劇情事件排程</h3>
            <button
              onClick={() => setEditingEvent('new')}
              className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center gap-2 min-h-[40px]"
            >
              <Plus className="w-4 h-4" /> 新增事件
            </button>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="text-zinc-500 text-sm border-b border-zinc-800 bg-zinc-900/30">
                  <th className="p-4 font-medium w-16 text-center">優先權</th>
                  <th className="p-4 font-medium">內部標題</th>
                  <th className="p-4 font-medium">看板顯示文字</th>
                  <th className="p-4 font-medium">生效期間</th>
                  <th className="p-4 font-medium text-center">狀態</th>
                  <th className="p-4 font-medium text-right w-20">操作</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300 text-sm">
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors group">
                    <td className="p-4 text-center font-mono text-zinc-500">{e.priority}</td>
                    <td className="p-4 font-semibold text-zinc-200">{e.title}</td>
                    <td className="p-4 text-amber-200 max-w-xs truncate">{e.text}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          {e.start_at ? new Date(e.start_at).toLocaleString() : '不限'} ~ {e.end_at ? new Date(e.end_at).toLocaleString() : '不限'}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      {e.is_active
                        ? <span className="bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded text-xs">啟用中</span>
                        : <span className="bg-zinc-800 text-zinc-500 px-2 py-1 rounded text-xs">停用</span>}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditingEvent(e)} className="p-1.5 text-zinc-400 hover:text-amber-400">
                          <Edit2 className="w-4 h-4" />
                        </button>
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
                  <tr><td colSpan={6} className="p-12 text-center text-zinc-500">尚無事件，按右上角「新增事件」建立</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 右：看板畫面設定 + Display Token */}
        <div className="space-y-6">
          {/* 看板畫面設定 */}
          <div className="glass-panel p-6 rounded-2xl border-t-4 border-t-teal-500">
            <h3 className="text-lg font-bold text-zinc-200 mb-2 flex items-center gap-2">
              <MonitorPlay className="w-5 h-5 text-teal-500" /> 看板畫面設定
            </h3>
            <p className="text-xs text-zinc-400 mb-6">調整大屏投射的版面與重點關注項目</p>

            {board ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">主標題文字</label>
                  <input
                    type="text"
                    value={board.title}
                    onChange={(e) => setBoard({ ...board, title: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    重點曲線商品（最多 4 檔，已選 {board.featured_stock_ids.length}/4）
                  </label>
                  <div className="space-y-1 max-h-40 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-lg p-2">
                    {stocks.length === 0 ? (
                      <p className="text-xs text-zinc-500 text-center py-2">先到「股市商品」建立股票</p>
                    ) : (
                      stocks.map((s) => {
                        const selected = board.featured_stock_ids.includes(s.id);
                        return (
                          <label key={s.id} className={`flex items-center gap-2 text-sm p-1.5 rounded cursor-pointer ${selected ? 'bg-teal-500/10 text-teal-300' : 'text-zinc-300 hover:bg-zinc-800'}`}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleFeatured(s.id)}
                            />
                            <span className="font-mono text-xs">{s.code}</span>
                            <span>{s.name}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">事件輪播間隔（秒）</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={board.event_rotate_seconds}
                    onChange={(e) => setBoard({ ...board, event_rotate_seconds: Number(e.target.value) || 8 })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">顏色主題</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setBoard({ ...board, color_scheme: 'red_up' })}
                      className={`py-2 rounded-lg text-sm font-medium border ${board.color_scheme === 'red_up' ? 'bg-zinc-900 border-teal-500 text-teal-400' : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:bg-zinc-800'}`}
                    >
                      紅漲綠跌
                    </button>
                    <button
                      onClick={() => setBoard({ ...board, color_scheme: 'green_up' })}
                      className={`py-2 rounded-lg text-sm font-medium border ${board.color_scheme === 'green_up' ? 'bg-zinc-900 border-teal-500 text-teal-400' : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:bg-zinc-800'}`}
                    >
                      綠漲紅跌
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleSaveBoard}
                  disabled={boardBusy}
                  className="w-full bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white font-bold py-2.5 rounded-lg transition-colors mt-2 min-h-[44px]"
                >
                  {boardBusy ? '儲存中…' : '儲存看板設定'}
                </button>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">看板設定載入失敗，請重新整理</p>
            )}
          </div>

          {/* Display Token */}
          <div className="glass-panel p-6 rounded-2xl">
            <h3 className="text-lg font-bold text-zinc-200 mb-2 flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-500" /> 授權 Display Token
            </h3>
            <p className="text-xs text-zinc-400 mb-4">大屏設備必須使用含有效 Token 的專屬連結才能顯示畫面。</p>

            <div className="space-y-2 mb-3">
              <input
                type="text"
                value={tokenLabel}
                onChange={(e) => setTokenLabel(e.target.value)}
                placeholder="標籤（例：主舞台、簽到桌螢幕）"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200"
              />
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span>有效天數</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={tokenDays}
                  onChange={(e) => setTokenDays(e.target.value)}
                  className="w-20 bg-zinc-900 border border-zinc-700 rounded p-1 text-center text-zinc-200"
                />
              </div>
            </div>
            <button
              onClick={handleIssueToken}
              disabled={tokenBusy || !tokenLabel}
              className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-zinc-200 font-bold py-2 rounded-lg transition-colors border border-zinc-700 mb-4 flex items-center justify-center gap-2 text-sm min-h-[40px]"
            >
              <Plus className="w-4 h-4" /> {tokenBusy ? '產生中…' : '產生新 Token'}
            </button>

            {justIssued && (
              <div className="bg-amber-950/30 border border-amber-700/50 rounded-lg p-3 mb-3">
                <p className="text-amber-300 text-xs font-bold mb-2">⚡ 剛發行（只顯示一次）</p>
                <div className="flex gap-1 items-center">
                  <input
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/display/board?token=${justIssued.token}`}
                    className="flex-1 bg-zinc-950 border border-amber-700/40 rounded px-2 py-1 text-[0.625rem] text-amber-200 font-mono"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/display/board?token=${justIssued.token}`);
                      showToast(true, '已複製');
                    }}
                    className="bg-amber-500 hover:bg-amber-400 text-zinc-950 p-1.5 rounded"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={`/display/board?token=${justIssued.token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 p-1.5 rounded"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {tokens.length === 0 ? (
                <p className="text-zinc-500 text-xs text-center py-4">尚未發行任何 token</p>
              ) : (
                tokens.map((t) => {
                  const expired = new Date(t.expires_at).getTime() < Date.now();
                  const revoked = !!t.revoked_at;
                  const inactive = expired || revoked;
                  return (
                    <div key={t.jti} className={`bg-zinc-900/80 border border-zinc-800 p-3 rounded-lg ${inactive ? 'opacity-60' : ''}`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-semibold text-zinc-300">{t.label}</span>
                        {revoked
                          ? <span className="text-[0.625rem] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">已撤銷</span>
                          : expired
                            ? <span className="text-[0.625rem] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">已過期</span>
                            : <span className="text-[0.625rem] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">有效</span>}
                      </div>
                      <div className="text-[0.625rem] text-zinc-500 mb-1">
                        到期：{new Date(t.expires_at).toLocaleString()}
                      </div>
                      {!revoked && !expired && (
                        <button
                          onClick={() => handleRevokeToken(t.jti)}
                          className="text-[0.625rem] text-rose-400 hover:text-rose-300"
                        >
                          撤銷此 token
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {editingEvent && (
        <EventModal
          target={editingEvent === 'new' ? null : editingEvent}
          onClose={() => setEditingEvent(null)}
          onSaved={(saved, isNew) => {
            setEvents((arr) => isNew ? [saved, ...arr] : arr.map((x) => x.id === saved.id ? saved : x));
            setEditingEvent(null);
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
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300">
          <X className="w-4 h-4" />
        </button>
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
