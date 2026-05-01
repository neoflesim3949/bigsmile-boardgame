import { requireRole } from '@/lib/auth';
import { listEvents, getBoardConfig } from '@/app/actions/admin';
import EventsClient from './EventsClient';

export default async function EventsPage() {
  await requireRole('admin');
  const [evts, board] = await Promise.all([listEvents(), getBoardConfig()]);
  return (
    <EventsClient
      initialEvents={evts.ok ? evts.data! : []}
      initialMarquee={{
        text: board.ok ? board.data!.marquee_text : '',
        until: board.ok ? board.data!.marquee_until : null,
      }}
    />
  );
}
