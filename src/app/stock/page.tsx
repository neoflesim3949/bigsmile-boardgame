import Link from 'next/link';
import { TrendingUp, ArrowUpRight, ArrowDownRight, RefreshCcw, Search, TrendingDown, PackageOpen } from 'lucide-react';

interface Stock {
  code: string;
  name: string;
  price: number;
  change: string;
  type: 'up' | 'down';
  held: number;       // shares held by this player
  avgCost: number;    // average cost per share (for profit calc)
}

const STOCKS: Stock[] = [
  { code: 'TSMC', name: '台積電',    price: 820,  change: '+15', type: 'up',   held: 500, avgCost: 760  },
  { code: 'GOLD', name: '國際黃金',  price: 2150, change: '-10', type: 'down', held: 0,   avgCost: 0    },
  { code: 'BTC',  name: '比特幣科技', price: 450,  change: '+22', type: 'up',   held: 0,   avgCost: 0    },
  { code: 'EST',  name: '東區不動產', price: 120,  change: '-2',  type: 'down', held: 0,   avgCost: 0    },
];

const AVAILABLE_CASH = 12500;

// Compute inventory value
const totalInventoryValue = STOCKS.reduce((sum, s) => sum + s.price * s.held, 0);

// Profit = (currentPrice - avgCost) * held
const profitByCode = (s: Stock) => (s.price - s.avgCost) * s.held;

export default function StockPage() {
  return (
    <div className="min-h-screen page-bg p-4 pb-24">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="flex justify-between items-start mb-6 pl-2 pr-2 mt-2">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">股市大廳</h1>

          <p className="text-zinc-500 text-sm mt-0.5">
            可用資金:{' '}
            <span className="text-amber-400 font-semibold">{AVAILABLE_CASH.toLocaleString()}</span>
          </p>

          {/* Inventory value row */}
          <div className="mt-1 flex items-center gap-1.5">
            <PackageOpen className="w-3.5 h-3.5 text-teal-400" />
            <p className="text-zinc-500 text-sm">
              庫存市值:{' '}
              <span className="text-teal-400 font-semibold">{totalInventoryValue.toLocaleString()}</span>
            </p>
          </div>
        </div>

        <button className="w-10 h-10 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-amber-500 hover:border-amber-500/50 transition-colors mt-1">
          <RefreshCcw className="w-4 h-4" />
        </button>
      </header>

      {/* ── Search Bar ──────────────────────────────────── */}
      <div className="mb-6 relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-zinc-500" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-3 border border-zinc-700 rounded-xl leading-5 bg-zinc-900/50 text-zinc-300 placeholder-zinc-500 focus:outline-none focus:bg-zinc-800/80 focus:border-amber-500/50 sm:text-sm transition-colors"
          placeholder="輸入特殊代碼搜尋隱藏商品..."
        />
      </div>

      {/* ── Stock List ──────────────────────────────────── */}
      <h2 className="text-lg font-semibold text-zinc-300 mb-3 pl-2">可交易商品</h2>
      <div className="space-y-3">
        {STOCKS.map((stock) => {
          const isHeld = stock.held > 0;
          const profit = profitByCode(stock);
          const profitPositive = profit >= 0;

          return (
            <div
              key={stock.code}
              className={`p-4 rounded-xl flex flex-col gap-3 border transition-colors ${
                isHeld
                  ? 'bg-teal-950/30 border-teal-700/40 shadow-[inset_0_0_20px_rgba(20,184,166,0.05)]'
                  : 'glass-panel border-zinc-800/50'
              }`}
            >
              {/* Stock Info Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs ${
                      isHeld
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                        : 'bg-zinc-800/80 text-zinc-400'
                    }`}
                  >
                    {stock.code}
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-100">{stock.name}</h3>
                    {isHeld ? (
                      <p className="text-xs text-teal-400 font-medium">持股: {stock.held.toLocaleString()} 股</p>
                    ) : (
                      <p className="text-xs text-zinc-500">持股: 0</p>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-bold text-zinc-100 text-lg">{stock.price.toLocaleString()}</p>
                  <p
                    className={`text-xs font-medium flex items-center justify-end ${
                      stock.type === 'up' ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {stock.type === 'up' ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    {stock.change}
                  </p>
                </div>
              </div>

              {/* Profit Row — only when holding */}
              {isHeld && (
                <div
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                    profitPositive
                      ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400'
                      : 'bg-rose-500/10 border border-rose-500/25 text-rose-400'
                  }`}
                >
                  {profitPositive ? (
                    <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>
                    預期賣出利潤：
                    <span className="font-bold">
                      {profitPositive ? '+' : ''}
                      {profit.toLocaleString()}
                    </span>
                  </span>
                  <span className="ml-auto text-zinc-500">
                    均攤成本 {stock.avgCost.toLocaleString()}/股
                  </span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 mt-1">
                <button className="flex-1 py-2 rounded-lg bg-zinc-800/80 text-zinc-300 text-sm font-medium hover:bg-emerald-500/20 hover:text-emerald-400 border border-transparent hover:border-emerald-500/30 transition-colors">
                  買入
                </button>
                <button
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                    isHeld
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/50 hover:bg-rose-500/30 hover:border-rose-500/70 shadow-[0_0_10px_rgba(239,68,68,0.15)]'
                      : 'bg-zinc-800/80 text-zinc-600 border-transparent cursor-not-allowed opacity-40'
                  }`}
                  disabled={!isHeld}
                >
                  賣出
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Bottom Nav ──────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 h-16 glass-panel border-t-zinc-800 flex items-center justify-around z-50">
        <Link
          href="/"
          className="flex flex-col items-center gap-1 text-zinc-500 hover:text-amber-500 transition-colors"
        >
          <UserIcon />
          <span className="text-[0.625rem]">我的狀態</span>
        </Link>
        <Link href="/stock" className="flex flex-col items-center gap-1 text-amber-500">
          <TrendingUp className="w-5 h-5" />
          <span className="text-[0.625rem]">股市大廳</span>
        </Link>
      </div>
    </div>
  );
}

function UserIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  );
}
