import { MapPin, Plus, UserPlus, Zap } from 'lucide-react';

export default function StationsPage() {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-amber-500" /> 關卡與關主指派
          </h2>
          <p className="text-sm text-zinc-500 mt-1">管理實體活動站點、設定限額與分派關主</p>
        </div>
        <button className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-4 py-2 rounded-lg font-bold transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center gap-2">
          <Plus className="w-4 h-4" /> 新增關卡
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[
          { name: '新手村服務台', desc: '新玩家報到與發放初始資金', rebirth: true, maxPlayer: null, maxGlobal: null, captains: ['C-01 (關主陳)', 'C-02 (新手導師)'] },
          { name: '命運輪盤挑戰', desc: '隨機增減福報與業力', rebirth: false, maxPlayer: 3, maxGlobal: null, captains: ['C-03 (輪盤小精靈)'] },
          { name: '黑市交易中心', desc: '高風險金錢獲取', rebirth: false, maxPlayer: 1, maxGlobal: 50, captains: [] },
          { name: '急救復甦站', desc: '花費巨額金錢恢復健康', rebirth: true, maxPlayer: null, maxGlobal: null, captains: ['C-04 (醫生護士)'] },
        ].map((s, idx) => (
          <div key={idx} className="glass-panel p-6 rounded-2xl flex flex-col h-full border-t-4 border-t-zinc-700 hover:border-t-amber-500 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-lg font-bold text-zinc-100">{s.name}</h3>
              {s.rebirth && (
                <span className="flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-xs font-medium">
                  <Zap className="w-3 h-3" /> 允許重生
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-400 mb-6 flex-1">{s.desc}</p>
            
            <div className="bg-zinc-900/60 rounded-xl p-4 border border-zinc-800 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">每人參與上限</span>
                <span className="text-zinc-300 font-medium">{s.maxPlayer ? `${s.maxPlayer} 次` : '無限制'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">全場累計上限</span>
                <span className="text-zinc-300 font-medium">{s.maxGlobal ? `${s.maxGlobal} 次` : '無限制'}</span>
              </div>
              
              <div className="pt-3 border-t border-zinc-800">
                <span className="text-xs text-zinc-500 mb-2 block">指派關主</span>
                {s.captains.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {s.captains.map(c => (
                      <span key={c} className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs px-2 py-1 rounded">
                        {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <button className="text-sm text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-colors">
                    <UserPlus className="w-4 h-4" /> 指派關主
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
