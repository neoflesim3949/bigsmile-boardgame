import { requireRole } from '@/lib/auth';
import { listEvents, getBoardConfig, listStocks, listDisplayTokens } from '@/app/actions/admin';
import EventsClient from './EventsClient';

export default async function EventsPage() {
  await requireRole('admin');
  const [evts, board, stocks, tokens] = await Promise.all([
    listEvents(),
    getBoardConfig(),
    listStocks(),
    listDisplayTokens(),
  ]);
  return (
    <EventsClient
      initialEvents={evts.ok ? evts.data! : []}
      initialBoard={board.ok ? board.data! : null}
      stocks={stocks.ok ? stocks.data! : []}
      initialTokens={tokens.ok ? tokens.data! : []}
    />
  );
}
