import { requireRole } from '@/lib/auth';
import { getMyStats, listBankLoanOptionsForPlayer, listMyActiveLoans } from '@/app/actions/player';
import BankClient from './BankClient';

export default async function BankPage() {
  await requireRole('player');
  const [stats, options, loans] = await Promise.all([
    getMyStats(false),
    listBankLoanOptionsForPlayer(),
    listMyActiveLoans(),
  ]);
  if (!stats.ok || !options.ok || !loans.ok) {
    return <div className="min-h-screen p-8 text-rose-400 text-center">無法載入</div>;
  }
  return (
    <BankClient
      myMoney={stats.data!.stats.money}
      bankLoan={stats.data!.stats.bank_loan}
      isDead={stats.data!.stats.is_dead}
      tourMode={stats.data!.stats.tour_mode}
      gameEnabled={stats.data!.stats.game_enabled}
      finalScoringAt={stats.data!.stats.final_scoring_at}
      initialOptions={options.data!}
      initialLoans={loans.data!}
    />
  );
}
