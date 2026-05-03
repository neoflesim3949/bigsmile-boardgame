'use client';

import Link from 'next/link';
import { useState, useTransition, useEffect } from 'react';
import {
  TrendingUp, ArrowUpRight, ArrowDownRight, RefreshCcw, Search,
  X, AlertCircle, CheckCircle2, ArrowLeft,
} from 'lucide-react';
import { getMyStats } from '@/app/actions/player';
import { buyStock, sellStock, lookupStockByCode, getStockMarket, type StockMarketRow } from '@/app/actions/stock';

interface InitialData {
  stocks: StockMarketRow[];
  myMoney: number;
  totalHoldingValue: number;
  isDead: boolean;
  gameEnabled: boolean;
  finalScoringAt: string | null;
}

export default function StockClient({ initial }: { initial: InitialData }) {
  const [data, setData] = useState<InitialData>(initial);
  const [pending, startTransition] = useTransition();
  const [tradeTarget, setTradeTarget] = useState<{ stock: StockMarketRow; action: 'buy' | 'sell' } | null>(null);
  const [search, setSearch] = useState('');
  const [searchResult, setSearchResult] = useState<StockMarketRow | null>(null);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  }

  function handleRefresh() {
    if (cooldown > 0 || pending) return;
    startTransition(async () => {
      const [stockR, statsR] = await Promise.all([
        getStockMarket(true),
        getMyStats(true), // 與 / 共用節流
      ]);
      if (stockR.ok) setData(stockR.data!);
      if (statsR.ok) {
        setCooldown(statsR.data!.stats.refresh_cooldown_seconds);
      } else if (statsR.error?.code === 'REFRESH_RATE_LIMITED') {
        setCooldown(60);
        showToast(false, statsR.error.message);
      }
    });
  }

  function handleSearch() {
    setSearchErr(null);
    setSearchResult(null);
    if (!search.trim()) return;
    startTransition(async () => {
      const r = await lookupStockByCode(search.trim());
      if (r.ok) setSearchResult(r.data!);
      else setSearchErr(r.error?.message ?? '查無');
    });
  }

  const visibleStocks = data.stocks.filter((s) => s.is_visible || s.shares > 0);
  const writeDisabled = data.isDead || !data.gameEnabled || !!data.finalScoringAt;

  return (
    <div className="min-h-screen page-bg p-4 pb-24">
      <header className="flex items-center gap-3 mb-4">
        <Link href="/" className="w-9 h-9 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-zinc-300">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-amber-500" /> 股市大廳
        </h1>
        <button
          onClick={handleRefresh}
          disabled={cooldown > 0 || pending}
          className="ml-auto w-10 h-10 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-amber-500 disabled:opacity-60"
          title={cooldown > 0 ? `冷卻 ${cooldown}s` : '重新整理'}
        >
          {cooldown > 0
            ? <span className="text-[0.625rem] font-bold">{cooldown}</span>
            : <RefreshCcw className={`w-4 h-4 ${pending ? 'animate-spin' : ''}`} />}
        </button>
      </header>

      {writeDisabled && (
        <div className="bg-rose-950/30 border border-rose-900/60 text-rose-300 rounded-xl p-3 mb-4 text-sm text-center">
          {data.isDead ? '地獄狀態下無法交易' : data.finalScoringAt ? '終局結算已觸發' : '活動尚未開始'}
        </div>
      )}

      {/* 餘額 + 庫存市值 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-xs text-zinc-500">我的金錢</p>
          <p className="text-2xl font-bold text-amber-400">{data.myMoney.toLocaleString()}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-xs text-zinc-500">庫存市值</p>
          <p className="text-2xl font-bold text-emerald-400">{data.totalHoldingValue.toLocaleString()}</p>
        </div>
      </div>

      {/* 代碼搜尋 */}
      <div className="glass-panel rounded-2xl p-3 mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="輸入代碼搜尋（含未公開上架商品）"
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-zinc-200 text-sm"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={pending}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 px-4 rounded-lg text-sm font-bold min-h-[44px]"
          >
            搜尋
          </button>
        </div>
        {searchErr && <p className="text-rose-400 text-xs mt-2">{searchErr}</p>}
        {searchResult && (
          <div className="mt-3 bg-zinc-950 border border-amber-500/30 rounded-lg p-3">
            <StockCard
              stock={searchResult}
              writeDisabled={writeDisabled}
              onBuy={() => setTradeTarget({ stock: searchResult, action: 'buy' })}
              onSell={() => setTradeTarget({ stock: searchResult, action: 'sell' })}
            />
            <button onClick={() => setSearchResult(null)} className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
              <X className="w-3 h-3" /> 關閉搜尋結果
            </button>
          </div>
        )}
      </div>

      {/* 商品列表 */}
      <div className="space-y-3">
        {visibleStocks.map((s) => (
          <StockCard
            key={s.id}
            stock={s}
            writeDisabled={writeDisabled}
            onBuy={() => setTradeTarget({ stock: s, action: 'buy' })}
            onSell={() => setTradeTarget({ stock: s, action: 'sell' })}
          />
        ))}
        {visibleStocks.length === 0 && (
          <div className="glass-panel rounded-2xl p-12 text-center text-zinc-500">尚無股市商品</div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 h-16 glass-panel border-t-zinc-800 flex items-center justify-around z-50">
        <Link href="/" className="flex flex-col items-center gap-1 text-zinc-500 hover:text-amber-500 transition-colors">
          <UserIcon />
          <span className="text-[0.625rem]">我的狀態</span>
        </Link>
        <Link href="/stock" className="flex flex-col items-center gap-1 text-amber-500">
          <TrendingUp className="w-5 h-5" />
          <span className="text-[0.625rem]">股市大廳</span>
        </Link>
      </div>

      {tradeTarget && (
        <TradeModal
          stock={tradeTarget.stock}
          action={tradeTarget.action}
          myMoney={data.myMoney}
          onClose={() => setTradeTarget(null)}
          onDone={async () => {
            const r = await getStockMarket(false);
            if (r.ok) setData(r.data!);
            setTradeTarget(null);
            showToast(true, '交易完成');
          }}
        />
      )}

      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 ${toast.ok ? 'bg-zinc-900 border-amber-500/40 text-amber-300' : 'bg-rose-950 border-rose-700 text-rose-300'} border px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-40 text-sm`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function StockCard({
  stock, writeDisabled, onBuy, onSell,
}: {
  stock: StockMarketRow;
  writeDisabled: boolean;
  onBuy: () => void;
  onSell: () => void;
}) {
  const hasHolding = stock.shares > 0;
  return (
    <div className={`glass-panel rounded-2xl p-4 ${hasHolding ? 'border-emerald-500/40 bg-emerald-500/5' : ''}`}>
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <span className="font-mono text-amber-300 text-sm">{stock.code}</span>
          <h3 className="font-bold text-zinc-100">{stock.name}</h3>
        </div>
        <PriceWithTrend price={stock.current_price} trend={stock.trend} />
      </div>

      {hasHolding && (
        <div className="grid grid-cols-2 gap-2 text-sm mt-2 mb-3 bg-zinc-800/60 border border-zinc-700/60 rounded-lg p-3">
          <div className="flex justify-between items-baseline">
            <span className="text-zinc-400">持股</span>
            <span className="text-emerald-400 font-bold text-base">{stock.shares} 股</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-zinc-400">均價</span>
            <span className="text-zinc-200 font-bold text-base">{stock.avg_cost.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-baseline col-span-2 border-t border-zinc-700/40 pt-2 mt-1">
            <span className="text-zinc-400">預期賣出利潤</span>
            <span className={`font-bold text-lg ${stock.expected_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stock.expected_profit >= 0 ? '+' : ''}{stock.expected_profit.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onBuy}
          disabled={writeDisabled || stock.current_price <= 0}
          title={stock.current_price <= 0 ? '此商品目前停止交易' : ''}
          className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 py-2 rounded-lg font-bold text-sm min-h-[44px]"
        >
          {stock.current_price <= 0 ? '停止交易' : '買進'}
        </button>
        <button
          onClick={onSell}
          disabled={writeDisabled || !hasHolding || !stock.is_sellable}
          className="flex-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-200 py-2 rounded-lg font-bold text-sm border border-zinc-700 min-h-[44px]"
          title={!stock.is_sellable ? '此商品不可賣回' : !hasHolding ? '無持股' : ''}
        >
          賣出
        </button>
      </div>
    </div>
  );
}

function PriceWithTrend({ price, trend }: { price: number; trend: 'up' | 'down' | 'flat' }) {
  // flat 不顯示 icon（lucide Minus 看起來像負號會誤導），用 spacer 維持對齊
  const cls = trend === 'up' ? 'text-rose-400' : trend === 'down' ? 'text-emerald-400' : 'text-zinc-400';
  return (
    <div className={`flex items-center gap-1 ${cls}`}>
      {trend === 'up' ? (
        <ArrowUpRight className="w-4 h-4" />
      ) : trend === 'down' ? (
        <ArrowDownRight className="w-4 h-4" />
      ) : (
        <span className="w-4 h-4 inline-block" aria-hidden />
      )}
      <span className="font-mono font-bold text-lg">{price.toLocaleString()}</span>
    </div>
  );
}

function TradeModal({
  stock, action, myMoney, onClose, onDone,
}: {
  stock: StockMarketRow;
  action: 'buy' | 'sell';
  myMoney: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [shares, setShares] = useState('1');
  const [busy, busyTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const n = Math.max(0, Math.floor(Number(shares) || 0));
  const total = n * stock.current_price;
  // price=0 時 maxBuyShares 為 Infinity 沒意義；改 0 防 disable 計算 NaN
  const maxBuyShares = stock.current_price > 0 ? Math.floor(myMoney / stock.current_price) : 0;
  const maxSellShares = stock.shares;

  function handleSubmit() {
    setErr(null);
    busyTransition(async () => {
      if (action === 'buy') {
        if (n <= 0 || total > myMoney) {
          setErr('股數無效或金錢不足');
          return;
        }
        const r = await buyStock({ stockId: stock.id, shares: n });
        if (r.ok) onDone();
        else setErr(r.error?.message ?? '買進失敗');
      } else {
        if (n <= 0 || n > stock.shares) {
          setErr('股數超過持股');
          return;
        }
        const r = await sellStock({ stockId: stock.id, shares: n });
        if (r.ok) onDone();
        else setErr(r.error?.message ?? '賣出失敗');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-200">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-lg font-bold text-zinc-200 mb-1">{action === 'buy' ? '買進' : '賣出'} {stock.code}</h3>
        <p className="text-sm text-zinc-500 mb-4">{stock.name} ／ 當前價 {stock.current_price.toLocaleString()}</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500">
              股數（上限 {(action === 'buy' ? maxBuyShares : maxSellShares).toLocaleString()}）
            </label>
            <div className="flex gap-2 mt-1">
              <input
                type="number"
                min="1"
                max={action === 'buy' ? maxBuyShares : maxSellShares}
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
              />
              <button
                onClick={() => setShares((action === 'buy' ? maxBuyShares : maxSellShares).toString())}
                className="px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm border border-zinc-700"
              >
                {action === 'buy' ? '最多' : '全賣'}
              </button>
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-700 rounded-lg p-3">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">{action === 'buy' ? '應付' : '可得'}</span>
              <span className={`font-bold text-lg ${action === 'buy' ? 'text-rose-400' : 'text-emerald-400'}`}>
                {action === 'buy' ? '−' : '+'}{total.toLocaleString()}
              </span>
            </div>
            {action === 'sell' && stock.shares > 0 && (
              <div className="flex justify-between text-xs mt-1">
                <span className="text-zinc-500">預估利潤</span>
                <span className={(stock.current_price - stock.avg_cost) * n >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {((stock.current_price - stock.avg_cost) * n).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {err && <p className="text-rose-400 text-sm">{err}</p>}

          <button
            onClick={handleSubmit}
            disabled={busy}
            className={`w-full ${action === 'buy' ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950' : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'} disabled:opacity-60 py-3 rounded-lg font-bold min-h-[44px]`}
          >
            {busy ? '處理中…' : `確認${action === 'buy' ? '買進' : '賣出'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
