import { requireRole } from '@/lib/auth';
import { getMyStats } from '@/app/actions/player';
import TransferClient from './TransferClient';

export default async function TransferPage() {
  await requireRole('player');
  const r = await getMyStats(false);
  if (!r.ok) {
    return (
      <div className="min-h-screen p-8 text-rose-400 text-center">
        無法載入：{r.error?.message ?? ''}
      </div>
    );
  }
  return (
    <TransferClient
      myMoney={r.data!.stats.money}
      isDead={r.data!.stats.is_dead}
      gameEnabled={r.data!.stats.game_enabled}
      finalScoringAt={r.data!.stats.final_scoring_at}
    />
  );
}
