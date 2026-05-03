import { requireRole } from '@/lib/auth';
import { listMyStations, listMyQuickActions } from '@/app/actions/captain';
import ScanClient from './ScanClient';

export default async function CaptainScanPage() {
  const session = await requireRole('captain');
  const [stations, qa] = await Promise.all([listMyStations(), listMyQuickActions()]);
  return (
    <ScanClient
      captainUserId={session.userId}
      stations={stations.ok ? stations.data! : []}
      allQuickActions={qa.ok ? qa.data! : []}
    />
  );
}
