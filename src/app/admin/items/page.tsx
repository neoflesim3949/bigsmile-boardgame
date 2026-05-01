import { requireRole } from '@/lib/auth';
import { listItems } from '@/app/actions/admin';
import ItemsClient from './ItemsClient';

export default async function ItemsPage() {
  await requireRole('admin');
  const r = await listItems();
  return <ItemsClient initialItems={r.ok ? r.data! : []} />;
}
