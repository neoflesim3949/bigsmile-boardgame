import { getBoardData } from '@/app/actions/board';
import BoardClient from './BoardClient';

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function DisplayBoardPage({ searchParams }: Props) {
  const { token } = await searchParams;
  const t = token ?? '';
  const r = await getBoardData(t);
  if (!r.ok) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-rose-400 p-8 text-center">
        <div>
          <p className="text-3xl font-bold mb-2">看板無法顯示</p>
          <p className="text-zinc-400">{r.error?.message ?? ''}</p>
          <p className="text-zinc-600 text-sm mt-4">請聯絡管理員確認 display token 是否有效。</p>
        </div>
      </div>
    );
  }
  return <BoardClient initial={r.data!} token={t} />;
}
