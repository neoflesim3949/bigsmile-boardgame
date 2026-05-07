'use client';

import { useState } from 'react';
import { addCompareComment, type CompareCommentRow } from '@/app/actions/compare';
import { useWriteGuard } from '@/components/shared/WriteGuard';

interface Props {
  itemKey: string;
  initial: CompareCommentRow[];
}

export default function CommentBox({ itemKey, initial }: Props) {
  const [comments, setComments] = useState<CompareCommentRow[]>(initial);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const { busy: pending, run } = useWriteGuard();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const trimmedName = name.trim();
    const trimmedContent = content.trim();
    if (!trimmedName || !trimmedContent) {
      setErr('請填寫留言者與內容');
      return;
    }
    const r = await run(() => addCompareComment({
      itemKey,
      authorName: trimmedName,
      content: trimmedContent,
    }));
    if (r?.ok && r.data) {
      setComments((prev) => [...prev, r.data!]);
      setName('');
      setContent('');
    }
  }

  return (
    <div className="border-t border-zinc-800/60 bg-zinc-950/50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left px-3 py-2 text-xs text-zinc-400 hover:text-sky-300 hover:bg-zinc-900/40 transition flex items-center gap-2"
      >
        <span>💬 {comments.length} 則回覆</span>
        <span className="text-zinc-600">{open ? '▼ 收合' : '▶ 展開 / 我要留言'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {comments.length === 0 ? (
            <p className="text-xs text-zinc-500 py-1">尚無回覆，搶頭香！</p>
          ) : (
            <div className="space-y-1.5">
              {comments.map((c) => (
                <div
                  key={c.id}
                  className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm"
                >
                  <div className="flex items-baseline gap-2 text-xs text-zinc-500 mb-1">
                    <span className="text-sky-300 font-semibold">{c.author_name}</span>
                    <span>·</span>
                    <span>
                      {new Date(c.created_at).toLocaleString('zh-TW', {
                        hour12: false,
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-zinc-200 whitespace-pre-wrap break-words">{c.content}</p>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={submit} className="space-y-2 pt-2 border-t border-zinc-800/60">
            <input
              type="text"
              placeholder="留言者（必填，最多 30 字）"
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-sky-500 outline-none"
              disabled={pending}
            />
            <textarea
              placeholder="內容（必填，最多 1000 字）"
              value={content}
              maxLength={1000}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              className="w-full rounded bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-sky-500 outline-none resize-y"
              disabled={pending}
            />
            {err && <p className="text-rose-400 text-xs">{err}</p>}
            <div className="flex justify-between items-center">
              <span className="text-xs text-zinc-500">
                {content.length} / 1000
              </span>
              <button
                type="submit"
                disabled={pending}
                className="rounded bg-sky-600 hover:bg-sky-500 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {pending ? '送出中…' : '送出留言'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
