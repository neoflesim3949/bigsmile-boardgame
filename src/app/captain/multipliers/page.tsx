import { requireRole } from '@/lib/auth';
import { getSetting } from '@/lib/settings';
import { listMyStations, listMyStationSellMultipliers, listActiveItems } from '@/app/actions/captain';
import MultipliersClient from './MultipliersClient';

export default async function CaptainMultipliersPage() {
  await requireRole('captain');
  const [stationsR, multsR, itemsR, divisorStr] = await Promise.all([
    listMyStations(),
    listMyStationSellMultipliers(),
    listActiveItems(),
    getSetting('StockSellBlessingPenaltyDivisor'),
  ]);
  // 只列出開了「股票加乘賣出」旗標的站
  const stations = (stationsR.ok ? stationsR.data! : []).filter((s) => s.allow_stock_sell_multiplier);
  const mults = multsR.ok ? multsR.data! : [];
  const items = itemsR.ok ? itemsR.data! : [];
  const divisor = Math.max(1, Number(divisorStr) || 10000);
  return <MultipliersClient stations={stations} initialMultipliers={mults} items={items} blessingDivisor={divisor} />;
}
