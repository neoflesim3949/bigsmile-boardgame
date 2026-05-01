import { Users, Search, Plus, Filter, KeyRound, RefreshCw, XCircle } from 'lucide-react';

export default function AccountsPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Users className="w-6 h-6 text-amber-500" /> 帳號與權限管理
          </h2>
          <p className="text-sm text-zinc-500 mt-1">管理玩家、關主及管理員名單</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg font-medium transition-colors border border-zinc-700">
            批次匯入 CSV
          </button>
          <button className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-4 py-2 rounded-lg font-bold transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center gap-2">
            <Plus className="w-4 h-4" /> 新增帳號
          </button>
        </div>
      </header>

      <div className="glass-panel rounded-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <div className="flex gap-4">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="搜尋姓名或帳號..." 
                className="bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none w-64"
              />
            </div>
            <button className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 text-zinc-400 px-3 py-2 rounded-lg text-sm hover:text-zinc-200 transition-colors">
              <Filter className="w-4 h-4" /> 角色過濾
            </button>
          </div>
          <div className="text-sm text-zinc-500">
            共 132 個帳號
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-zinc-500 text-sm border-b border-zinc-800 bg-zinc-900/30">
                <th className="p-4 font-medium">玩家 ID</th>
                <th className="p-4 font-medium">姓名</th>
                <th className="p-4 font-medium">登入帳號</th>
                <th className="p-4 font-medium">角色</th>
                <th className="p-4 font-medium">狀態</th>
                <th className="p-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300 text-sm">
              {[
                { id: 'U-001', name: '王大明', login: 'player1', role: '玩家', active: true },
                { id: 'U-002', name: '李小華', login: 'player2', role: '玩家', active: true },
                { id: 'C-01', name: '關主陳', login: 'captain1', role: '關主', active: true },
                { id: 'A-01', name: '大會管理', login: 'admin', role: '管理員', active: true },
                { id: 'U-003', name: '停權玩家', login: 'player3', role: '玩家', active: false },
              ].map((row) => (
                <tr key={row.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors group">
                  <td className="p-4 font-mono text-zinc-400">{row.id}</td>
                  <td className="p-4 font-semibold text-zinc-200">{row.name}</td>
                  <td className="p-4 text-zinc-500">{row.login}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs border ${
                      row.role === '玩家' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                      row.role === '關主' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                      'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      {row.role}
                    </span>
                  </td>
                  <td className="p-4">
                    {row.active ? (
                      <span className="flex items-center gap-1.5 text-emerald-400 text-xs"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> 已啟用</span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-zinc-500 text-xs"><div className="w-2 h-2 rounded-full bg-zinc-600"></div> 已停用</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 text-zinc-400 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors" title="重設密碼">
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 text-zinc-400 hover:text-amber-400 hover:bg-amber-400/10 rounded transition-colors" title="重設初始值">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-400/10 rounded transition-colors" title="停用帳號">
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
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
