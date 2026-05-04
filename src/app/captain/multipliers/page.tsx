import { requireRole } from '@/lib/auth';
import { listMyStations, listMyStationSellMultipliers } from '@/app/actions/captain';
import MultipliersClient from './MultipliersClient';

export default async function CaptainMultipliersPage() {
  await requireRole('captain');
  const [stationsR, multsR] = await Promise.all([
    listMyStations(),
    listMyStationSellMultipliers(),
  ]);
  // 只列出開了「股票加乘賣出」旗標的站
  const stations = (stationsR.ok ? stationsR.data! : []).filter((s) => s.allow_stock_sell_multiplier);
  const mults = multsR.ok ? multsR.data! : [];
  return <MultipliersClient stations={stations} initialMultipliers={mults} />;
}
