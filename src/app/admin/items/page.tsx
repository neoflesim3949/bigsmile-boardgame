import { Package, Plus, Search, Edit2, Trash2 } from 'lucide-react';

export default function ItemsPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Package className="w-6 h-6 text-amber-500" /> 遊戲道具管理
          </h2>
          <p className="text-sm text-zinc-500 mt-1">設定關主可發放給玩家的道具與證照</p>
        </div>
        <button className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-4 py-2 rounded-lg font-bold transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center gap-2">
          <Plus className="w-4 h-4" /> 新增道具
        </button>
      </header>

      <div className="glass-panel rounded-2xl p-4 mb-8">
        <div className="relative w-72">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="搜尋道具名稱..." 
            className="bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {[
          { icon: '🏥', name: '手術執照', desc: '擁有此執照才能在急救站執行高階復甦任務，否則只能做基礎包紮。', active: true },
          { icon: '⚖️', name: '律師執照', desc: '被其他玩家提告時，可免除部分業力懲罰。', active: true },
          { icon: '💻', name: '程式技能', desc: '進入特殊關卡的前置條件。', active: true },
          { icon: '🧧', name: '財神爺 BUFF', desc: '下一次結算金錢時，獲得 1.5 倍加成。', active: true },
          { icon: '🛡️', name: '免死金牌', desc: '健康歸零時自動抵銷一次死亡狀態。', active: false },
        ].map((item, idx) => (
          <div key={idx} className="glass-panel rounded-xl overflow-hidden flex flex-col group relative">
            {!item.active && (
              <div className="absolute inset-0 bg-zinc-950/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
                <span className="bg-zinc-900/80 text-zinc-400 px-3 py-1 rounded font-medium border border-zinc-700 text-sm">已停用</span>
              </div>
            )}
            
            <div className="p-6 flex-1 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center text-4xl mb-4 border border-zinc-700 shadow-inner">
                {item.icon}
              </div>
              <h3 className="font-bold text-zinc-100 text-lg mb-2">{item.name}</h3>
              <p className="text-zinc-500 text-sm">{item.desc}</p>
            </div>
            
            <div className="border-t border-zinc-800/60 bg-zinc-900/30 p-3 flex justify-between relative z-20">
              <button className="text-zinc-500 hover:text-amber-400 transition-colors p-1.5 flex items-center gap-1.5 text-sm">
                <Edit2 className="w-4 h-4" /> 編輯
              </button>
              <button className="text-zinc-500 hover:text-rose-400 transition-colors p-1.5 flex items-center gap-1.5 text-sm">
                <Trash2 className="w-4 h-4" /> 刪除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
