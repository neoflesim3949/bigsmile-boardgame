import { requireRole } from '@/lib/auth';
import { listPlayersOverview } from '@/app/actions/admin';
import PlayersClient from './PlayersClient';

export default async function PlayersAdminPage() {
  await requireRole('admin');
  const r = await listPlayersOverview();
  return <PlayersClient initialRows={r.ok ? r.data! : []} />;
}
