import { requireRole } from '@/lib/auth';
import { listStocks } from '@/app/actions/admin';
import StocksClient from './StocksClient';

export default async function StocksAdminPage() {
  await requireRole('admin');
  const r = await listStocks();
  return <StocksClient initialStocks={r.ok ? r.data! : []} />;
}
