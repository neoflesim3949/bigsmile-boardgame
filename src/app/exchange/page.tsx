'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, ArrowRightLeft, Wallet, CheckCircle2 } from 'lucide-react';

// ── Mock config（實際由後台 /admin/finance 設定）────────────────
const RATES = [
  { id: 'sm', label: '標準方案', blessingPerUnit: 1, moneyPerUnit: 80  },
  { id: 'md', label: '優惠方案', blessingPerUnit: 5, moneyPerUnit: 450 },
  { id: 'lg', label: 'VIP 方案', blessingPerUnit: 10, moneyPerUnit: 950 },
];

// 玩家不知道自己的福報值；只知道最高可兌換現金
const MY_HIDDEN_BLESSING = 15;   // hidden from UI
const PLAYER_MONEY = 12500;

export default function ExchangePage() {
  const [selectedRate, setSelectedRate] = useState(RATES[0]);
  const [units, setUnits]               = useState(1);
  const [done, setDone]                 = useState(false);

  // 可兌換最大單位數（依隱藏福報推算，玩家不知道具體來源）
  const maxUnits   = Math.floor(MY_HIDDEN_BLESSING / selectedRate.blessingPerUnit);
  const totalMoney = selectedRate.moneyPerUnit * units;
  const canExchange = units >= 1 && units <= maxUnits;

  const handleExchange = () => {
    if (!canExchange) return;
    setDone(true);
    setTimeout(() => setDone(false), 2500);
  };

  return (
    <div className="min-h-screen page-bg flex flex-col max-w-md mx-auto border-x border-theme">
      {/* Header */}
      <header className="p-4 flex items-center gap-4 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <Link href="/" className="w-10 h-10 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-zinc-100">換匯所</h1>
          <p className="text-xs text-zinc-500">特殊資源 → 金錢兌換</p>
        </div>
      </header>

      <div className="p-4 space-y-5">
        {/* 玩家只看到金錢餘額，不看福報 */}
        <div className="bg-amber-950/30 border border-amber-700/30 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-[0.6875rem] text-zinc-500">目前金錢</p>
            <p className="text-2xl font-bold text-amber-300">{PLAYER_MONEY.toLocaleString()}</p>
          </div>
        </div>

        {/* Rate Selection — 不透露扣除福報，僅顯示「每單位可獲得多少金錢」 */}
        <div>
          <p className="text-sm font-semibold text-zinc-400 mb-2">選擇兌換方案</p>
          <div className="space-y-2">
            {RATES.map((rate) => {
              const myMax = Math.floor(MY_HIDDEN_BLESSING / rate.blessingPerUnit);
              return (
                <button
                  key={rate.id}
                  onClick={() => { setSelectedRate(rate); setUnits(1); }}
                  className={`w-full text-left rounded-xl border px-4 py-3.5 transition-all flex items-center justify-between ${
                    selectedRate.id === rate.id
                      ? 'border-teal-500/60 bg-teal-500/10'
                      : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">{rate.label}</p>
                    {/* 玩家只看到最高可兌現金，不知道消耗幾福 */}
                    <p className="text-xs text-zinc-500 mt-0.5">
                      最高可兌：
                      <span className="text-amber-400 font-semibold">
                        {(rate.moneyPerUnit * myMax).toLocaleString()}
                      </span> 元
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-zinc-600" />
                    <span className="text-amber-400 font-bold text-sm">
                      +{rate.moneyPerUnit.toLocaleString()} / 單位
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 兌換單位（原「兌換次數」） */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-zinc-400">兌換單位</p>
            <p className="text-xs text-zinc-600">最多可兌換 {maxUnits} 單位</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setUnits((u) => Math.max(1, u - 1))}
              className="w-11 h-11 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-xl font-bold hover:bg-zinc-700 transition-colors active:scale-95"
            >
              −
            </button>
            <div className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl h-11 flex items-center justify-center text-xl font-bold text-zinc-100">
              {units}
            </div>
            <button
              onClick={() => setUnits((u) => Math.min(maxUnits, u + 1))}
              className="w-11 h-11 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-xl font-bold hover:bg-zinc-700 transition-colors active:scale-95"
            >
              ＋
            </button>
          </div>
        </div>

        {/* Preview — 只顯示獲得金錢，不透露福報扣除 */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">結算預覽</p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">兌換單位</span>
            <span className="text-sm font-bold text-zinc-300">{units} 單位</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">獲得金錢</span>
            <span className="text-sm font-bold text-amber-400">+ {totalMoney.toLocaleString()}</span>
          </div>
          <div className="border-t border-zinc-800 pt-3 flex items-center justify-between">
            <span className="text-sm text-zinc-400">兌換後金錢</span>
            <span className="text-base font-bold text-zinc-100">{(PLAYER_MONEY + totalMoney).toLocaleString()}</span>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={handleExchange}
          disabled={!canExchange}
          className={`w-full py-4 rounded-xl font-bold text-zinc-950 transition-all active:scale-95 ${
            done
              ? 'bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)]'
              : canExchange
              ? 'bg-teal-500 hover:bg-teal-400 shadow-[0_0_20px_rgba(20,184,166,0.3)]'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
        >
          {done ? (
            <span className="flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5" /> 兌換成功！
            </span>
          ) : canExchange ? (
            `確認兌換（獲得 +${totalMoney.toLocaleString()}）`
          ) : (
            '額度不足'
          )}
        </button>
      </div>
    </div>
  );
}
