'use client';

import { useState } from 'react';
import { useWriteGuard } from '@/components/shared/WriteGuard';
import { Settings, Save, Plus, Edit2, Trash2, Info, AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import {
  updateAppSettings,
  upsertTemplate,
  deleteTemplate,
  upsertKarmaBand,
  deleteKarmaBand,
  performDangerOp,
  type SettingsPayload,
  type TemplateRow,
  type KarmaBandRow,
  type DangerOp,
} from '@/app/actions/admin';
import type { AppSettingsKey } from '@/lib/settings';
import { useConfirm } from '@/components/shared/ConfirmProvider';

const THEME_OPTIONS = ['amber', 'teal', 'purple', 'rose', 'sky', 'zinc'] as const;
type Theme = (typeof THEME_OPTIONS)[number];

const THEME_SWATCH: Record<Theme, string> = {
  amber: 'bg-amber-500',
  teal: 'bg-teal-500',
  purple: 'bg-purple-500',
  rose: 'bg-rose-500',
  sky: 'bg-sky-500',
  zinc: 'bg-zinc-500',
};

const CONFIRM_STEPS = [
  '你確定要執行此操作嗎？',
  '此操作無法復原，請再次確認。',
  '最後確認：資料將永久清除，確定繼續？',
];

interface DangerActionInfo {
  label: string;
  desc: string;
  op: DangerOp;
  highlight?: boolean;
}

interface Props {
  initialSettings: Record<string, string>;
  initialTemplates: TemplateRow[];
  initialKarmaBands: KarmaBandRow[];
}

export default function SettingsClient({ initialSettings, initialTemplates, initialKarmaBands }: Props) {
  const [settings, setSettings] = useState<Record<string, string>>(initialSettings);
  const [templates, setTemplates] = useState<TemplateRow[]>(initialTemplates);
  const [bands, setBands] = useState<KarmaBandRow[]>(initialKarmaBands);
  const [activeAction, setActiveAction] = useState<DangerActionInfo | null>(null);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [editingBand, setEditingBand] = useState<KarmaBandRow | null>(null);
  const { busy: savingSettings, run } = useWriteGuard();
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const confirm = useConfirm();

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  }

  function setField(key: AppSettingsKey, value: string) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function handleSaveSettings() {
    const payload: SettingsPayload = settings as SettingsPayload;
    const r = await run(() => updateAppSettings(payload));
    if (r?.ok) showToast(true, `已更新 ${r.data!.updated} 項設定`);
  }

  return (
    <div className="p-8 max-w-6xl mx-auto pb-20">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Settings className="w-6 h-6 text-amber-500" /> 系統參數設定
          </h2>
          <p className="text-sm text-zinc-500 mt-1">管理遊戲全域數值與活動時間排程</p>
        </div>
        <button
          onClick={handleSaveSettings}
          disabled={savingSettings}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 px-6 py-2 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center gap-2 min-h-[44px]"
        >
          <Save className="w-4 h-4" /> {savingSettings ? '儲存中…' : '儲存變更'}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Row 1: UI 顯示設定 */}
        <section className="glass-panel p-6 rounded-2xl space-y-5">
          <h3 className="text-lg font-bold text-zinc-200 border-b border-zinc-800 pb-3">數值顯示設定</h3>
          <div className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
            <div>
              <p className="font-semibold text-zinc-200">福分與業力</p>
              <p className="text-sm text-zinc-500 mt-1">開啟後玩家將能看見福分與業力數值。</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${settings.ShowAllStats === 'true' ? 'text-zinc-600' : 'text-zinc-200'}`}>隱藏</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.ShowAllStats === 'true'}
                  onChange={(e) => setField('ShowAllStats', e.target.checked ? 'true' : 'false')}
                  className="sr-only peer"
                />
                <div className="w-14 h-7 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
              <span className={`text-sm font-medium ${settings.ShowAllStats === 'true' ? 'text-amber-400' : 'text-zinc-600'}`}>顯示</span>
            </div>
          </div>
        </section>

        {/* Row 1: 最終計分權重 */}
        <section className="glass-panel p-6 rounded-2xl space-y-5">
          <h3 className="text-lg font-bold text-zinc-200 border-b border-zinc-800 pb-3">最終計分權重</h3>
          <p className="text-xs text-zinc-500 mb-4">公式：金錢 × 權重 + 福分 × 權重 − 業力 × 權重</p>
          <div className="grid grid-cols-3 gap-4">
            <NumField label="金錢" color="amber" step="0.01" value={settings.ScoreWeightMoney ?? '0.05'} onChange={(v) => setField('ScoreWeightMoney', v)} />
            <NumField label="福分" color="teal" value={settings.ScoreWeightBlessing ?? '200'} onChange={(v) => setField('ScoreWeightBlessing', v)} />
            <NumField label="業力 (扣除)" color="purple" value={settings.ScoreWeightKarma ?? '150'} onChange={(v) => setField('ScoreWeightKarma', v)} />
          </div>
        </section>

        {/* 賣股福分扣分 */}
        <SellBlessingPenaltySection
          divisor={settings.StockSellBlessingPenaltyDivisor ?? '10000'}
          onChange={(v) => setField('StockSellBlessingPenaltyDivisor', v)}
        />

        {/* Row 2: 重生後初始值（每個玩家都必須抽命格，不再保留新手初始值 fallback） */}
        <section className="glass-panel p-6 rounded-2xl space-y-5">
          <h3 className="text-lg font-bold text-zinc-200 border-b border-zinc-800 pb-3">重生後初始值</h3>
          <p className="text-xs text-zinc-500 mb-4">玩家在特定關卡執行重生操作後，將被賦予這些數值。</p>
          <div className="grid grid-cols-2 gap-4">
            <NumField label="重生金錢" color="amber" value={settings.RebirthMoney ?? '500'} onChange={(v) => setField('RebirthMoney', v)} />
            <NumField label="重生健康" color="rose" value={settings.RebirthHealth ?? '50'} onChange={(v) => setField('RebirthHealth', v)} />
            <NumField label="重生福分" color="teal" value={settings.RebirthBlessing ?? '5'} onChange={(v) => setField('RebirthBlessing', v)} />
            <NumField label="重生業力" color="purple" value={settings.RebirthKarma ?? '0'} onChange={(v) => setField('RebirthKarma', v)} />
          </div>
        </section>

        {/* Row 3: 新手命格範本池 */}
        <section className="glass-panel p-6 rounded-2xl space-y-5 lg:col-span-2 border-t-4 border-t-purple-500">
          <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
            <div>
              <h3 className="text-lg font-bold text-zinc-200">新手命格範本 (抽卡池)</h3>
              <p className="text-xs text-zinc-500 mt-1">啟用中的範本依比例配額抽卡。抽完設定的總人數後，第 N+1 人開始第二輪 cycle 同比例分配，永不擋人。</p>
            </div>
            <button
              onClick={() => setEditing(emptyTemplate())}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-zinc-700 flex items-center gap-1 min-h-[40px]"
            >
              <Plus className="w-4 h-4" /> 新增命格
            </button>
          </div>

          {/* 總人數基準 + 比例合計 */}
          <DestinyQuotaPanel
            maxDraws={settings.MaxDestinyDraws ?? '100'}
            templates={templates}
            onChangeMaxDraws={(v) => setField('MaxDestinyDraws', v)}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                t={t}
                maxDraws={Number(settings.MaxDestinyDraws) || 100}
                onToggle={async (active) => {
                  const r = await run(() => upsertTemplate({ ...t, is_active: active }));
                  if (r?.ok) {
                    setTemplates((arr) => arr.map((x) => x.id === t.id ? r.data! : x));
                  }
                }}
                onEdit={() => setEditing(t)}
                onDelete={async () => {
                  if (!(await confirm({ message: `確定刪除命格「${t.label}」？`, danger: true }))) return;
                  const r = await run(() => deleteTemplate(t.id));
                  if (r?.ok) {
                    setTemplates((arr) => arr.filter((x) => x.id !== t.id));
                    showToast(true, '已刪除');
                  }
                }}
              />
            ))}
            {templates.length === 0 && (
              <p className="text-zinc-500 text-sm col-span-full">尚無範本，按右上角「新增命格」建立。</p>
            )}
          </div>
        </section>

        {/* Row 3.5: 業力影響 */}
        <section className="glass-panel p-6 rounded-2xl space-y-5 lg:col-span-2 border-t-4 border-t-purple-700">
          <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
            <div>
              <h3 className="text-lg font-bold text-zinc-200">業力影響</h3>
              <p className="text-xs text-zinc-500 mt-1">推進回合時，依玩家當下業力對應到的區段套用四項值變動。地獄狀態（健康 / 福分 ≤ 0）玩家不受影響。</p>
            </div>
            <button
              onClick={() => setEditingBand(emptyKarmaBand(bands.length))}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-zinc-700 flex items-center gap-1 min-h-[40px]"
            >
              <Plus className="w-4 h-4" /> 新增區段
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                  <th className="py-2 pr-3">狀態</th>
                  <th className="py-2 pr-3">業力區間</th>
                  <th className="py-2 pr-3 text-right">金錢</th>
                  <th className="py-2 pr-3 text-right">健康</th>
                  <th className="py-2 pr-3 text-right">福分</th>
                  <th className="py-2 pr-3 text-right">業力</th>
                  <th className="py-2 pr-3 text-center">啟用</th>
                  <th className="py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {bands.map((b) => (
                  <tr key={b.id} className="border-b border-zinc-800/60 hover:bg-zinc-900/40">
                    <td className="py-2 pr-3 font-medium text-zinc-200">{b.label}</td>
                    <td className="py-2 pr-3 font-mono text-zinc-400">{formatBandRange(b)}</td>
                    <DeltaCell value={b.money_delta} className="text-amber-400" />
                    <DeltaCell value={b.health_delta} className="text-rose-400" />
                    <DeltaCell value={b.blessing_delta} className="text-teal-400" />
                    <DeltaCell value={b.karma_delta} className="text-purple-400" />
                    <td className="py-2 pr-3 text-center">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={b.is_active}
                          onChange={async (e) => {
                            const r = await run(() => upsertKarmaBand({ ...b, is_active: e.target.checked }));
                            if (r?.ok) setBands((arr) => arr.map((x) => x.id === b.id ? r.data! : x));
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
                      </label>
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button onClick={() => setEditingBand(b)} className="p-1.5 text-zinc-400 hover:text-amber-400">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          if (!(await confirm({ message: `確定刪除業力區段「${b.label}」？`, danger: true }))) return;
                          const r = await run(() => deleteKarmaBand(b.id));
                          if (r?.ok) {
                            setBands((arr) => arr.filter((x) => x.id !== b.id));
                            showToast(true, '已刪除');
                          }
                        }}
                        className="p-1.5 text-zinc-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {bands.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-zinc-500 text-sm">尚無業力區段，按右上角「新增區段」建立。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Row 4: 危險操作 */}
        <section className="glass-panel p-6 rounded-2xl space-y-5 lg:col-span-2 border-t-4 border-t-rose-600 bg-gradient-to-br from-rose-950/20 to-zinc-950">
          <div className="border-b border-rose-900/50 pb-3">
            <h3 className="text-lg font-bold text-rose-500">危險操作區 (Danger Zone)</h3>
            <p className="text-xs text-rose-400/70 mt-1">
              這些操作將清除遊戲進度與數據，操作後無法復原。每個按鈕需經過 <strong className="text-rose-400">3 次確認</strong>才會執行。
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            <DangerButton
              info={{ label: '重置會員明細', op: 'reset_player_data', desc: '清空所有玩家的金錢、福分、健康、業力、命格、持股、借貸、道具，僅保留帳號。' }}
              onActivate={setActiveAction}
            />
            <DangerButton
              info={{ label: '刪除所有會員', op: 'delete_all_players', desc: '從資料庫徹底刪除所有 player 角色帳號（含交易記錄）。' }}
              onActivate={setActiveAction}
            />
            <DangerButton
              info={{ label: '重置股價歷史', op: 'reset_stock_history', desc: '清空所有股票歷史價格記錄；當前價格保持不變。' }}
              onActivate={setActiveAction}
            />
            <DangerButton
              info={{ label: '刪除所有股票', op: 'delete_all_stocks', desc: '徹底刪除所有股市商品定義與持股記錄。' }}
              onActivate={setActiveAction}
            />
            <DangerButton
              info={{ label: '重置使用次數', op: 'reset_usage_count', desc: '清空關卡 / 快捷模組的使用次數計數，但保留定義與玩家財富。', highlight: true }}
              onActivate={setActiveAction}
            />
          </div>
        </section>
      </div>

      {activeAction && (
        <ConfirmModal
          info={activeAction}
          onClose={() => setActiveAction(null)}
          onConfirmed={() => showToast(true, `已執行：${activeAction.label}`)}
        />
      )}

      {editing && (
        <TemplateModal
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setTemplates((arr) => {
              const idx = arr.findIndex((x) => x.id === saved.id);
              if (idx >= 0) {
                const copy = [...arr];
                copy[idx] = saved;
                return copy;
              }
              return [...arr, saved];
            });
            setEditing(null);
            showToast(true, '已儲存範本');
          }}
        />
      )}

      {editingBand && (
        <KarmaBandModal
          band={editingBand}
          onClose={() => setEditingBand(null)}
          onSaved={(saved) => {
            setBands((arr) => {
              const idx = arr.findIndex((x) => x.id === saved.id);
              if (idx >= 0) {
                const copy = [...arr];
                copy[idx] = saved;
                return copy.sort((a, b) => a.sort_order - b.sort_order);
              }
              return [...arr, saved].sort((a, b) => a.sort_order - b.sort_order);
            });
            setEditingBand(null);
            showToast(true, '已儲存業力區段');
          }}
        />
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 ${toast.ok ? 'bg-zinc-900 border-amber-500/40 text-amber-300' : 'bg-rose-950 border-rose-700 text-rose-300'} border px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-40`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span className="text-sm">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

// ─── 子元件 ───

function emptyTemplate(): TemplateRow {
  return {
    id: '',
    label: '',
    emoji: '🀄',
    description: '',
    theme: 'zinc',
    rarity_label: '普通',
    money: 1000,
    health: 80,
    blessing: 10,
    karma: 0,
    is_active: true,
    draw_ratio: 0,
  };
}

const COLOR_MAP: Record<string, { text: string; ring: string }> = {
  amber: { text: 'text-amber-500', ring: 'focus:border-amber-500 focus:ring-amber-500' },
  rose: { text: 'text-rose-400', ring: 'focus:border-rose-500 focus:ring-rose-500' },
  teal: { text: 'text-teal-400', ring: 'focus:border-teal-500 focus:ring-teal-500' },
  purple: { text: 'text-purple-400', ring: 'focus:border-purple-500 focus:ring-purple-500' },
};

function NumField({
  label, color, value, onChange, step,
}: {
  label: string; color: string; value: string; onChange: (v: string) => void; step?: string;
}) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.amber;
  return (
    <div>
      <label className={`block text-sm font-medium mb-1 ${c.text}`}>{label}</label>
      <input
        type="number"
        step={step ?? '1'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 focus:ring-1 ${c.ring}`}
      />
    </div>
  );
}

function SellBlessingPenaltySection({
  divisor, onChange,
}: { divisor: string; onChange: (v: string) => void }) {
  const num = Math.max(1, Number(divisor) || 10000);
  // 換算說明：每多少獲利扣 1 福分 / 每 1K 獲利扣多少福分
  const per1k = (1000 / num).toFixed(num >= 10000 ? 2 : 1);
  const profit5k = Math.round(5000 / num);
  const profit10k = Math.round(10000 / num);
  const profit50k = Math.round(50000 / num);
  return (
    <section className="glass-panel p-6 rounded-2xl space-y-4">
      <h3 className="text-lg font-bold text-zinc-200 border-b border-zinc-800 pb-3">賣股福分扣分</h3>
      <p className="text-xs text-zinc-500">公式：<code className="text-amber-400">blessing_penalty = round(profit / divisor)</code>；賠錢時不扣。同時影響玩家自助賣出與關主代售（倍率為 ×1 時）。</p>
      <div className="flex items-center gap-3">
        <label className="text-sm text-zinc-300">每</label>
        <input
          type="number"
          min="1"
          step="100"
          value={divisor}
          onChange={(e) => onChange(e.target.value)}
          className="w-32 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 text-center font-mono"
        />
        <span className="text-sm text-zinc-300">獲利扣 1 福分</span>
      </div>
      <div className="bg-zinc-900/50 rounded-lg border border-zinc-800 p-3 text-xs grid grid-cols-2 gap-x-4 gap-y-1">
        <div className="text-zinc-500">每 1K 獲利</div>
        <div className="text-teal-400 font-mono">扣 {per1k} 福分</div>
        <div className="text-zinc-500">5K profit</div>
        <div className="text-teal-400 font-mono">扣 {profit5k} 福分</div>
        <div className="text-zinc-500">10K profit</div>
        <div className="text-teal-400 font-mono">扣 {profit10k} 福分</div>
        <div className="text-zinc-500">50K profit</div>
        <div className="text-teal-400 font-mono">扣 {profit50k} 福分</div>
      </div>
      <p className="text-[0.6875rem] text-zinc-500 italic">記得按右上「儲存變更」</p>
    </section>
  );
}

function TemplateCard({
  t, maxDraws, onToggle, onEdit, onDelete,
}: {
  t: TemplateRow;
  maxDraws: number;
  onToggle: (active: boolean) => void | Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const quota = Math.floor((maxDraws * t.draw_ratio) / 100);
  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4 relative group">
      <div className="flex justify-between items-start mb-3">
        <h4 className="font-bold text-zinc-200 flex items-center gap-2">
          <span className="text-xl">{t.emoji}</span>
          {t.label}
        </h4>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={t.is_active}
            onChange={(e) => onToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm mb-2">
        <div className="flex justify-between"><span className="text-zinc-500">金錢</span><span className="text-amber-400 font-medium">{t.money}</span></div>
        <div className="flex justify-between"><span className="text-zinc-500">健康</span><span className="text-rose-400 font-medium">{t.health}</span></div>
        <div className="flex justify-between"><span className="text-zinc-500">福分</span><span className="text-teal-400 font-medium">{t.blessing}</span></div>
        <div className="flex justify-between"><span className="text-zinc-500">業力</span><span className="text-purple-400 font-medium">{t.karma}</span></div>
      </div>
      <div className="border-t border-zinc-800 pt-2 flex justify-between text-xs">
        <span className="text-zinc-500">抽卡比例</span>
        <span className={t.draw_ratio > 0 ? 'text-emerald-400 font-mono font-bold' : 'text-zinc-600 font-mono'}>
          {t.draw_ratio}% <span className="text-zinc-500 font-normal">→ {quota} 人</span>
        </span>
      </div>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-zinc-900/90 rounded p-1 shadow-lg">
        <button onClick={onEdit} className="p-1 text-zinc-400 hover:text-amber-400 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
        <button onClick={onDelete} className="p-1 text-zinc-400 hover:text-rose-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}

function DestinyQuotaPanel({
  maxDraws, templates, onChangeMaxDraws,
}: {
  maxDraws: string;
  templates: TemplateRow[];
  onChangeMaxDraws: (v: string) => void;
}) {
  const activeTemplates = templates.filter((t) => t.is_active);
  const totalRatio = activeTemplates.reduce((sum, t) => sum + (t.draw_ratio || 0), 0);
  const isExact = totalRatio === 100;
  const colorCls = isExact ? 'text-emerald-400' : totalRatio > 100 ? 'text-rose-400' : 'text-amber-400';
  const num = Math.max(1, Number(maxDraws) || 100);
  return (
    <div className="bg-zinc-900/50 rounded-lg border border-zinc-800 p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-zinc-200">總人數基準（MaxDestinyDraws）</p>
          <p className="text-xs text-zinc-500 mt-0.5">每張命格 quota = 此值 × 比例 ÷ 100。記得按右上「儲存變更」</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            value={maxDraws}
            onChange={(e) => onChangeMaxDraws(e.target.value)}
            className="w-24 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 text-center font-mono"
          />
          <span className="text-zinc-500 text-sm">人</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs border-t border-zinc-800 pt-2">
        <span className="text-zinc-500">啟用範本比例合計</span>
        <span className={`${colorCls} font-mono font-bold`}>
          {totalRatio}%
          {!isExact && (
            <span className="ml-2 text-[0.6875rem] font-normal">
              （建議調為 100%；目前 quota 合計 {Math.floor((num * totalRatio) / 100)} / {num} 人）
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function TemplateModal({
  template, onClose, onSaved,
}: {
  template: TemplateRow; onClose: () => void; onSaved: (t: TemplateRow) => void;
}) {
  const [draft, setDraft] = useState<TemplateRow>(template);
  const { busy, run } = useWriteGuard();
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    setErr(null);
    const r = await run(() => upsertTemplate({
      id: draft.id || undefined,
      label: draft.label,
      emoji: draft.emoji,
      description: draft.description,
      theme: draft.theme as Theme,
      rarity_label: draft.rarity_label,
      money: Number(draft.money),
      health: Number(draft.health),
      blessing: Number(draft.blessing),
      karma: Number(draft.karma),
      is_active: draft.is_active,
      draw_ratio: Number(draft.draw_ratio) || 0,
    }));
    if (r?.ok) onSaved(r.data!);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-lg font-bold text-zinc-200 mb-4">{draft.id ? '編輯命格' : '新增命格'}</h3>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-zinc-500">命格名稱</label>
              <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" />
            </div>
            <div>
              <label className="text-xs text-zinc-500">圖示</label>
              <input value={draft.emoji} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 text-center" />
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500">描述</label>
            <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500">色系</label>
              <select value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value as Theme })} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200">
                {THEME_OPTIONS.map((th) => <option key={th} value={th}>{th}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500">稀有度標籤</label>
              <input value={draft.rarity_label} onChange={(e) => setDraft({ ...draft, rarity_label: e.target.value })} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SmallNum label="初始金錢" value={draft.money} onChange={(v) => setDraft({ ...draft, money: v })} />
            <SmallNum label="初始健康（0–100）" value={draft.health} onChange={(v) => setDraft({ ...draft, health: Math.min(100, Math.max(0, v)) })} />
            <SmallNum label="初始福分" value={draft.blessing} onChange={(v) => setDraft({ ...draft, blessing: v })} />
            <SmallNum label="初始業力" value={draft.karma} onChange={(v) => setDraft({ ...draft, karma: v })} />
          </div>
          <div>
            <label className="text-xs text-zinc-500">抽卡比例（0–100 %）</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={draft.draw_ratio}
                onChange={(e) => {
                  const n = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                  setDraft({ ...draft, draw_ratio: n });
                }}
                className="w-24 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 text-center font-mono"
              />
              <span className="text-zinc-500 text-sm">%</span>
              <span className="text-xs text-zinc-600 ml-2">啟用範本比例合計建議 = 100%</span>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
            啟用（納入抽卡池）
          </label>
        </div>

        {err && <p className="mt-3 text-rose-400 text-sm">{err}</p>}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm font-bold border border-zinc-700 min-h-[44px]">取消</button>
          <button onClick={handleSave} disabled={busy || !draft.label} className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 py-2 rounded-lg text-sm font-bold min-h-[44px]">
            {busy ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}

function emptyKarmaBand(orderHint: number): KarmaBandRow {
  return {
    id: '',
    label: '',
    karma_min: null,
    karma_max: null,
    money_delta: 0,
    health_delta: 0,
    blessing_delta: 0,
    karma_delta: 0,
    theme: 'zinc',
    sort_order: (orderHint + 1) * 10,
    is_active: true,
  };
}

function formatBandRange(b: KarmaBandRow): string {
  if (b.karma_min === null && b.karma_max === null) return '全範圍';
  if (b.karma_min === null) return `≤ ${b.karma_max}`;
  if (b.karma_max === null) return `≥ ${b.karma_min}`;
  return `${b.karma_min} ~ ${b.karma_max}`;
}

function DeltaCell({ value, className }: { value: number; className: string }) {
  if (value === 0) {
    return <td className="py-2 pr-3 text-right text-zinc-600 font-mono">0</td>;
  }
  const sign = value > 0 ? '+' : '';
  return <td className={`py-2 pr-3 text-right font-mono font-medium ${className}`}>{sign}{value.toLocaleString()}</td>;
}

function KarmaBandModal({
  band, onClose, onSaved,
}: {
  band: KarmaBandRow; onClose: () => void; onSaved: (b: KarmaBandRow) => void;
}) {
  const [draft, setDraft] = useState<KarmaBandRow>(band);
  const { busy, run } = useWriteGuard();
  const [err, setErr] = useState<string | null>(null);

  function setNum(key: 'money_delta' | 'health_delta' | 'blessing_delta' | 'karma_delta' | 'sort_order', v: string) {
    const n = Number(v);
    setDraft({ ...draft, [key]: Number.isFinite(n) ? Math.trunc(n) : 0 });
  }

  function setRange(key: 'karma_min' | 'karma_max', v: string) {
    if (v.trim() === '') {
      setDraft({ ...draft, [key]: null });
      return;
    }
    const n = Number(v);
    setDraft({ ...draft, [key]: Number.isFinite(n) ? Math.trunc(n) : null });
  }

  async function handleSave() {
    setErr(null);
    const r = await run(() => upsertKarmaBand({
      id: draft.id || undefined,
      label: draft.label,
      karma_min: draft.karma_min,
      karma_max: draft.karma_max,
      money_delta: draft.money_delta,
      health_delta: draft.health_delta,
      blessing_delta: draft.blessing_delta,
      karma_delta: draft.karma_delta,
      theme: draft.theme,
      sort_order: draft.sort_order,
      is_active: draft.is_active,
    }));
    if (r?.ok) onSaved(r.data!);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-lg font-bold text-zinc-200 mb-4">{draft.id ? '編輯業力區段' : '新增業力區段'}</h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500">狀態名稱</label>
            <input
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="例：光明者 / 平凡 / 墮落"
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500">業力下限（空=不設下限）</label>
              <input
                type="number"
                value={draft.karma_min ?? ''}
                onChange={(e) => setRange('karma_min', e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">業力上限（空=不設上限）</label>
              <input
                type="number"
                value={draft.karma_max ?? ''}
                onChange={(e) => setRange('karma_max', e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 font-mono"
              />
            </div>
          </div>
          <p className="text-[0.6875rem] text-zinc-500 -mt-2">區間：{formatBandRange(draft)}</p>

          <div className="border-t border-zinc-800 pt-3">
            <p className="text-xs text-zinc-400 mb-2">每回合影響（負值表示扣除）</p>
            <div className="grid grid-cols-2 gap-3">
              <SmallNum label="金錢" value={draft.money_delta} onChange={(v) => setNum('money_delta', String(v))} />
              <SmallNum label="健康（cap 0–100）" value={draft.health_delta} onChange={(v) => setNum('health_delta', String(v))} />
              <SmallNum label="福分（cap ≥ 0）" value={draft.blessing_delta} onChange={(v) => setNum('blessing_delta', String(v))} />
              <SmallNum label="業力（無上下限）" value={draft.karma_delta} onChange={(v) => setNum('karma_delta', String(v))} />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-500">色系（玩家首頁狀態卡的卡片色）</label>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {THEME_OPTIONS.map((th) => {
                const swatchCls = THEME_SWATCH[th] ?? 'bg-zinc-700';
                return (
                  <button
                    key={th}
                    type="button"
                    onClick={() => setDraft({ ...draft, theme: th })}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors ${
                      draft.theme === th
                        ? 'border-zinc-300 bg-zinc-800'
                        : 'border-zinc-700 bg-zinc-950 hover:border-zinc-500'
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-full ${swatchCls}`} />
                    <span className="text-xs text-zinc-300">{th}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500">排序（小者優先）</label>
              <input
                type="number"
                value={draft.sort_order}
                onChange={(e) => setNum('sort_order', e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 font-mono"
              />
            </div>
            <label className="flex items-end gap-2 text-sm text-zinc-300 pb-2">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
              />
              啟用此區段
            </label>
          </div>
        </div>

        {err && <p className="mt-3 text-rose-400 text-sm">{err}</p>}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm font-bold border border-zinc-700 min-h-[44px]">取消</button>
          <button onClick={handleSave} disabled={busy || !draft.label} className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 py-2 rounded-lg text-sm font-bold min-h-[44px]">
            {busy ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SmallNum({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs text-zinc-500">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200"
      />
    </div>
  );
}

function DangerButton({
  info, onActivate,
}: {
  info: DangerActionInfo; onActivate: (i: DangerActionInfo) => void;
}) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => onActivate(info)}
        className={`w-full flex flex-col items-center gap-2 py-4 px-3 rounded-xl text-sm font-bold transition-all border min-h-[44px] ${
          info.highlight
            ? 'bg-rose-950/40 hover:bg-rose-600 text-rose-300 hover:text-white border-rose-700/50 hover:border-rose-500 shadow-[0_0_10px_rgba(225,29,72,0.1)] hover:shadow-[0_0_15px_rgba(225,29,72,0.4)]'
            : 'bg-zinc-900 hover:bg-rose-950/60 text-rose-400 border-rose-900/50 hover:border-rose-500/50 shadow-[0_0_10px_rgba(225,29,72,0)] hover:shadow-[0_0_10px_rgba(225,29,72,0.2)]'
        }`}
      >
        <span>{info.label}</span>
      </button>
      <button
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <Info className="w-3 h-3" />
      </button>
      {showTip && (
        <div className="absolute bottom-full right-0 mb-2 w-52 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg p-3 shadow-xl z-20 leading-relaxed">
          {info.desc}
          <div className="absolute bottom-[-6px] right-3 w-3 h-3 bg-zinc-800 border-r border-b border-zinc-700 rotate-45" />
        </div>
      )}
    </div>
  );
}

function ConfirmModal({
  info, onClose, onConfirmed,
}: {
  info: DangerActionInfo; onClose: () => void; onConfirmed: () => void;
}) {
  const [step, setStep] = useState(0);
  const { busy, run } = useWriteGuard();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleConfirm() {
    if (step < 2) {
      setStep((s) => s + 1);
      return;
    }
    const r = await run(() => performDangerOp(info.op));
    if (r?.ok) {
      setDone(true);
      onConfirmed();
      setTimeout(onClose, 1200);
    } else if (r) {
      setErr(r.error?.message ?? '執行失敗');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-rose-900/60 rounded-2xl shadow-[0_0_40px_rgba(225,29,72,0.25)] p-8 max-w-sm w-full relative">
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
                <h4 className="font-bold text-rose-400 text-base">{info.label}</h4>
                <p className="text-xs text-zinc-500 mt-0.5">{info.desc}</p>
              </div>
            </div>
            <div className="flex gap-2 mb-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`flex-1 h-1 rounded-full transition-all ${i <= step ? 'bg-rose-500' : 'bg-zinc-800'}`} />
              ))}
            </div>
            <p className="text-zinc-300 text-sm mb-6 text-center">{CONFIRM_STEPS[step]}</p>
            {err && <p className="text-rose-400 text-sm mb-3">{err}</p>}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm font-bold border border-zinc-700 min-h-[44px]">取消</button>
              <button
                onClick={handleConfirm}
                disabled={busy}
                className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-bold min-h-[44px]"
              >
                {busy ? '執行中…' : step < 2 ? `確認 (${step + 1}/3)` : '最終確認，執行'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
