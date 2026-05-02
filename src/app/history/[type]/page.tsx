import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { getMyHistory, type HistoryType } from '@/app/actions/player';
import HistoryClient from './HistoryClient';

const VALID: HistoryType[] = ['money', 'health', 'blessing', 'karma'];

interface Props { params: Promise<{ type: string }> }

export default async function HistoryPage({ params }: Props) {
  await requireRole('player');
  const { type } = await params;
  if (!VALID.includes(type as HistoryType)) redirect('/');

  const r = await getMyHistory(type as HistoryType);
  if (!r.ok) {
    return (
      <div className="min-h-screen p-8 text-center text-zinc-400">
        <p className="text-rose-400 text-2xl mb-2">無法檢視</p>
        <p className="text-sm">{r.error?.message ?? ''}</p>
        <p className="text-xs mt-4">部分指標的歷史明細只在後台開啟「顯示隱藏參數」或活動結束後才公開。</p>
      </div>
    );
  }

  return <HistoryClient type={type as HistoryType} initial={r.data!} />;
}
