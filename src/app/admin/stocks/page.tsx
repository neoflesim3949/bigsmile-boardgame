import { requireRole } from '@/lib/auth';
import { listStocks, listStockScripts } from '@/app/actions/admin';
import StocksClient from './StocksClient';

export default async function StocksAdminPage() {
  await requireRole('admin');
  const [stocks, scripts] = await Promise.all([listStocks(), listStockScripts()]);
  return (
    <StocksClient
      initialStocks={stocks.ok ? stocks.data! : []}
      initialScripts={scripts.ok ? scripts.data! : { rounds: [], events: {}, cells: {} }}
    />
  );
}
