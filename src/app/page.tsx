import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { getSetting } from '@/lib/settings';
import { query } from '@/lib/db';
import { getMyStats } from '@/app/actions/player';
import PlayerHomeClient from './PlayerHomeClient';

export default async function PlayerPage() {
  const session = await requireRole('player');

  const cardDrawMode = await getSetting('CardDrawMode');
  if (cardDrawMode === 'true') {
    const r = await query<{ destiny_name: string | null }>(
      `SELECT destiny_name FROM "PlayerStats" WHERE user_id = $1`,
      [session.userId],
    );
    if (!r.rows[0]?.destiny_name) redirect('/onboarding');
  }

  const r = await getMyStats(false);
  if (!r.ok) {
    return (
      <div className="min-h-screen page-bg p-8 text-center text-rose-400">
        無法載入玩家資料：{r.error?.message ?? ''}
      </div>
    );
  }

  return <PlayerHomeClient initialStats={r.data!.stats} initialItems={r.data!.items} />;
}
