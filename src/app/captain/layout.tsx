import type { Metadata } from 'next';
import { ConfirmProvider } from '@/components/shared/ConfirmProvider';

export const metadata: Metadata = {
  title: '開運大富翁-關主',
};

export default function CaptainLayout({ children }: { children: React.ReactNode }) {
  return <ConfirmProvider>{children}</ConfirmProvider>;
}
