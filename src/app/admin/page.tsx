import { requireRole } from '@/lib/auth';
import { getAdminDashboard } from '@/app/actions/admin';
import AdminDashboardClient from './AdminDashboardClient';

export default async function AdminHomePage() {
  await requireRole('admin');
  const r = await getAdminDashboard();
  if (!r.ok) {
    return (
      <div className="p-8 text-rose-400">
        無法載入後台資料：{r.error?.message ?? ''}
      </div>
    );
  }
  return <AdminDashboardClient initial={r.data!} />;
}
