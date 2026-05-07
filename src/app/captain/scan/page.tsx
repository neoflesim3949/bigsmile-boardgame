import { requireRole } from '@/lib/auth';
import { getSetting } from '@/lib/settings';
import { listMyStations, listMyQuickActions, listMyStationSellMultipliers } from '@/app/actions/captain';
import ScanClient from './ScanClient';

export default async function CaptainScanPage() {
  const session = await requireRole('captain');
  const [stations, qa, mults, divisorStr] = await Promise.all([
    listMyStations(),
    listMyQuickActions(),
    listMyStationSellMultipliers(),
    getSetting('StockSellBlessingPenaltyDivisor'),
  ]);
  const divisor = Math.max(1, Number(divisorStr) || 10000);
  return (
    <ScanClient
      captainUserId={session.userId}
      stations={stations.ok ? stations.data! : []}
      allQuickActions={qa.ok ? qa.data! : []}
      allMultipliers={mults.ok ? mults.data! : []}
      blessingDivisor={divisor}
    />
  );
}
