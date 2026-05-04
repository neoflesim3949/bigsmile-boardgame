import { requireRole } from '@/lib/auth';
import { listMyStations, listMyQuickActions, listMyStationSellMultipliers } from '@/app/actions/captain';
import ScanClient from './ScanClient';

export default async function CaptainScanPage() {
  const session = await requireRole('captain');
  const [stations, qa, mults] = await Promise.all([
    listMyStations(),
    listMyQuickActions(),
    listMyStationSellMultipliers(),
  ]);
  return (
    <ScanClient
      captainUserId={session.userId}
      stations={stations.ok ? stations.data! : []}
      allQuickActions={qa.ok ? qa.data! : []}
      allMultipliers={mults.ok ? mults.data! : []}
    />
  );
}
