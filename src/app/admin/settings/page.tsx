'use client';

import { useState } from 'react';
import { Settings, Save, Plus, Edit2, Trash2, Info, AlertTriangle, X } from 'lucide-react';

// ─── 三次確認 Modal ────────────────────────────────────────────
const CONFIRM_STEPS = [
  '你確定要執行此操作嗎？',
  '此操作無法復原，請再次確認。',
  '最後確認：資料將永久清除，確定繼續？',
];

function ConfirmModal({
  action,
  onClose,
}: {
  action: { label: string; desc: string };
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  const handleConfirm = () => {
    if (step < 2) {
      setStep(s => s + 1);
    } else {
      setDone(true);
      setTimeout(onClose, 1200);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-rose-900/60 rounded-2xl shadow-[0_0_40px_rgba(225,29,72,0.25)] p-8 max-w-sm w-full mx-4 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300">
          <X className="w-4 h-4" />
        </button>

        {done ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-3">✅</div>
            <p className="text-emerald-400 font-bold">已執行完成</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-rose-500 shrink-0" />
              <div>
                <h4 className="font-bold text-rose-400 text-base">{action.label}</h4>
                <p className="text-xs text-zinc-500 mt-0.5">{action.desc}</p>
              </div>
            </div>

            {/* Step indicators */}
            <div className="flex gap-2 mb-5">
              {[0, 1, 2].map(i => (
                <div key={i} className={`flex-1 h-1 rounded-full transition-all ${
                  i <= step ? 'bg-rose-500' : 'bg-zinc-800'
                }`} />
              ))}
            </div>

            <p className="text-zinc-300 text-sm mb-6 text-center">{CONFIRM_STEPS[step]}</p>

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm font-bold transition-colors border border-zinc-700">
                取消
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-2 rounded-lg text-sm font-bold transition-all shadow-[0_0_10px_rgba(225,29,72,0.3)]"
              >
                {step < 2 ? `確認 (${step + 1}/3)` : '最終確認，執行'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── 危險按鈕元件 ────────────────────────────────────────────────
function DangerButton({
  label,
  desc,
  highlight = false,
  onConfirm,
}: {
  label: string;
  desc: string;
  highlight?: boolean;
  onConfirm: () => void;
}) {
  const [showTip, setShowTip] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={onConfirm}
        className={`w-full flex flex-col items-center gap-2 py-4 px-3 rounded-xl text-sm font-bold transition-all border group ${
          highlight
            ? 'bg-rose-950/40 hover:bg-rose-600 text-rose-300 hover:text-white border-rose-700/50 hover:border-rose-500 shadow-[0_0_10px_rgba(225,29,72,0.1)] hover:shadow-[0_0_15px_rgba(225,29,72,0.4)]'
            : 'bg-zinc-900 hover:bg-rose-950/60 text-rose-400 border-rose-900/50 hover:border-rose-500/50 shadow-[0_0_10px_rgba(225,29,72,0)] hover:shadow-[0_0_10px_rgba(225,29,72,0.2)]'
        }`}
      >
        <span>{label}</span>
      </button>
      {/* Info badge */}
      <button
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <Info className="w-3 h-3" />
      </button>
      {/* Tooltip */}
      {showTip && (
        <div className="absolute bottom-full right-0 mb-2 w-52 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg p-3 shadow-xl z-20 leading-relaxed">
          {desc}
          <div className="absolute bottom-[-6px] right-3 w-3 h-3 bg-zinc-800 border-r border-b border-zinc-700 rotate-45" />
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [activeAction, setActiveAction] = useState<{ label: string; desc: string } | null>(null);

  return (
    <div className="p-8 max-w-6xl mx-auto pb-20">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Settings className="w-6 h-6 text-amber-500" /> 系統參數設定
          </h2>
          <p className="text-sm text-zinc-500 mt-1">管理遊戲全域數值與活動時間排程</p>
        </div>
        <button className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-6 py-2 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center gap-2">
          <Save className="w-4 h-4" /> 儲存變更
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        


        {/* Row 1: UI 顯示設定 */}
        <section className="glass-panel p-6 rounded-2xl space-y-5">
          <h3 className="text-lg font-bold text-zinc-200 border-b border-zinc-800 pb-3">數值顯示設定</h3>
          
          <div className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
            <div>
              <p className="font-semibold text-zinc-200">顯示隱藏參數 (福分與業力)</p>
              <p className="text-sm text-zinc-500 mt-1">開啟後玩家將能看見福分與業力數值。</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-14 h-7 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>
        </section>

        {/* Row 1: 最終計分權重 */}
        <section className="glass-panel p-6 rounded-2xl space-y-5">
          <h3 className="text-lg font-bold text-zinc-200 border-b border-zinc-800 pb-3">最終計分權重</h3>
          <p className="text-xs text-zinc-500 mb-4">公式：金錢 × 權重 + 福分 × 權重 − 業力 × 權重</p>
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-amber-500 mb-1">金錢</label>
              <input type="number" step="0.01" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-zinc-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500" defaultValue="0.05" />
            </div>
            <div>
              <label className="block text-sm font-medium text-teal-400 mb-1">福分</label>
              <input type="number" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-zinc-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500" defaultValue="200" />
            </div>
            <div>
              <label className="block text-sm font-medium text-purple-400 mb-1">業力 (扣除)</label>
              <input type="number" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-zinc-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500" defaultValue="150" />
            </div>
          </div>
        </section>

        {/* Row 2: 新手初始值設定 */}
        <section className="glass-panel p-6 rounded-2xl space-y-5">
          <h3 className="text-lg font-bold text-zinc-200 border-b border-zinc-800 pb-3">預設新手初始值</h3>
          <p className="text-xs text-zinc-500 mb-4">當沒有指定範本時使用的預設數值。</p>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-amber-500 mb-1">初始金錢</label>
              <input type="number" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500" defaultValue="5000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-rose-400 mb-1">初始健康</label>
              <input type="number" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500" defaultValue="100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-teal-400 mb-1">初始福分</label>
              <input type="number" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500" defaultValue="10" />
            </div>
            <div>
              <label className="block text-sm font-medium text-purple-400 mb-1">初始業力</label>
              <input type="number" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500" defaultValue="0" />
            </div>
          </div>
        </section>

        {/* Row 2: 重生參數設定 */}
        <section className="glass-panel p-6 rounded-2xl space-y-5">
          <h3 className="text-lg font-bold text-zinc-200 border-b border-zinc-800 pb-3">重生後初始值</h3>
          <p className="text-xs text-zinc-500 mb-4">玩家在特定關卡執行重生操作後，將被賦予這些數值。</p>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-amber-500 mb-1">重生金錢</label>
              <input type="number" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500" defaultValue="500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-rose-400 mb-1">重生健康</label>
              <input type="number" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500" defaultValue="60" />
            </div>
            <div>
              <label className="block text-sm font-medium text-teal-400 mb-1">重生福分</label>
              <input type="number" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500" defaultValue="5" />
            </div>
            <div>
              <label className="block text-sm font-medium text-purple-400 mb-1">重生業力</label>
              <input type="number" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500" defaultValue="0" />
            </div>
          </div>
        </section>

        {/* Row 3: 新手命格範本池 */}
        <section className="glass-panel p-6 rounded-2xl space-y-5 lg:col-span-2 border-t-4 border-t-purple-500">
          <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
            <div>
              <h3 className="text-lg font-bold text-zinc-200">新手命格範本 (抽卡池)</h3>
              <p className="text-xs text-zinc-500 mt-1">玩家首次註冊時，將從以下啟用的命格中隨機抽取一組作為初始數值。</p>
            </div>
            <button className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-zinc-700 flex items-center gap-1">
              <Plus className="w-4 h-4" /> 新增命格
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { name: '富貴命', money: 10000, health: 50, bless: 5, karma: 20, active: true },
              { name: '清修命', money: 500, health: 80, bless: 50, karma: 0, active: true },
              { name: '平庸命', money: 3000, health: 70, bless: 15, karma: 5, active: true },
            ].map((tmpl, idx) => (
              <div key={idx} className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4 relative group">
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-bold text-zinc-200">{tmpl.name}</h4>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked={tmpl.active} className="sr-only peer" />
                    <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between"><span className="text-zinc-500">金錢</span><span className="text-amber-400 font-medium">{tmpl.money}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">健康</span><span className="text-rose-400 font-medium">{tmpl.health}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">福分</span><span className="text-teal-400 font-medium">{tmpl.bless}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">業力</span><span className="text-purple-400 font-medium">{tmpl.karma}</span></div>
                </div>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-zinc-900/90 rounded p-1 shadow-lg">
                  <button className="p-1 text-zinc-400 hover:text-amber-400 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button className="p-1 text-zinc-400 hover:text-rose-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Row 4: 危險操作區 */}
        <section className="glass-panel p-6 rounded-2xl space-y-5 lg:col-span-2 border-t-4 border-t-rose-600 bg-gradient-to-br from-rose-950/20 to-zinc-950">
          <div className="border-b border-rose-900/50 pb-3">
            <h3 className="text-lg font-bold text-rose-500">危險操作區 (Danger Zone)</h3>
            <p className="text-xs text-rose-400/70 mt-1">這些操作將清除或欸檔當前遊戲的進度與數據，操作後無法復原。每個按鈕需經過 <strong className="text-rose-400">3 次確認</strong>才會執行。</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            <DangerButton
              label="重置會員明細"
              desc="清空所有玩家的金錢、福分、健康、業力、命格、持股記錄、借貸紀錄、換匯紀錄，僅保留帳號。"
              onConfirm={() => setActiveAction({ label: '重置會員明細', desc: '清空所有玩家的金錢、福分、健康、業力、命格、持股記錄、借貸紀錄、換匯紀錄，僅保留帳號。' })}
            />
            <DangerButton
              label="刪除所有會員"
              desc="從資料庫彻底刪除所有玩家資料，包括帳號、命格、交易記錄。操作後玩家需重新註冊。"
              onConfirm={() => setActiveAction({ label: '刪除所有會員', desc: '從資料庫彻底刪除所有玩家資料，包括帳號、命格、交易記錄。操作後玩家需重新註冊。' })}
            />
            <DangerButton
              label="重置股價歷史"
              desc="清空所有股票的歷史價格記錄與曲線，股價回複到設定的初始價格。"
              onConfirm={() => setActiveAction({ label: '重置股價歷史', desc: '清空所有股票的歷史價格記錄與曲線，股價回複到設定的初始價格。' })}
            />
            <DangerButton
              label="刪除所有股票"
              desc="從資料庫彻底刪除所有股市商品定義與持股記錄。操作後需重新設定股票。"
              onConfirm={() => setActiveAction({ label: '刪除所有股票', desc: '從資料庫彻底刪除所有股市商品定義與持股記錄。操作後需重新設定股票。' })}
            />
            <DangerButton
              label="重置使用次數"
              desc="清空道具與關卡項目的使用記錄次數，但保留道具定義與玩家財富資料。"
              highlight
              onConfirm={() => setActiveAction({ label: '重置使用次數', desc: '清空道具與關卡項目的使用記錄次數，但保留道具定義與玩家財富資料。' })}
            />
          </div>
        </section>

      </div>

      {/* 三次確認 Modal */}
      {activeAction && (
        <ConfirmModal
          action={activeAction}
          onClose={() => setActiveAction(null)}
        />
      )}
    </div>
  );
}
