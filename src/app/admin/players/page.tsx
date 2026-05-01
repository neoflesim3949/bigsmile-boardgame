import { Download, Search, Plus, UserX, KeyRound, GripHorizontal } from 'lucide-react';

export default function PlayersAdminPage() {
  return (
    <div className="p-8">
      <header className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold text-zinc-100">玩家與帳號管理</h2>
        <div className="flex gap-4">
          <button className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-zinc-700 flex items-center gap-2">
            <Download className="w-4 h-4" /> 批次匯入帳號
          </button>
          <button className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center gap-2">
            <Plus className="w-4 h-4" /> 建立新帳號
          </button>
        </div>
      </header>

      <div className="glass-panel rounded-2xl p-6">
        <div className="flex justify-between items-center mb-6">
          {/* Search */}
          <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 w-96 relative">
            <Search className="w-4 h-4 text-zinc-500 mr-2" />
            <input 
              type="text" 
              placeholder="搜尋玩家姓名、登入 ID..." 
              className="bg-transparent border-none outline-none text-sm text-zinc-200 w-full"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm border border-zinc-800 bg-zinc-800/50 text-zinc-300 px-3 py-1 rounded-full">玩家: 128 人</span>
            <span className="text-sm border border-zinc-800 bg-zinc-800/50 text-emerald-400 px-3 py-1 rounded-full">關主: 12 人</span>
          </div>
        </div>

        <table className="w-full text-left">
          <thead>
            <tr className="text-zinc-500 text-sm border-b border-zinc-800 bg-zinc-900/30">
              <th className="py-3 pl-4 rounded-tl-lg">ID</th>
              <th className="py-3">姓名</th>
              <th className="py-3">登入帳號</th>
              <th className="py-3">角色</th>
              <th className="py-3">狀態</th>
              <th className="py-3 text-right pr-4 rounded-tr-lg">操作</th>
            </tr>
          </thead>
          <tbody className="text-zinc-200">
            {[
              { id: 'U-001', name: '王大明', loginId: 'player01', role: '玩家', active: true },
              { id: 'U-002', name: '陳關主', loginId: 'captain01', role: '關主', active: true },
              { id: 'U-003', name: '林小草', loginId: 'player02', role: '玩家', active: true },
              { id: 'U-042', name: '違規測試員', loginId: 'tester99', role: '玩家', active: false },
            ].map((row) => (
              <tr key={row.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                <td className="py-4 pl-4 text-zinc-400 font-mono text-sm">{row.id}</td>
                <td className="py-4 font-medium">{row.name}</td>
                <td className="py-4 text-zinc-400">{row.loginId}</td>
                <td className="py-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${row.role === '關主' ? 'bg-teal-500/10 text-teal-400' : 'bg-amber-500/10 text-amber-500'}`}>
                    {row.role}
                  </span>
                </td>
                <td className="py-4">
                  {row.active 
                    ? <span className="flex items-center gap-1 text-emerald-400 text-sm"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> 啟用</span>
                    : <span className="flex items-center gap-1 text-zinc-500 text-sm"><div className="w-2 h-2 rounded-full bg-zinc-600"></div> 停用</span>
                  }
                </td>
                <td className="py-4 text-right pr-4">
                  <div className="flex justify-end gap-2">
                    <button className="p-2 text-zinc-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors" title="重設密碼">
                      <KeyRound className="w-4 h-4" />
                    </button>
                    {row.active ? (
                      <button className="p-2 text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors" title="強制登出 / 停用">
                        <UserX className="w-4 h-4" />
                      </button>
                    ) : (
                      <button className="p-2 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors" title="重新啟用">
                        <GripHorizontal className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* Pagination mock */}
        <div className="flex justify-between items-center mt-6 text-sm text-zinc-500">
          <div>顯示 1 至 10 筆，共 140 筆</div>
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-zinc-900 border border-zinc-700 rounded hover:bg-zinc-800 disabled:opacity-50">上一頁</button>
            <button className="px-3 py-1 bg-zinc-900 border border-zinc-700 rounded hover:bg-zinc-800 disabled:opacity-50">下一頁</button>
          </div>
        </div>
      </div>
    </div>
  );
}
