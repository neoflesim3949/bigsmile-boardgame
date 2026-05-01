import { MonitorPlay, Plus, Calendar, Clock, Key, Copy, Link2 } from 'lucide-react';

export default function EventsPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <MonitorPlay className="w-6 h-6 text-amber-500" /> 看板與事件管理
          </h2>
          <p className="text-sm text-zinc-500 mt-1">設定輪播事件劇情與發行大屏授權</p>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        <div className="xl:col-span-2 space-y-6">
          <div className="flex justify-between items-end">
            <h3 className="text-lg font-bold text-zinc-200">劇情事件排程</h3>
            <button className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center gap-2">
              <Plus className="w-4 h-4" /> 新增事件
            </button>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="text-zinc-500 text-sm border-b border-zinc-800 bg-zinc-900/30">
                  <th className="p-4 font-medium w-16 text-center">優先權</th>
                  <th className="p-4 font-medium">內部標題</th>
                  <th className="p-4 font-medium">看板顯示文字</th>
                  <th className="p-4 font-medium">生效期間</th>
                  <th className="p-4 font-medium text-center">狀態</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300 text-sm">
                {[
                  { prio: 100, title: '下午茶加碼', text: '股神就是你！下午茶時段加碼開始...', start: '14:00', end: '15:00', active: true },
                  { prio: 50, title: '業力反噬', text: '業力反噬：本時段所有交易手續費加倍', start: '15:30', end: '16:00', active: true },
                  { prio: 10, title: '常駐公告', text: '歡迎各位玩家參與本次開運大富翁！', start: '不限', end: '不限', active: true },
                  { prio: 0, title: '測試文字', text: '這是一段測試事件的顯示文字...', start: '-', end: '-', active: false },
                ].map((row, idx) => (
                  <tr key={idx} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="p-4 text-center font-mono text-zinc-500">{row.prio}</td>
                    <td className="p-4 font-semibold text-zinc-200">{row.title}</td>
                    <td className="p-4 text-amber-200 max-w-xs truncate">{row.text}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 text-zinc-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{row.start} ~ {row.end}</span>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      {row.active ? (
                        <span className="bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded text-xs">啟用中</span>
                      ) : (
                        <span className="bg-zinc-800 text-zinc-500 px-2 py-1 rounded text-xs">停用</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl border-t-4 border-t-teal-500">
            <h3 className="text-lg font-bold text-zinc-200 mb-2 flex items-center gap-2">
              <MonitorPlay className="w-5 h-5 text-teal-500" /> 看板畫面設定
            </h3>
            <p className="text-xs text-zinc-400 mb-6">調整大屏投射的版面與重點關注項目</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">主標題文字</label>
                <input type="text" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500" defaultValue="開運大富翁 ── 大廳" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">重點曲線商品 (最多 4 檔)</label>
                <select className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 focus:border-teal-500 focus:outline-none mb-2">
                  <option>TSMC 大富翁神山</option>
                  <option>GOLD 黃金避險</option>
                </select>
                <div className="flex gap-2">
                  <span className="bg-zinc-800 border border-zinc-700 px-2 py-1 rounded text-xs text-zinc-300 flex items-center gap-1">TSMC <button className="text-zinc-500 hover:text-rose-400">×</button></span>
                  <span className="bg-zinc-800 border border-zinc-700 px-2 py-1 rounded text-xs text-zinc-300 flex items-center gap-1">DOGE <button className="text-zinc-500 hover:text-rose-400">×</button></span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">顏色主題</label>
                <div className="grid grid-cols-2 gap-2">
                  <button className="bg-zinc-900 border border-teal-500 text-teal-400 py-2 rounded-lg text-sm font-medium">紅漲綠跌</button>
                  <button className="bg-zinc-900 border border-zinc-700 text-zinc-500 py-2 rounded-lg text-sm font-medium hover:bg-zinc-800">綠漲紅跌</button>
                </div>
              </div>
              <button className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold py-2.5 rounded-lg transition-colors mt-2">
                儲存看板設定
              </button>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-2xl">
            <h3 className="text-lg font-bold text-zinc-200 mb-2 flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-500" /> 授權 Display Token
            </h3>
            <p className="text-xs text-zinc-400 mb-4">大屏設備必須使用含有效 Token 的專屬連結才能顯示畫面。</p>
            
            <button className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold py-2 rounded-lg transition-colors border border-zinc-700 mb-4 flex items-center justify-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> 產生新 Token
            </button>

            <div className="space-y-3">
              <div className="bg-zinc-900/80 border border-zinc-800 p-3 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-zinc-300">主舞台大電視</span>
                  <span className="text-[0.625rem] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">有效</span>
                </div>
                <div className="flex gap-2">
                  <input type="text" readOnly value="https://domain.com/display/board?token=eyJhb..." className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-500 font-mono" />
                  <button className="bg-zinc-800 p-1.5 rounded hover:text-amber-400 text-zinc-400 transition-colors"><Copy className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="bg-zinc-900/80 border border-zinc-800 p-3 rounded-lg opacity-60">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-zinc-400">備用投影機</span>
                  <span className="text-[0.625rem] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">已撤銷</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
