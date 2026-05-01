import { requireRole } from '@/lib/auth';
import { getStockMarket } from '@/app/actions/stock';
import StockClient from './StockClient';

export default async function StockPage() {
  await requireRole('player');
  const r = await getStockMarket(false);
  if (!r.ok) {
    return <div className="min-h-screen p-8 text-rose-400 text-center">無法載入：{r.error?.message ?? ''}</div>;
  }
  return <StockClient initial={r.data!} />;
}
