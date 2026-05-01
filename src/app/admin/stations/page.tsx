import { requireRole } from '@/lib/auth';
import { listStations, listCaptains } from '@/app/actions/admin';
import StationsClient from './StationsClient';

export default async function StationsPage() {
  await requireRole('admin');
  const [s, c] = await Promise.all([listStations(), listCaptains()]);
  return (
    <StationsClient
      initialStations={s.ok ? s.data! : []}
      captains={c.ok ? c.data! : []}
    />
  );
}
