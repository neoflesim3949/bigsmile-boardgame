import { requireRole } from '@/lib/auth';
import { listMyStations, listMyQuickActions, listActiveItems } from '@/app/actions/captain';
import CaptainActionsClient from './CaptainActionsClient';

export default async function CaptainActionsPage() {
  await requireRole('captain');
  const [stations, qa, items] = await Promise.all([
    listMyStations(),
    listMyQuickActions(),
    listActiveItems(),
  ]);
  return (
    <CaptainActionsClient
      stations={stations.ok ? stations.data! : []}
      initialQuickActions={qa.ok ? qa.data! : []}
      items={items.ok ? items.data! : []}
    />
  );
}
