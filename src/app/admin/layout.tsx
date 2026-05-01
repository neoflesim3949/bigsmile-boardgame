"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, BarChart3, Settings, ShieldAlert, MonitorPlay, Activity, Package, Coins, MapPin } from 'lucide-react';

function NavItem({ href, icon, label, currentPath }: { href: string; icon: React.ReactNode; label: string; currentPath: string }) {
  const active = currentPath === href;
  return (
    <Link href={href} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
      active 
        ? 'bg-amber-500/10 text-amber-500 font-semibold border border-amber-500/20' 
        : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
    }`}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-zinc-800 bg-zinc-950/50 backdrop-blur-xl flex flex-col hidden lg:flex">
        <div className="p-6 border-b border-zinc-800">
          <h1 className="text-xl font-bold text-glow text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-amber-500" />
            系統管理後台
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <NavItem currentPath={pathname} href="/admin" icon={<BarChart3 />} label="總覽與儀表板" />
          <NavItem currentPath={pathname} href="/admin/settings" icon={<Settings />} label="系統參數設定" />
          <NavItem currentPath={pathname} href="/admin/finance" icon={<Coins />} label="財務系統設定" />
          <NavItem currentPath={pathname} href="/admin/accounts" icon={<Users />} label="帳號與權限管理" />
          <NavItem currentPath={pathname} href="/admin/stations" icon={<MapPin />} label="關卡與關主指派" />
          <NavItem currentPath={pathname} href="/admin/stocks" icon={<Activity />} label="股市商品管理" />
          <NavItem currentPath={pathname} href="/admin/items" icon={<Package />} label="遊戲道具管理" />
          <NavItem currentPath={pathname} href="/admin/events" icon={<MonitorPlay />} label="看板事件管理" />
        </nav>
        <div className="p-4 border-t border-zinc-800">
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">👑</div>
            <div>
              <p className="text-sm font-semibold text-zinc-200">大會管理員</p>
              <Link href="/login" className="text-xs text-rose-400 hover:text-rose-300">
                登出 / 切換角色
              </Link>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto w-full">
        {children}
      </main>
    </div>
  );
}
