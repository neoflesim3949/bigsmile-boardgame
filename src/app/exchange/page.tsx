import { requireRole } from '@/lib/auth';
import { getMyStats, listExchangeOptionsForPlayer } from '@/app/actions/player';
import ExchangeClient from './ExchangeClient';

export default async function ExchangePage() {
  await requireRole('player');
  const [stats, options] = await Promise.all([
    getMyStats(false),
    listExchangeOptionsForPlayer(),
  ]);
  if (!stats.ok || !options.ok) {
    return <div className="min-h-screen p-8 text-rose-400 text-center">無法載入</div>;
  }
  return (
    <ExchangeClient
      myMoney={stats.data!.stats.money}
      isDead={stats.data!.stats.is_dead}
      gameEnabled={stats.data!.stats.game_enabled}
      finalScoringAt={stats.data!.stats.final_scoring_at}
      initialOptions={options.data!}
    />
  );
}
