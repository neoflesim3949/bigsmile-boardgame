import { Play, Square, QrCode, ClipboardCopy, ListTodo } from 'lucide-react';

export default function BoardAdminPage() {
  return (
    <div className="p-8">
      <header className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold text-zinc-100">活動看板與事件跑馬燈</h2>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* Token Management */}
        <div className="glass-panel p-6 rounded-2xl h-fit">
          <h3 className="text-lg font-semibold text-amber-500 mb-2 flex items-center gap-2">
            <QrCode className="w-5 h-5" /> 產生大屏授權連結
          </h3>
          <p className="text-sm text-zinc-400 mb-6">
            活動看板不需帳號登入，但必須攜帶具有時效性的 Display Token。請在將螢幕連接到大屏設備前，建立新的授權連結。
          </p>
          
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 text-center">
            <div className="w-48 h-48 bg-white rounded-xl mx-auto flex items-center justify-center p-2 mb-4">
              <QrCode className="w-full h-full text-zinc-900" />
            </div>
            <div className="flex items-center gap-2 bg-zinc-950 p-2 rounded-lg border border-zinc-700 relative group">
              <input 
                type="text" 
                readOnly 
                defaultValue="http://localhost:3000/display/board?token=eyJhbGciOiJIUzI1NiIsInR5cCI6Ik..." 
                className="w-full bg-transparent text-sm text-amber-500/70 outline-none truncate" 
              />
              <button className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200">
                <ClipboardCopy className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <button className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-3 rounded-xl border border-zinc-700 transition-colors">
            核發新一組授權碼 (TTL: 2 Days)
          </button>
        </div>

        {/* Preset Events */}
        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              <ListTodo className="w-5 h-5 text-teal-500" /> 排程事件清單 (Events)
            </h3>
            <button className="text-sm text-amber-500 hover:text-amber-400 bg-amber-500/10 px-3 py-1 rounded">
              + 新增事件排程
            </button>
          </div>
          <p className="text-sm text-zinc-400 mb-6">
            預先設定好的遊戲階段性事件，將依據排定時間出現在大屏幕底部的「事件列」。這與跑馬燈不同，具備優先度排序與自動上下檔功能。
          </p>

          <div className="space-y-4">
            {/* Event item */}
            <div className="bg-zinc-900/50 border border-emerald-500/30 rounded-xl p-4 group">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="font-bold text-zinc-200 text-sm">【播送中】財神降臨</span>
                </div>
                <div className="flex gap-2">
                  <button className="text-rose-500 hover:bg-rose-500/10 p-1.5 rounded disabled:opacity-0" title="強制中斷">
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                </div>
              </div>
              <p className="text-amber-500 font-medium mb-3">
                「股神就是你！下午茶時段所有股票手續費減半，並解鎖隱藏商品！」
              </p>
              <div className="text-xs text-zinc-500 flex justify-between">
                <span>優先權: 100</span>
                <span>時間: 14:00 - 15:00</span>
              </div>
            </div>

            {/* Event item */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-zinc-600"></span>
                  <span className="font-bold text-zinc-400 text-sm">【待命】業力引爆階段</span>
                </div>
                <div className="flex gap-2">
                  <button className="text-emerald-500 hover:bg-emerald-500/10 p-1.5 rounded" title="手動播放">
                    <Play className="w-4 h-4 fill-current" />
                  </button>
                </div>
              </div>
              <p className="text-zinc-300 font-medium mb-3">
                「市場恐慌！所有股票跌幅雙倍，且不可售出直到本階段結束。」
              </p>
              <div className="text-xs text-zinc-500 flex justify-between">
                <span>優先權: 50</span>
                <span>時間: 16:30 - 17:00</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
