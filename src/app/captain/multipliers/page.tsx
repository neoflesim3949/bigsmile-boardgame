import { requireRole } from '@/lib/auth';
import { listMyStations, listMyStationSellMultipliers, listActiveItems } from '@/app/actions/captain';
import MultipliersClient from './MultipliersClient';

export default async function CaptainMultipliersPage() {
  await requireRole('captain');
  const [stationsR, multsR, itemsR] = await Promise.all([
    listMyStations(),
    listMyStationSellMultipliers(),
    listActiveItems(),
  ]);
  // 只列出開了「股票加乘賣出」旗標的站
  const stations = (stationsR.ok ? stationsR.data! : []).filter((s) => s.allow_stock_sell_multiplier);
  const mults = multsR.ok ? multsR.data! : [];
  const items = itemsR.ok ? itemsR.data! : [];
  return <MultipliersClient stations={stations} initialMultipliers={mults} items={items} />;
}
