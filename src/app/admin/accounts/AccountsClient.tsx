'use client';

import { useState, useTransition } from 'react';
import { Users, Search, Plus, KeyRound, Edit2, Trash2, X, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  createAccount,
  updateAccount,
  deleteAccount,
  listAccounts,
  resetSinglePlayer,
  type AccountRow,
} from '@/app/actions/admin';
import { RotateCcw } from 'lucide-react';
import type { Role } from '@/lib/auth';

interface Props {
  initialRows: AccountRow[];
  initialTotal: number;
}

const ROLE_LABEL: Record<Role, string> = { admin: '管理員', player: '玩家', captain: '關主' };
const ROLE_COLOR: Record<Role, string> = {
  admin: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  captain: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  player: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

export default function AccountsClient({ initialRows, initialTotal }: Props) {
  const [rows, setRows] = useState<AccountRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [editing, setEditing] = useState<AccountRow | 'new' | null>(null);
  const [pwReset, setPwReset] = useState<AccountRow | null>(null);
  const [pendingSearch, startSearch] = useTransition();
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  }

  function refresh() {
    startSearch(async () => {
      const r = await listAccounts({
        search: search || undefined,
        role: roleFilter || undefined,
        limit: 200,
      });
      if (r.ok) {
        setRows(r.data!.rows);
        setTotal(r.data!.total);
      }
    });
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Users className="w-6 h-6 text-amber-500" /> 帳號與權限管理
          </h2>
          <p className="text-sm text-zinc-500 mt-1">管理玩家、關主及管理員名單</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-4 py-2 rounded-lg font-bold transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center gap-2 min-h-[44px]"
        >
          <Plus className="w-4 h-4" /> 新增帳號
        </button>
      </header>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 gap-4 flex-wrap">
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="搜尋姓名 / login / userId"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && refresh()}
                className="bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none w-64"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as Role | '')}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="">全部角色</option>
              <option value="admin">管理員</option>
              <option value="captain">關主</option>
              <option value="player">玩家</option>
            </select>
            <button
              onClick={refresh}
              disabled={pendingSearch}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-2 rounded-lg text-sm border border-zinc-700"
            >
              {pendingSearch ? '查詢中…' : '查詢'}
            </button>
          </div>
          <div className="text-sm text-zinc-500">共 {total} 個帳號</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-zinc-500 text-sm border-b border-zinc-800 bg-zinc-900/30">
                <th className="p-4 font-medium">User ID</th>
                <th className="p-4 font-medium">姓名</th>
                <th className="p-4 font-medium">Login</th>
                <th className="p-4 font-medium">角色</th>
                <th className="p-4 font-medium">狀態</th>
                <th className="p-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300 text-sm">
              {rows.map((row) => (
                <tr key={row.user_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors group">
                  <td className="p-4 font-mono text-zinc-400">{row.user_id}</td>
                  <td className="p-4 font-semibold text-zinc-200">{row.name}</td>
                  <td className="p-4 text-zinc-500">{row.login_id ?? '—'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs border ${ROLE_COLOR[row.role]}`}>
                      {ROLE_LABEL[row.role]}
                    </span>
                  </td>
                  <td className="p-4">
                    {row.is_active ? (
                      <span className="flex items-center gap-1.5 text-emerald-400 text-xs"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> 已啟用</span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-zinc-500 text-xs"><div className="w-2 h-2 rounded-full bg-zinc-600"></div> 已停用</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setPwReset(row)}
                        className="p-1.5 text-zinc-400 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors"
                        title="重設密碼"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      {row.role === 'player' && (
                        <button
                          onClick={async () => {
                            if (!confirm(`重置玩家「${row.name}」的遊戲狀態？\n清空：四項參數、命格、持股、借貸、道具\n保留：帳號\n此操作不可復原。`)) return;
                            const r = await resetSinglePlayer(row.user_id);
                            if (r.ok) showToast(true, `已重置 ${row.name}`);
                            else showToast(false, r.error?.message ?? '重置失敗');
                          }}
                          className="p-1.5 text-zinc-400 hover:text-purple-400 hover:bg-purple-400/10 rounded transition-colors"
                          title="重置遊戲狀態（清空數值/持股/借貸/道具）"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setEditing(row)}
                        className="p-1.5 text-zinc-400 hover:text-amber-400 hover:bg-amber-400/10 rounded transition-colors"
                        title="編輯"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`確定刪除帳號「${row.name}」？此操作不可復原。`)) return;
                          const r = await deleteAccount(row.user_id);
                          if (r.ok) {
                            setRows((arr) => arr.filter((x) => x.user_id !== row.user_id));
                            setTotal((n) => n - 1);
                            showToast(true, '已刪除');
                          } else showToast(false, r.error?.message ?? '刪除失敗');
                        }}
                        className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-400/10 rounded transition-colors"
                        title="刪除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-zinc-500 text-sm">沒有符合條件的帳號</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <AccountModal
          target={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            setRows((arr) => {
              if (isNew) return [saved, ...arr];
              return arr.map((x) => (x.user_id === saved.user_id ? saved : x));
            });
            if (isNew) setTotal((n) => n + 1);
            setEditing(null);
            showToast(true, isNew ? '已建立' : '已更新');
          }}
        />
      )}

      {pwReset && (
        <PasswordResetModal
          target={pwReset}
          onClose={() => setPwReset(null)}
          onDone={() => {
            setPwReset(null);
            showToast(true, '密碼已更新');
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

function AccountModal({
  target, onClose, onSaved,
}: {
  target: AccountRow | null;
  onClose: () => void;
  onSaved: (saved: AccountRow, isNew: boolean) => void;
}) {
  const isNew = target === null;
  const [user_id, setUserId] = useState(target?.user_id ?? '');
  const [name, setName] = useState(target?.name ?? '');
  const [login_id, setLoginId] = useState(target?.login_id ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(target?.role ?? 'player');
  const [is_active, setActive] = useState(target?.is_active ?? true);
  const [busy, busyTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleSave() {
    setErr(null);
    busyTransition(async () => {
      if (isNew) {
        if (!password) {
          setErr('新增時必須設定密碼');
          return;
        }
        const r = await createAccount({ user_id, name, login_id, password, role });
        if (r.ok) onSaved(r.data!, true);
        else setErr(r.error?.message ?? '建立失敗');
      } else {
        const r = await updateAccount({
          user_id,
          name,
          login_id,
          password: password || undefined,
          role,
          is_active,
        });
        if (r.ok) onSaved(r.data!, false);
        else setErr(r.error?.message ?? '更新失敗');
      }
    });
  }

  return (
    <Modal onClose={onClose} title={isNew ? '新增帳號' : `編輯帳號：${target?.user_id}`}>
      <div className="space-y-3">
        <Field label="User ID（不可改）" disabled={!isNew}>
          <input
            value={user_id}
            onChange={(e) => setUserId(e.target.value)}
            disabled={!isNew}
            placeholder="例：player001"
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 disabled:text-zinc-500"
          />
        </Field>
        <Field label="姓名">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" />
        </Field>
        <Field label="Login ID">
          <input value={login_id} onChange={(e) => setLoginId(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" />
        </Field>
        <Field label={isNew ? '密碼' : '密碼（留空＝不變）'}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isNew ? '至少 8 字元' : '不改可留空'}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="角色">
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200">
              <option value="player">玩家</option>
              <option value="captain">關主</option>
              <option value="admin">管理員</option>
            </select>
          </Field>
          {!isNew && (
            <Field label="狀態">
              <label className="flex items-center gap-2 text-zinc-300 mt-2">
                <input type="checkbox" checked={is_active} onChange={(e) => setActive(e.target.checked)} />
                啟用
              </label>
            </Field>
          )}
        </div>
      </div>

      {err && <p className="mt-3 text-rose-400 text-sm">{err}</p>}

      <div className="flex gap-3 mt-5">
        <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm font-bold border border-zinc-700 min-h-[44px]">
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={busy || !user_id || !name || !login_id}
          className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 py-2 rounded-lg text-sm font-bold min-h-[44px]"
        >
          {busy ? '儲存中…' : '儲存'}
        </button>
      </div>
    </Modal>
  );
}

function PasswordResetModal({
  target, onClose, onDone,
}: {
  target: AccountRow; onClose: () => void; onDone: () => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, busyTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleSave() {
    setErr(null);
    if (password.length < 8) {
      setErr('密碼至少 8 字元');
      return;
    }
    busyTransition(async () => {
      const r = await updateAccount({ user_id: target.user_id, password });
      if (r.ok) onDone();
      else setErr(r.error?.message ?? '更新失敗');
    });
  }

  return (
    <Modal onClose={onClose} title={`重設密碼：${target.name}（${target.user_id}）`}>
      <Field label="新密碼">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="至少 8 字元"
          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
        />
      </Field>
      {err && <p className="mt-3 text-rose-400 text-sm">{err}</p>}
      <div className="flex gap-3 mt-5">
        <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm font-bold border border-zinc-700 min-h-[44px]">
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={busy}
          className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:opacity-60 text-zinc-950 py-2 rounded-lg text-sm font-bold min-h-[44px]"
        >
          {busy ? '更新中…' : '更新密碼'}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-lg font-bold text-zinc-200 mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, disabled }: { label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <div>
      <label className={`text-xs ${disabled ? 'text-zinc-600' : 'text-zinc-500'}`}>{label}</label>
      {children}
    </div>
  );
}
