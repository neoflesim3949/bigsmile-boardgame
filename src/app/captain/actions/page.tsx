import Link from 'next/link';
import { ArrowLeft, Save, Plus, Trash2, Heart, Sparkles, Scale, Wallet, PackageOpen, Target, ClipboardCheck } from 'lucide-react';

export default function CaptainActionsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col max-w-md mx-auto relative border-x border-zinc-900 pb-20">
      <header className="p-4 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/captain" className="w-10 h-10 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold text-zinc-100">管理快捷模組</h1>
        </div>
        <button className="text-teal-400 hover:text-teal-300 font-bold text-sm bg-teal-500/10 px-3 py-1.5 rounded-lg">
          <Plus className="w-4 h-4 inline-block mr-1" /> 新增
        </button>
      </header>

      <div className="p-4 space-y-6">
        
        {/* Edit Module Card 1 */}
        <div className="glass-panel p-5 rounded-2xl border-t-4 border-t-teal-500 relative">
          <button className="absolute top-4 right-4 text-zinc-500 hover:text-rose-500 transition-colors">
            <Trash2 className="w-5 h-5" />
          </button>
          
          <div className="mb-4 pr-8">
            <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold block mb-1">模組名稱</label>
            <input type="text" defaultValue="任務通關獎勵" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-zinc-100 focus:border-teal-500 focus:outline-none" />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-2">
              <label className="flex items-center gap-1 text-xs text-zinc-400 mb-1">
                <Wallet className="w-3 h-3 text-amber-500" /> 金錢變動
              </label>
              <input type="number" defaultValue="+50" className="w-full bg-transparent text-sm font-bold text-amber-500 placeholder-zinc-700 focus:outline-none" placeholder="0" />
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-2">
              <label className="flex items-center gap-1 text-xs text-zinc-400 mb-1">
                <Heart className="w-3 h-3 text-rose-500" /> 健康變動
              </label>
              <input type="number" defaultValue="0" className="w-full bg-transparent text-sm font-bold text-rose-500 placeholder-zinc-700 focus:outline-none" placeholder="0" />
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-2">
              <label className="flex items-center gap-1 text-xs text-zinc-400 mb-1">
                <Sparkles className="w-3 h-3 text-teal-400" /> 福分變動
              </label>
              <input type="number" defaultValue="+2" className="w-full bg-transparent text-sm font-bold text-teal-400 placeholder-zinc-700 focus:outline-none" placeholder="0" />
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-2">
              <label className="flex items-center gap-1 text-xs text-zinc-400 mb-1">
                <Scale className="w-3 h-3 text-purple-500" /> 業力變動
              </label>
              <input type="number" defaultValue="0" className="w-full bg-transparent text-sm font-bold text-purple-500 placeholder-zinc-700 focus:outline-none" placeholder="0" />
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 mb-4">
            <label className="flex items-center gap-1 text-xs text-zinc-400 mb-2 border-b border-zinc-800/50 pb-2">
              <ClipboardCheck className="w-3 h-3 text-zinc-500" /> 前提條件最低門檻 (留白代表不檢查)
            </label>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="flex items-center gap-1 text-[0.625rem] text-zinc-400 mb-1">
                  <Wallet className="w-3 h-3 text-amber-500" /> 金錢門檻
                </label>
                <input type="number" placeholder="無" className="w-full bg-zinc-950 border border-zinc-700 rounded p-1.5 text-sm font-medium text-zinc-300 focus:outline-none focus:border-teal-500" />
              </div>
              <div>
                <label className="flex items-center gap-1 text-[0.625rem] text-zinc-400 mb-1">
                  <Heart className="w-3 h-3 text-rose-500" /> 健康門檻
                </label>
                <input type="number" placeholder="無" className="w-full bg-zinc-950 border border-zinc-700 rounded p-1.5 text-sm font-medium text-zinc-300 focus:outline-none focus:border-teal-500" />
              </div>
              <div>
                <label className="flex items-center gap-1 text-[0.625rem] text-zinc-400 mb-1">
                  <Sparkles className="w-3 h-3 text-teal-400" /> 福分門檻
                </label>
                <input type="number" placeholder="無" className="w-full bg-zinc-950 border border-zinc-700 rounded p-1.5 text-sm font-medium text-zinc-300 focus:outline-none focus:border-teal-500" />
              </div>
              <div>
                <label className="flex items-center gap-1 text-[0.625rem] text-zinc-400 mb-1">
                  <Scale className="w-3 h-3 text-purple-500" /> 業力門檻
                </label>
                <input type="number" placeholder="無" className="w-full bg-zinc-950 border border-zinc-700 rounded p-1.5 text-sm font-medium text-zinc-300 focus:outline-none focus:border-teal-500" />
              </div>
            </div>
            <div>
              <label className="flex items-center gap-1 text-[0.625rem] text-zinc-400 mb-1">
                <PackageOpen className="w-3 h-3 text-zinc-500" /> 必須持有道具
              </label>
              <select className="w-full bg-zinc-950 border border-zinc-700 rounded p-1.5 text-sm text-zinc-300 focus:outline-none focus:border-teal-500">
                <option value="">無</option>
                <option value="ITM-01">🏥 手術執照</option>
                <option value="ITM-02">🧧 財神爺 BUFF</option>
                <option value="ITM-04">💻 程式技能認證</option>
              </select>
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 mb-4">
            <label className="flex items-center gap-1 text-xs text-zinc-400 mb-2 border-b border-zinc-800/50 pb-2">
              <Target className="w-3 h-3 text-zinc-500" /> 使用次數限制 (白底/空值代表無限制)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[0.625rem] text-zinc-500 block mb-1">單一玩家使用上限</label>
                <input type="number" placeholder="∞" className="w-full bg-zinc-950 border border-zinc-700 rounded p-1.5 text-sm font-medium text-zinc-300 focus:outline-none focus:border-teal-500 text-center" />
              </div>
              <div>
                <label className="text-[0.625rem] text-zinc-500 block mb-1">本場活動總上限</label>
                <input type="number" placeholder="∞" className="w-full bg-zinc-950 border border-zinc-700 rounded p-1.5 text-sm font-medium text-zinc-300 focus:outline-none focus:border-teal-500 text-center" />
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
             <label className="flex items-center gap-1 text-xs text-zinc-400 mb-2">
                <PackageOpen className="w-3 h-3" /> 同時發放道具 (選擇性)
              </label>
              <select className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-zinc-300 focus:outline-none focus:border-teal-500">
                <option value="">無綁定道具</option>
                <option value="ITM-01">🏥 手術執照</option>
                <option value="ITM-02">🧧 財神爺 BUFF</option>
                <option value="ITM-04">💻 程式技能認證</option>
              </select>
          </div>
        </div>

        {/* Edit Module Card 2 */}
        <div className="glass-panel p-5 rounded-2xl border-t-4 border-t-rose-500 relative opacity-70 hover:opacity-100 transition-opacity">
          <button className="absolute top-4 right-4 text-zinc-500 hover:text-rose-500 transition-colors">
            <Trash2 className="w-5 h-5" />
          </button>
          
          <div className="mb-4 pr-8">
            <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold block mb-1">模組名稱</label>
            <input type="text" defaultValue="任務失敗扣除" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-zinc-100 focus:border-teal-500 focus:outline-none" />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-2">
              <label className="flex items-center gap-1 text-xs text-zinc-400 mb-1">
                <Heart className="w-3 h-3 text-rose-500" /> 健康變動
              </label>
              <input type="number" defaultValue="-5" className="w-full bg-transparent text-sm font-bold text-rose-500 placeholder-zinc-700 focus:outline-none" placeholder="0" />
            </div>
            {/* ... Only showing one for brevity in mockup ... */}
          </div>
        </div>

      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-zinc-950/90 border-t border-zinc-800 max-w-md mx-auto z-40">
        <button className="w-full bg-teal-500 hover:bg-teal-400 text-zinc-950 font-bold py-3.5 rounded-xl shadow-[0_0_20px_rgba(20,184,166,0.2)] flex items-center justify-center gap-2">
          <Save className="w-5 h-5" /> 儲存修改
        </button>
      </div>

    </div>
  );
}
