import { requireRole } from '@/lib/auth';
import { getBoardConfig, listStocks, listDisplayTokens } from '@/app/actions/admin';
import BoardAdminClient from './BoardAdminClient';

export default async function BoardAdminPage() {
  await requireRole('admin');
  const [board, stocks, tokens] = await Promise.all([
    getBoardConfig(),
    listStocks(),
    listDisplayTokens(),
  ]);
  return (
    <BoardAdminClient
      initialBoard={board.ok ? board.data! : null}
      stocks={stocks.ok ? stocks.data! : []}
      initialTokens={tokens.ok ? tokens.data! : []}
    />
  );
}
