'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Save, TrendingUp, AlertTriangle, Eye, FileText, Settings, Activity } from 'lucide-react';

export default function StockDetailPage() {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <header className="flex justify-between items-end mb-8">
        <div className="flex gap-4 items-center">
          <Link href="/admin/stocks" className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-amber-400 hover:border-amber-500/50 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold text-zinc-100">TSMC 大富翁神山</h2>
              <span className="bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded text-sm font-mono border border-amber-500/30">TSMC</span>
            </div>
            <p className="text-zinc-500 text-sm mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              上架中・開放交易
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg active:scale-95 ${
            saved ? 'bg-emerald-500 text-zinc-950 shadow-emerald-500/20' : 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-amber-500/20'
          }`}
        >
          <Save className="w-5 h-5" />
          {saved ? '已儲存！' : '儲存設定'}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Top Row: Basic Info (Full Width) */}
        <div className="lg:col-span-2">
          <section className="glass-panel p-6 rounded-2xl border-t-4 border-t-amber-500">
            <h3 className="text-lg font-bold text-zinc-200 mb-5 flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-500" /> 基本資料
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <label className="block">
                <span className="text-sm font-medium text-zinc-400 mb-1.5 block">商品代碼 (唯一)</span>
                <input type="text" defaultValue="TSMC" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-100 font-mono focus:border-amber-500 focus:outline-none" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-400 mb-1.5 block">商品名稱</span>
                <input type="text" defaultValue="大富翁神山" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-100 focus:border-amber-500 focus:outline-none" />
              </label>
            </div>
          </section>
        </div>

        {/* Bottom Row Left: Status */}
        <div className="space-y-6">
          <section className="glass-panel p-6 rounded-2xl border border-zinc-800">
            <h3 className="text-lg font-bold text-zinc-200 mb-5 flex items-center gap-2">
              <Eye className="w-5 h-5 text-emerald-400" /> 顯示與狀態
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-400">大屏與玩家端顯示</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-400">開放買進</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-400">開放賣出</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
              <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                可配合劇情事件設定「只能買不能賣」或「只能賣不能買」的特殊狀態。
              </p>
            </div>
          </section>
        </div>

        {/* Right Column: Overrides */}
        <div className="space-y-6">
          <section className="glass-panel p-6 rounded-2xl bg-gradient-to-br from-rose-900/10 to-zinc-900 border border-rose-900/30">
            <h3 className="text-lg font-bold text-rose-400 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> 強制介入 (手動調價)
            </h3>
            <p className="text-xs text-zinc-500 mb-5">
              立即覆寫當前股價，不受漲跌幅限制。此操作將立即生效並廣播至所有看板與玩家端。
            </p>
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-zinc-400 mb-1.5 block">目前股價</span>
                <div className="text-2xl font-bold text-zinc-100">950.0</div>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-400 mb-1.5 block">強制指定新價格</span>
                <input type="number" placeholder="輸入新價格..." className="w-full bg-zinc-950 border border-rose-500/30 rounded-lg p-3 text-rose-300 font-bold focus:border-rose-500 focus:outline-none" />
              </label>
              <button className="w-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 font-bold py-2.5 rounded-lg transition-colors text-sm">
                立即強制生效
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
