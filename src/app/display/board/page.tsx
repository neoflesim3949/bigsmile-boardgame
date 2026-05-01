'use client';
import { useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Megaphone, CalendarDays, ArrowUpDown } from 'lucide-react';

const MOCK_DATA = [
  { rank: 1, name: '王大明', money: '2,500,000', bless: '45', health: '80', karma: '10', rebirth: 0, score: '3,200,500' },
  { rank: 2, name: '李小美', money: '1,850,000', bless: '30', health: '100', karma: '0', rebirth: 1, score: '2,100,000' },
  { rank: 3, name: '張老闆', money: '950,000', bless: '99', health: '60', karma: '50', rebirth: 0, score: '1,940,000' },
  { rank: 4, name: '股神阿土伯', money: '1,200,000', bless: '5', health: '90', karma: '5', rebirth: 2, score: '1,800,000' },
  { rank: 5, name: '陳經理', money: '880,000', bless: '20', health: '75', karma: '15', rebirth: 0, score: '1,500,000' },
  { rank: 6, name: '林口大地主', money: '500,000', bless: '60', health: '90', karma: '5', rebirth: 0, score: '1,200,000' },
  { rank: 7, name: '小資族代表', money: '120,000', bless: '10', health: '100', karma: '0', rebirth: 0, score: '850,000' },
  { rank: 8, name: '夜市小霸王', money: '110,000', bless: '15', health: '80', karma: '20', rebirth: 0, score: '800,000' },
  { rank: 9, name: '外送天尊', money: '105,000', bless: '5', health: '60', karma: '5', rebirth: 0, score: '750,000' },
  { rank: 10, name: '東區包租公', money: '90,000', bless: '20', health: '90', karma: '30', rebirth: 1, score: '720,000' },
  { rank: 11, name: '股海冥燈', money: '50,000', bless: '0', health: '50', karma: '80', rebirth: 2, score: '400,000' },
  { rank: 12, name: '地獄倒楣鬼', money: '10,000', bless: '0', health: '10', karma: '99', rebirth: 3, score: '50,000' },
];

export default function DisplayBoardPage() {
  const [isFinal, setIsFinal] = useState(false);

  return (
    <div className="h-screen w-full bg-zinc-950 overflow-hidden flex flex-col text-zinc-100 font-sans cursor-default selection:bg-transparent">
      {/* Header */}
      <header className="h-[10vh] flex items-center justify-between px-12 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.2)]">
            <span className="text-3xl">✨</span>
          </div>
          <h1 className="text-4xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 text-glow">
            開運大富翁 ── 大廳
          </h1>
        </div>
        <div className="flex items-center gap-8">
          <div className="px-4 py-2 rounded-xl bg-amber-500/20 text-amber-500 font-bold border border-amber-500/50 text-xl shadow-[0_0_15px_rgba(245,158,11,0.2)]">
            第 5 回合
          </div>
          <div className="flex items-center gap-3 text-2xl font-mono text-zinc-300">
            <CalendarDays className="w-8 h-8 text-amber-500" />
            14:23:45 | 04/29
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 border border-zinc-800">
              <div className="w-4 h-4 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
              <span className="text-lg font-medium text-zinc-300">已連線</span>
            </div>
            <button 
              onClick={() => setIsFinal(!isFinal)}
              className={`px-4 py-2 rounded-full font-bold border transition-colors shadow-lg ${isFinal ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'}`}
              title="進入全顯示的排行榜"
            >
              {isFinal ? '返回常規模式' : '🏆 展開最終榜單'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area (Middle) */}
      <main className="flex-1 flex px-8 py-8 gap-6 h-[75vh]">
        
        {/* Left: Featured Stocks (Featured charts) - Hide during final scoring */}
        {!isFinal && (
          <div className="w-[25%] flex flex-col gap-6">
            <h2 className="text-2xl font-bold text-zinc-400 pl-4 border-l-4 border-amber-500 mb-2 uppercase tracking-widest">
              重點趨勢
            </h2>
            
            <div className="flex-1 glass-panel rounded-3xl p-6 relative overflow-hidden group border border-zinc-800">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent"></div>
              <div className="relative z-10 flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-zinc-100">TSMC 台積電</h3>
                  <p className="text-emerald-400 font-bold text-lg flex items-center gap-1">
                    <ArrowUpRight className="w-5 h-5" /> + 8.5%
                  </p>
                </div>
                <p className="text-4xl font-black text-amber-500 text-glow">820.5</p>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-emerald-500/20 to-transparent flex items-end opacity-70">
                  <div className="w-full h-full border-b-4 border-emerald-500 relative">
                    <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                      <path d="M0,80 Q10,70 20,85 T40,60 T60,75 T80,40 T100,20" fill="none" stroke="#10b981" strokeWidth="4" />
                    </svg>
                  </div>
              </div>
            </div>

            <div className="flex-1 glass-panel rounded-3xl p-6 relative overflow-hidden group border border-zinc-800">
              <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent"></div>
              <div className="relative z-10 flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-zinc-100">EST 不動產</h3>
                  <p className="text-rose-400 font-bold text-lg flex items-center gap-1">
                    <ArrowDownRight className="w-5 h-5" /> - 4.2%
                  </p>
                </div>
                <p className="text-4xl font-black text-amber-500 text-glow">120.0</p>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-rose-500/20 to-transparent flex items-end opacity-70">
                  <div className="w-full h-full border-b-4 border-rose-500 relative">
                    <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                      <path d="M0,20 Q20,30 40,50 T70,80 T100,60" fill="none" stroke="#f43f5e" strokeWidth="4" />
                    </svg>
                  </div>
              </div>
            </div>
          </div>
        )}

        {/* Center: Full Stock Listing - Hide during final scoring */}
        {!isFinal && (
          <div className="flex-1 glass-panel rounded-3xl p-8 flex flex-col border border-zinc-800 transition-all duration-500">
            <h2 className="text-2xl font-bold text-zinc-400 pl-4 border-l-4 border-amber-500 mb-6 uppercase tracking-widest">
              大會行情總表
            </h2>
            <div className="flex-1 overflow-hidden">
              <table className="w-full text-left text-xl">
                <thead>
                  <tr className="text-zinc-500 border-b-2 border-zinc-800">
                    <th className="pb-4 font-normal">代碼 / 名稱</th>
                    <th className="pb-4 text-right font-normal">價格</th>
                    <th className="pb-4 text-right pr-4 font-normal">漲跌</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-200">
                  {[
                    { code: 'TSMC', name: '台積電', price: '820.5', change: '+8.5%', up: true },
                    { code: 'GOLD', name: '國際黃金', price: '2,150', change: '-1.2%', up: false },
                    { code: 'BTC', name: '比特幣', price: '450.0', change: '+12.4%', up: true },
                    { code: 'EST', name: '不動產', price: '120.0', change: '-4.2%', up: false },
                    { code: 'APPL', name: '頻果農場', price: '165.2', change: '+0.5%', up: true },
                    { code: 'SAE', name: '航運', price: '88.5', change: '-0.3%', up: false },
                    { code: 'COFF', name: '星巴克', price: '42.0', change: '+5.0%', up: true },
                    { code: 'WTR', name: '淨水', price: '15.6', change: '+0.1%', up: true },
                  ].map((s, i) => (
                    <tr key={i} className="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors">
                      <td className="py-4">
                        <span className="font-bold text-zinc-400 w-16 inline-block">{s.code}</span>
                        <span className="font-medium ml-2">{s.name}</span>
                      </td>
                      <td className="py-4 text-right font-black text-amber-400">{s.price}</td>
                      <td className={`py-4 text-right pr-2 font-bold flex items-center justify-end gap-1 ${s.up ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {s.change}
                        {s.up ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Right: Leaderboard (Expands during final scoring) */}
        <div className={`${isFinal ? 'w-full' : 'w-[25%]'} glass-panel rounded-3xl p-8 flex flex-col border border-zinc-800 relative overflow-hidden shadow-[0_0_30px_rgba(245,158,11,0.05)] transition-all duration-500`}>
          {isFinal && <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500"></div>}
          <h2 className={`font-bold text-zinc-400 pl-4 border-l-4 border-amber-500 mb-6 uppercase tracking-widest flex justify-between items-end ${isFinal ? 'text-4xl py-2' : 'text-xl'}`}>
            <span className="text-zinc-100">🏆 大富翁風雲榜</span>
            {isFinal && <span className="text-xl font-normal text-zinc-500 normal-case tracking-normal">最終結算成績</span>}
          </h2>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <table className="w-full text-left text-xl">
              <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur-sm z-20 shadow-md">
                <tr className="text-zinc-500 border-b-2 border-zinc-800">
                  <th className="pb-3 font-normal w-20 text-center">排名</th>
                  <th className="pb-3 font-normal pl-4">玩家姓名</th>
                  
                  {isFinal && (
                    <>
                      <th className="pb-3 text-right cursor-pointer hover:text-amber-500 group transition-colors">
                        <div className="flex items-center justify-end gap-1">金錢 <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" /></div>
                      </th>
                      <th className="pb-3 text-right cursor-pointer hover:text-teal-500 group transition-colors">
                        <div className="flex items-center justify-end gap-1">福份 <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" /></div>
                      </th>
                      <th className="pb-3 text-right cursor-pointer hover:text-rose-500 group transition-colors">
                        <div className="flex items-center justify-end gap-1">健康 <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" /></div>
                      </th>
                      <th className="pb-3 text-right cursor-pointer hover:text-purple-500 group transition-colors">
                        <div className="flex items-center justify-end gap-1">業力 <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" /></div>
                      </th>
                      <th className="pb-3 text-right cursor-pointer hover:text-zinc-300 group transition-colors">
                        <div className="flex items-center justify-end gap-1">重生次數 <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" /></div>
                      </th>
                      <th className="pb-3 pr-4 text-right cursor-pointer hover:text-white group transition-colors text-amber-500">
                        <div className="flex items-center justify-end gap-1 font-bold">最終分數 <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" /></div>
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="text-zinc-200">
                {(isFinal ? MOCK_DATA : MOCK_DATA.slice(0, 10)).map((r, i) => (
                  <tr key={i} className="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors">
                    <td className="py-4 text-center w-20">
                      {r.rank <= 3 ? (
                        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full font-black text-xl shadow-lg ${r.rank === 1 ? 'bg-yellow-400 text-yellow-900 shadow-yellow-400/20' : r.rank === 2 ? 'bg-zinc-300 text-zinc-800' : 'bg-amber-600 text-amber-100'}`}>
                          {r.rank}
                        </span>
                      ) : (
                        <span className="font-bold text-zinc-500 text-2xl">{r.rank}</span>
                      )}
                    </td>
                    <td className={`py-4 pl-4 font-bold text-2xl tracking-wide ${r.rank <= 3 ? 'text-zinc-100' : 'text-zinc-400'}`}>{r.name}</td>
                    
                    {isFinal && (
                      <>
                        <td className="py-4 text-right font-bold text-amber-400">{r.money}</td>
                        <td className="py-4 text-right text-teal-400 font-medium">{r.bless}</td>
                        <td className="py-4 text-right text-rose-400 font-medium">{r.health}</td>
                        <td className="py-4 text-right text-purple-400 font-medium">{r.karma}</td>
                        <td className="py-4 text-right text-zinc-400">{r.rebirth}</td>
                        <td className="py-4 pr-4 text-right font-black text-white text-3xl">{r.score}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {/* Footer Area (Bottom) - Events & Marquee */}
      <footer className="h-[15vh] shrink-0 flex flex-col bg-zinc-900/80 border-t border-zinc-800">
        {/* Events Bar */}
        <div className="h-1/2 flex items-center px-8 border-b border-zinc-800/50 bg-amber-500/5">
          <div className="flex items-center gap-4 bg-amber-500 text-zinc-950 px-6 py-2 rounded-xl font-bold text-xl mr-8 shrink-0">
            <Megaphone className="w-6 h-6" /> 大會事件
          </div>
          <div className="text-3xl font-bold text-amber-400 tracking-wide">
            【突發】股神就是你！下午茶時段所有股票手續費減半，並解鎖隱藏商品！
          </div>
        </div>

        {/* Marquee Bar */}
        <div className="h-1/2 flex items-center px-8 overflow-hidden relative">
          <div className="flex items-center gap-3 bg-zinc-800 text-zinc-300 px-6 py-2 rounded-xl font-bold text-xl mr-8 shrink-0 z-10 border border-zinc-700">
            跑馬燈公告
          </div>
          {/* CSS Animation required for actual marquee, just using layout here */}
          <div className="text-2xl font-medium text-zinc-300 w-full flex-1 relative flex items-center whitespace-nowrap overflow-hidden">
            <span className="inline-block animate-[pulse_4s_ease-in-out_infinite]">
              歡迎各位大富翁蒞臨「星雲遊戲大廳」，目前線上人數 128 人。在10分鐘後會有特殊匯率活動，請各位玩家隨時注意看板資訊...
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
