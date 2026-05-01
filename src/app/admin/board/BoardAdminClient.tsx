'use client';

import { useState, useTransition } from 'react';
import { Tv2, Save, QrCode, ClipboardCopy, Trash2, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import {
  updateBoardConfig,
  issueDisplayToken,
  revokeDisplayToken,
  type BoardConfigRow,
  type StockRow,
  type DisplayTokenRow,
} from '@/app/actions/admin';

interface Props {
  initialBoard: BoardConfigRow | null;
  stocks: StockRow[];
  initialTokens: DisplayTokenRow[];
}

export default function BoardAdminClient({ initialBoard, stocks, initialTokens }: Props) {
  const [board, setBoard] = useState<BoardConfigRow | null>(initialBoard);
  const [tokens, setTokens] = useState<DisplayTokenRow[]>(initialTokens);
  const [busy, busyTransition] = useTransition();
  const [tokenBusy, tokenBusyTransition] = useTransition();
  const [tokenLabel, setTokenLabel] = useState('主舞台螢幕');
  const [tokenDays, setTokenDays] = useState('3');
  const [tokenJustIssued, setJustIssued] = useState<{ token: string; jti: string } | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  }

  if (!board) {
    return (
      <div className="p-8 text-zinc-400">載入失敗，請重新整理。</div>
    );
  }

  function handleSaveBoard() {
    if (!board) return;
    busyTransition(async () => {
      const r = await updateBoardConfig({
        title: board.title,
        featured_stock_ids: board.featured_stock_ids,
        color_scheme: board.color_scheme,
        event_rotate_seconds: board.event_rotate_seconds,
      });
      if (r.ok) {
        setBoard(r.data!);
        showToast(true, '已更新看板設定');
      } else showToast(false, r.error?.message ?? '');
    });
  }

  function handleIssueToken() {
    tokenBusyTransition(async () => {
      const r = await issueDisplayToken(tokenLabel, Number(tokenDays) || 3);
      if (r.ok) {
        setJustIssued({ token: r.data!.token, jti: r.data!.jti });
        setTokens((arr) => [
          {
            jti: r.data!.jti,
            label: tokenLabel,
            expires_at: r.data!.expires_at,
            revoked_at: null,
            created_at: new Date().toISOString(),
          },
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
    <div className="p-8 max-w-6xl mx-auto pb-20 space-y-8">
      {/* 看板版型 */}
      <section className="glass-panel rounded-2xl p-6">
        <header className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
              <Tv2 className="w-6 h-6 text-amber-500" /> 活動看板版型
            </h2>
            <p className="text-sm text-zinc-500 mt-1">控制 /display/board 的顯示內容（透過 Realtime 即時推送到看板）。</p>
          </div>
          <button
            onClick={handleSaveBoard}
            disabled={busy}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 px-4 py-2 rounded-lg font-bold flex items-center gap-2 min-h-[44px]"
          >
            <Save className="w-4 h-4" /> {busy ? '儲存中…' : '儲存版型'}
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-xs text-zinc-500">看板標題</label>
            <input
              value={board.title}
              onChange={(e) => setBoard({ ...board, title: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">事件輪播間隔（秒）</label>
            <input
              type="number"
              min="1"
              max="60"
              value={board.event_rotate_seconds}
              onChange={(e) => setBoard({ ...board, event_rotate_seconds: Number(e.target.value) || 8 })}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">配色方案</label>
            <select
              value={board.color_scheme}
              onChange={(e) => setBoard({ ...board, color_scheme: e.target.value as 'red_up' | 'green_up' })}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
            >
              <option value="red_up">紅漲綠跌（亞洲市場慣用）</option>
              <option value="green_up">綠漲紅跌（歐美慣用）</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500">回合資訊（read-only）</label>
            <div className="bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-300 text-sm">
              第 {board.current_round} 回合 ／ {board.last_tick_at ? `上次 ${new Date(board.last_tick_at).toLocaleTimeString()}` : '尚未開始'}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <label className="text-xs text-zinc-500">重點曲線商品（最多 4 檔）— 已選 {board.featured_stock_ids.length}/4</label>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mt-2">
            {stocks.map((s) => {
              const selected = board.featured_stock_ids.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleFeatured(s.id)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    selected
                      ? 'bg-amber-500/10 border-amber-500/60 text-amber-300'
                      : 'bg-zinc-950 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                  }`}
                >
                  <div className="font-mono text-xs">{s.code}</div>
                  <div className="text-sm font-medium">{s.name}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Display tokens */}
      <section className="glass-panel rounded-2xl p-6">
        <header className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-amber-500" /> 看板存取憑證
            </h2>
            <p className="text-xs text-zinc-500 mt-1">每張螢幕一個 token；可隨時撤銷。看板 URL：{`/display/board?token=...`}</p>
          </div>
        </header>

        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <input
            value={tokenLabel}
            onChange={(e) => setTokenLabel(e.target.value)}
            placeholder="標籤（例：主舞台、簽到桌螢幕）"
            className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
          />
          <input
            type="number"
            min="1"
            max="30"
            value={tokenDays}
            onChange={(e) => setTokenDays(e.target.value)}
            className="w-28 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
            title="TTL 天數"
          />
          <button
            onClick={handleIssueToken}
            disabled={tokenBusy || !tokenLabel}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 px-4 py-2 rounded-lg font-bold min-h-[44px]"
          >
            {tokenBusy ? '發行中…' : '發行 token'}
          </button>
        </div>

        {tokenJustIssued && (
          <div className="bg-amber-950/30 border border-amber-700/50 rounded-lg p-4 mb-4">
            <p className="text-amber-300 text-sm font-medium mb-2">⚡ 剛發行的 token（只顯示一次，請立即複製或開啟看板）</p>
            <div className="flex gap-2 items-center">
              <input
                readOnly
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/display/board?token=${tokenJustIssued.token}`}
                className="flex-1 bg-zinc-950 border border-amber-700/40 rounded-lg p-2 text-amber-200 font-mono text-xs"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/display/board?token=${tokenJustIssued.token}`);
                  showToast(true, '已複製到剪貼簿');
                }}
                className="bg-amber-500 hover:bg-amber-400 text-zinc-950 p-2 rounded-lg"
                title="複製"
              >
                <ClipboardCopy className="w-4 h-4" />
              </button>
              <a
                href={`/display/board?token=${tokenJustIssued.token}`}
                target="_blank"
                rel="noreferrer"
                className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 p-2 rounded-lg"
                title="開啟看板"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {tokens.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-6">尚未發行任何 token</p>
          ) : (
            tokens.map((t) => {
              const expired = new Date(t.expires_at).getTime() < Date.now();
              const revoked = !!t.revoked_at;
              return (
                <div key={t.jti} className="flex justify-between items-center bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-zinc-200">{t.label}</div>
                    <div className="text-xs text-zinc-500 font-mono truncate">jti: {t.jti}</div>
                    <div className="text-xs text-zinc-500">
                      建立：{new Date(t.created_at).toLocaleString()} ／ 到期：{new Date(t.expires_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {revoked ? (
                      <span className="text-xs text-rose-400 px-2 py-1 bg-rose-950/40 border border-rose-900/60 rounded">已撤銷</span>
                    ) : expired ? (
                      <span className="text-xs text-zinc-500 px-2 py-1 bg-zinc-800 rounded">已過期</span>
                    ) : (
                      <span className="text-xs text-emerald-400 px-2 py-1 bg-emerald-950/40 border border-emerald-900/60 rounded">有效</span>
                    )}
                    {!revoked && !expired && (
                      <button
                        onClick={() => handleRevokeToken(t.jti)}
                        className="p-1.5 text-zinc-400 hover:text-rose-400"
                        title="撤銷"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {toast && (
        <div className={`fixed bottom-6 right-6 ${toast.ok ? 'bg-zinc-900 border-amber-500/40 text-amber-300' : 'bg-rose-950 border-rose-700 text-rose-300'} border px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-40`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span className="text-sm">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
