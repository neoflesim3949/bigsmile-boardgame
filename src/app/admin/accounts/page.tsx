import { requireRole } from '@/lib/auth';
import { listAccounts } from '@/app/actions/admin';
import AccountsClient from './AccountsClient';

export default async function AccountsPage() {
  await requireRole('admin');
  const initial = await listAccounts({ limit: 200 });
  return (
    <AccountsClient
      initialRows={initial.ok ? initial.data!.rows : []}
      initialTotal={initial.ok ? initial.data!.total : 0}
    />
  );
}
