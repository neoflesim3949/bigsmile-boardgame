import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ThemeProvider from '@/components/ThemeProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '開運大富翁',
  description: '開運大富翁 - 獨立部署的活動小遊戲',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" data-theme="dark">
      <body className={`${inter.className} font-sans antialiased min-h-screen selection:bg-amber-500/30 selection:text-amber-200`}>
        <ThemeProvider />
        {children}
      </body>
    </html>
  );
}

