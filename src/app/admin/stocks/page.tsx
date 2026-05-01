import { Activity, Plus, Search, Eye, EyeOff, Edit, Play, CalendarDays } from 'lucide-react';
import Link from 'next/link';

function ScriptCell({ value }: { value: string }) {
  const isFixed = value.includes('$');
  const type = isFixed ? '$' : '%';
  const num = value.replace('$', '').replace('%', '').replace('+', ''); // Keep minus sign if negative

  let textColor = 'text-zinc-500';
  if (value) {
    if (value.includes('-')) textColor = 'text-rose-400';
    else if (isFixed) textColor = 'text-blue-300';
    else textColor = 'text-emerald-400';
  }

  return (
    <div className={`flex items-stretch mx-auto w-[110px] bg-zinc-950 border ${value ? 'border-zinc-600' : 'border-zinc-800/50'} rounded focus-within:border-blue-500 overflow-hidden transition-colors`}>
      <select defaultValue={type} className="bg-zinc-900 text-zinc-400 text-xs px-1 outline-none border-r border-zinc-800 cursor-pointer">
        <option value="%">%</option>
        <option value="$">$</option>
      </select>
      <input 
        type="text" 
        defaultValue={num} 
        placeholder="-" 
        className={`w-full bg-transparent p-1.5 text-center text-sm outline-none font-medium ${textColor}`} 
      />
    </div>
  );
}

export default function StocksPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Activity className="w-6 h-6 text-amber-500" /> 股市商品管理
          </h2>
          <p className="text-sm text-zinc-500 mt-1">設定遊戲內股市的商品項目與漲跌規則</p>
        </div>
        <button className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-4 py-2 rounded-lg font-bold transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center gap-2">
          <Plus className="w-4 h-4" /> 新增商品
        </button>
      </header>

      <div className="glass-panel rounded-2xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="搜尋代碼或名稱..." 
                className="bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none w-64"
              />
            </div>
            <div className="text-sm text-zinc-500">
              共 4 檔商品 (上限 10 檔)
            </div>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left">
              <thead>
                <tr className="text-zinc-500 text-sm border-b border-zinc-800 bg-zinc-900/30">
                  <th className="p-4 font-medium">代碼</th>
                  <th className="p-4 font-medium">名稱</th>
                  <th className="p-4 font-medium text-right">當前價格</th>
                  <th className="p-4 font-medium text-center">前台顯示</th>
                  <th className="p-4 font-medium text-center">交易狀態</th>
                  <th className="p-4 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300 text-sm">
                {[
                  { code: 'TSMC', name: '大富翁神山', price: '950', visible: true, buyable: true, sellable: true },
                  { code: 'DOGE', name: '狗神幣', price: '42', visible: true, buyable: true, sellable: true },
                  { code: 'GOLD', name: '黃金避險', price: '2,100', visible: true, buyable: false, sellable: true },
                  { code: 'SCAM', name: '未知詐騙盤', price: '10', visible: false, buyable: false, sellable: false },
                ].map((row) => (
                  <tr key={row.code} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors group">
                    <td className="p-4 font-mono font-bold text-amber-400">{row.code}</td>
                    <td className="p-4 font-semibold text-zinc-200">{row.name}</td>
                    <td className="p-4 text-right font-bold text-blue-300">{row.price}</td>
                    <td className="p-4 text-center">
                      {row.visible ? <Eye className="w-4 h-4 mx-auto text-emerald-500" /> : <EyeOff className="w-4 h-4 mx-auto text-zinc-600" />}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {row.buyable ? (
                          <span className="bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded text-xs">買</span>
                        ) : (
                          <span className="bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded text-xs line-through">買</span>
                        )}
                        {row.sellable ? (
                          <span className="bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded text-xs">賣</span>
                        ) : (
                          <span className="bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded text-xs line-through">賣</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/admin/stocks/${row.code}`} className="p-1.5 text-zinc-400 hover:text-amber-400 hover:bg-amber-400/10 rounded transition-colors" title="編輯設定">
                          <Edit className="w-4 h-4" />
                        </Link>
                        <button className="p-1.5 text-zinc-400 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors" title="手動調價">
                          <Activity className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Global Round Script Matrix */}
        <div className="glass-panel rounded-2xl overflow-hidden flex flex-col mt-8 border-t-4 border-t-blue-500">
          <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold text-zinc-200 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-blue-500" /> 股市大盤回合腳本總表
              </h3>
              <p className="text-sm text-zinc-400 mt-2">
                統籌設定每一回合各檔股票的漲跌與觸發的新聞跑馬燈。未填寫的欄位表示該回合股價保持不變。
              </p>
            </div>
            <button className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-4 py-2 rounded-lg font-bold transition-colors border border-blue-500/30 flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> 新增回合
            </button>
          </div>

          <div className="overflow-x-auto flex-1 custom-scrollbar">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-800 bg-zinc-900/80">
                  <th className="p-4 font-bold sticky left-0 bg-zinc-900 z-10 w-24 border-r border-zinc-800">回合</th>
                  <th className="p-4 font-medium text-amber-400 text-center w-28">TSMC<br/><span className="text-xs text-zinc-500 font-normal">神山</span></th>
                  <th className="p-4 font-medium text-amber-400 text-center w-28">DOGE<br/><span className="text-xs text-zinc-500 font-normal">狗神幣</span></th>
                  <th className="p-4 font-medium text-amber-400 text-center w-28">GOLD<br/><span className="text-xs text-zinc-500 font-normal">黃金</span></th>
                  <th className="p-4 font-medium text-amber-400 text-center w-28">SCAM<br/><span className="text-xs text-zinc-500 font-normal">詐騙盤</span></th>
                  <th className="p-4 font-medium pl-8 w-[400px]">事件跑馬燈 (推播至看板)</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {[
                  { round: 1, tsmc: '', doge: '', gold: '', scam: '', event: '' },
                  { round: 2, tsmc: '+5%', doge: '-10%', gold: '', scam: '', event: '市場觀望氣氛濃厚，虛擬貨幣微幅下修。' },
                  { round: 3, tsmc: '+15%', doge: '', gold: '-5%', scam: '', event: 'AI 晶片需求大爆發，半導體產業全面看漲！' },
                  { round: 4, tsmc: '', doge: '+200%', gold: '', scam: '$50', event: '神秘富豪喊盤狗神幣，迷因幣瘋漲！' },
                  { round: 5, tsmc: '$1200', doge: '-50%', gold: '+10%', scam: '$0', event: '外資大舉買入神山突破天際！詐騙盤驚傳負責人捲款潛逃下市！' },
                ].map((row) => (
                  <tr key={row.round} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="p-4 font-bold text-zinc-200 sticky left-0 bg-zinc-900/95 backdrop-blur-sm border-r border-zinc-800">
                      第 {row.round} 回合
                    </td>
                    <td className="p-2 text-center">
                      <ScriptCell value={row.tsmc} />
                    </td>
                    <td className="p-2 text-center">
                      <ScriptCell value={row.doge} />
                    </td>
                    <td className="p-2 text-center">
                      <ScriptCell value={row.gold} />
                    </td>
                    <td className="p-2 text-center">
                      <ScriptCell value={row.scam} />
                    </td>
                    <td className="p-2 pl-8 pr-4">
                      <input type="text" defaultValue={row.event} placeholder="無特定事件..." className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 px-3 focus:border-amber-500 focus:outline-none text-amber-400/90" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

    </div>
  );
}
