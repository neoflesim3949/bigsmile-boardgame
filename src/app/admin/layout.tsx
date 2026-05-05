import type { Metadata } from 'next';
import AdminShell from './AdminShell';
import { ConfirmProvider } from '@/components/shared/ConfirmProvider';

export const metadata: Metadata = {
  title: '開運大富翁-管理端',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConfirmProvider>
      <AdminShell>{children}</AdminShell>
    </ConfirmProvider>
  );
}
