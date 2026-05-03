import Link from 'next/link';
import { QrCode, Settings2, Plus, MapPin, AlertCircle, Settings } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { listMyStations, listMyQuickActions } from '@/app/actions/captain';

export default async function CaptainPage() {
  const session = await requireRole('captain');
  const [stations, qaR] = await Promise.all([listMyStations(), listMyQuickActions()]);
  const myStations = stations.ok ? stations.data! : [];
  const myQuickActions = qaR.ok ? qaR.data! : [];

  return (
    <div className="min-h-screen bg-zinc-950 p-4 pb-12">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">{session.name}</h1>
          <p className="text-zinc-500 text-xs">關主 · {session.userId}</p>
        </div>
        <Link
          href="/settings"
          aria-label="設定"
          className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-amber-400 hover:border-amber-500/50 transition-colors"
        >
          <Settings className="w-5 h-5" />
        </Link>
      </header>

      {myStations.length === 0 && (
        <div className="bg-amber-950/30 border border-amber-900/60 text-amber-300 rounded-xl p-4 mb-4 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-bold mb-1">尚未被指派關卡</p>
            <p className="text-xs">請聯絡大會管理員把你加入某關卡的 captain_user_ids</p>
          </div>
        </div>
      )}

      <Link
        href="/captain/scan"
        className={`block w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-3xl py-12 mb-6 flex flex-col items-center justify-center gap-3 shadow-[0_0_30px_rgba(245,158,11,0.3)] ${myStations.length === 0 ? 'opacity-40 pointer-events-none' : ''}`}
      >
        <QrCode className="w-20 h-20" />
        <span className="text-2xl font-bold">開始掃碼</span>
      </Link>

      {/* 我被指派的關卡 */}
      <section className="mb-6">
        <h2 className="text-sm font-bold text-zinc-400 mb-2 flex items-center gap-2">
          <MapPin className="w-4 h-4" /> 我的關卡
        </h2>
        <div className="space-y-2">
          {myStations.map((s) => (
            <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zinc-100">{s.name}</p>
                  {s.description && <p className="text-xs text-zinc-500 line-clamp-1">{s.description}</p>}
                </div>
                {s.allow_rebirth && <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded">重生鍵</span>}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                已使用 {s.global_use_count}{s.global_max_uses !== null ? ` / ${s.global_max_uses}` : ''}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 我的快捷模組 */}
      <section className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm font-bold text-zinc-400 flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> 我的快捷模組（{myQuickActions.length}）
          </h2>
          <Link
            href="/captain/actions"
            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1 rounded-lg border border-zinc-700 flex items-center gap-1 min-h-[36px]"
          >
            <Plus className="w-3 h-3" /> 編輯
          </Link>
        </div>
        <div className="space-y-2">
          {myQuickActions.slice(0, 8).map((qa) => (
            <div key={qa.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex justify-between items-center">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-zinc-100 truncate">{qa.label}</p>
                <p className="text-xs text-zinc-500">{qa.station_name}</p>
              </div>
              <DeltaBadges qa={qa} />
            </div>
          ))}
          {myQuickActions.length === 0 && (
            <p className="text-zinc-500 text-sm text-center py-6">尚未建立快捷模組</p>
          )}
        </div>
      </section>
    </div>
  );
}

interface QaSummary {
  delta_money: number;
  delta_health: number;
  delta_blessing: number;
  delta_karma: number;
  bound_item_id: string | null;
}

function DeltaBadges({ qa }: { qa: QaSummary }) {
  const badges = [
    qa.delta_money !== 0 && { text: fmt('$', qa.delta_money), cls: 'text-amber-400' },
    qa.delta_health !== 0 && { text: fmt('❤️', qa.delta_health), cls: 'text-rose-400' },
    qa.delta_blessing !== 0 && { text: fmt('✨', qa.delta_blessing), cls: 'text-teal-400' },
    qa.delta_karma !== 0 && { text: fmt('⚖', qa.delta_karma), cls: 'text-purple-400' },
    qa.bound_item_id && { text: '🎁', cls: 'text-zinc-300' },
  ].filter(Boolean) as Array<{ text: string; cls: string }>;
  return (
    <div className="flex gap-1.5 flex-wrap text-xs flex-shrink-0">
      {badges.map((b, i) => <span key={i} className={`${b.cls} font-mono`}>{b.text}</span>)}
    </div>
  );
}

function fmt(prefix: string, n: number): string {
  return `${prefix}${n > 0 ? '+' : ''}${n}`;
}
