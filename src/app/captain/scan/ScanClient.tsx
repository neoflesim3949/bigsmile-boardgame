'use client';

import Link from 'next/link';
import { useState, useTransition, useEffect } from 'react';
import QrScannerModal from '@/components/QrScannerModal';
import {
  ArrowLeft, QrCode, X, ListChecks, Skull, Sparkles,
  Wallet, Heart, Scale, AlertCircle, CheckCircle2, RefreshCcw,
} from 'lucide-react';
import {
  lookupPlayerByQR,
  lookupPlayerByManualId,
  applyQuickAction,
  rebirthPlayer,
  captainVerifyPlayerQr,
  type CaptainStation,
  type QuickActionRow,
  type ScannedPlayer,
  type PlayerScannedItem,
} from '@/app/actions/captain';
import { Search } from 'lucide-react';

interface Props {
  captainUserId: string;
  stations: CaptainStation[];
  allQuickActions: QuickActionRow[];
}

const IN_PROGRESS_VERSION = 1;
function inProgressStorageKey(captainUserId: string): string {
  return `captain_inprogress_v${IN_PROGRESS_VERSION}_${captainUserId}`;
}

interface InProgressItem {
  key: string;             // unique key
  player: ScannedPlayer;
  quickAction: QuickActionRow;
  stationId: string;
  qrToken: string | null;  // null = 透過手動輸入 ID（不能用於重生）
  addedAt: number;
}

interface ScannedState {
  player: ScannedPlayer;
  items: PlayerScannedItem[];
  qrToken: string | null;
  allowRebirth: boolean;
  /** 'qr' = 透過掃碼；'manual' = 透過手動輸入 ID（重生鍵不會出現） */
  source: 'qr' | 'manual';
}

export default function ScanClient({ captainUserId, stations, allQuickActions }: Props) {
  const [stationId, setStationId] = useState(stations[0]?.id ?? '');
  const station = stations.find((s) => s.id === stationId);
  const stationQuickActions = allQuickActions.filter((qa) => qa.station_id === stationId);

  const [scanOpen, setScanOpen] = useState(false);
  const [scanned, setScanned] = useState<ScannedState | null>(null);
  const [inProgress, setInProgress] = useState<InProgressItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // 載入 localStorage 暫存（避免不小心離開頁面遺失進行列表）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(inProgressStorageKey(captainUserId));
      if (raw) {
        const parsed = JSON.parse(raw) as InProgressItem[];
        if (Array.isArray(parsed)) setInProgress(parsed);
      }
    } catch { /* localStorage 不可用 / 解析失敗 → 從空白開始 */ }
    setHydrated(true);
  }, [captainUserId]);

  // 每次 inProgress 變動寫回 localStorage（hydrated 後才寫，避免初始空陣列覆蓋）
  useEffect(() => {
    if (!hydrated) return;
    try {
      const key = inProgressStorageKey(captainUserId);
      if (inProgress.length === 0) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(inProgress));
      }
    } catch { /* quota exceeded / private mode 等 → 忽略 */ }
  }, [inProgress, captainUserId, hydrated]);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [manualId, setManualId] = useState('');
  const [busy, busyTransition] = useTransition();
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  }

  function handleScannedToken(token: string) {
    setScanOpen(false);
    setScanErr(null);
    if (!stationId) {
      setScanErr('請先選擇關卡');
      return;
    }
    busyTransition(async () => {
      const r = await lookupPlayerByQR(token, stationId);
      if (r.ok) {
        setScanned({
          player: r.data!.player,
          items: r.data!.player_items,
          qrToken: token,
          allowRebirth: r.data!.allow_rebirth,
          source: 'qr',
        });
      } else {
        setScanErr(r.error?.message ?? '無法解析');
      }
    });
  }

  function handleManualLookup() {
    setScanErr(null);
    if (!stationId) {
      setScanErr('請先選擇關卡');
      return;
    }
    if (manualId.trim().length < 6) {
      setScanErr('請輸入完整玩家 ID（≥ 6 碼）');
      return;
    }
    busyTransition(async () => {
      const r = await lookupPlayerByManualId(manualId.trim(), stationId);
      if (r.ok) {
        setScanned({
          player: r.data!.player,
          items: r.data!.player_items,
          qrToken: null,
          // 手動輸入路徑：強制不顯示重生鍵（規格 §4.2 / V2.md §下地獄機制）
          allowRebirth: false,
          source: 'manual',
        });
        setManualId('');
      } else {
        setScanErr(r.error?.message ?? '查無此玩家');
      }
    });
  }

  function handleAddToList(qa: QuickActionRow) {
    if (!scanned) return;
    setInProgress((arr) => [
      ...arr,
      {
        key: `${qa.id}_${scanned.player.user_id}_${Date.now()}`,
        player: scanned.player,
        quickAction: qa,
        stationId,
        qrToken: scanned.qrToken,
        addedAt: Date.now(),
      },
    ]);
    setScanned(null);
    showToast(true, `已加入：${scanned.player.name} → ${qa.label}`);
  }

  function handleRemoveFromList(key: string) {
    setInProgress((arr) => arr.filter((x) => x.key !== key));
  }

  // 結算流程：兩步驗證
  //   1. handleSettle → 開 verify modal（再掃 QR / 輸入 ID 確認玩家在場）
  //   2. verify pass → 開 confirm modal（預覽變動 + 最終確認）
  //   3. confirm → performSettle（呼叫 applyQuickAction）
  const [verifySettle, setVerifySettle] = useState<InProgressItem | null>(null);
  const [confirmSettle, setConfirmSettle] = useState<InProgressItem | null>(null);
  const [verifyManualId, setVerifyManualId] = useState('');
  const [verifyScanOpen, setVerifyScanOpen] = useState(false);
  const [verifyErr, setVerifyErr] = useState<string | null>(null);

  function handleSettle(item: InProgressItem) {
    setVerifyManualId('');
    setVerifyErr(null);
    setVerifySettle(item);
  }

  function handleVerifyManualId() {
    if (!verifySettle) return;
    setVerifyErr(null);
    if (verifyManualId.trim().length < 6) {
      setVerifyErr('請輸入完整 ID（≥ 6 碼）');
      return;
    }
    if (verifyManualId.trim() !== verifySettle.player.user_id) {
      setVerifyErr(`ID 不符（這筆是 ${verifySettle.player.name}）`);
      return;
    }
    // 通過 → 進確認 modal
    setVerifySettle(null);
    setConfirmSettle(verifySettle);
  }

  function handleVerifyQrScanned(token: string) {
    setVerifyScanOpen(false);
    if (!verifySettle) return;
    busyTransition(async () => {
      const r = await captainVerifyPlayerQr(token);
      if (!r.ok) {
        setVerifyErr(r.error?.message ?? 'QR 解碼失敗');
        return;
      }
      if (r.data!.user_id !== verifySettle.player.user_id) {
        setVerifyErr(`掃到不同玩家（${r.data!.name}）。這筆是 ${verifySettle.player.name}`);
        return;
      }
      // 通過 → 進確認 modal
      setVerifySettle(null);
      setConfirmSettle(verifySettle);
    });
  }

  function performSettle(item: InProgressItem) {
    busyTransition(async () => {
      const r = await applyQuickAction({
        quickActionId: item.quickAction.id,
        targetUserId: item.player.user_id,
      });
      if (r.ok) {
        const dm = r.data!;
        const itemMsg = dm.granted_item_id ? '（含發放道具）' : '';
        showToast(true, `${item.player.name}：金錢${fmt(dm.delta_money)} 健康${fmt(dm.delta_health)} 福分${fmt(dm.delta_blessing)} 業力${fmt(dm.delta_karma)}${itemMsg}`);
        setInProgress((arr) => arr.filter((x) => x.key !== item.key));
      } else {
        showToast(false, r.error?.message ?? '結算失敗');
      }
      setConfirmSettle(null);
    });
  }

  function handleRebirth() {
    if (!scanned || !scanned.qrToken) return;
    if (!confirm(`重生玩家「${scanned.player.name}」？\n清空：四項參數歸零、所有持股、銀行借款、所有道具\n此操作不可復原。`)) return;
    busyTransition(async () => {
      const r = await rebirthPlayer({ qrToken: scanned.qrToken!, stationId });
      if (r.ok) {
        showToast(true, `已重生 ${scanned.player.name}（清 ${r.data!.cleared.stocks} 股、${r.data!.cleared.loans} 筆借貸、${r.data!.cleared.items} 個道具）`);
        setScanned(null);
      } else {
        showToast(false, r.error?.message ?? '重生失敗');
      }
    });
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-3 pb-12">
      <header className="flex items-center gap-3 mb-3">
        <Link href="/captain" className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-bold text-zinc-100">關主掃碼</h1>
      </header>

      {/* 關卡選擇 */}
      {stations.length > 1 ? (
        <div className="mb-3">
          <label className="text-xs text-zinc-500">當前關卡</label>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-zinc-200 text-sm"
          >
            {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      ) : station ? (
        <div className="mb-3 bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-center text-zinc-400 text-sm">
          關卡：<span className="text-amber-400 font-bold">{station.name}</span>
          {station.allow_rebirth && <span className="ml-2 text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">具重生鍵</span>}
        </div>
      ) : (
        <div className="mb-3 bg-amber-950/30 border border-amber-900/60 text-amber-300 rounded-lg p-3 text-center text-sm">
          尚未指派關卡
        </div>
      )}

      {/* 進行中列表（常駐頁首）*/}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 mb-3">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm font-bold text-zinc-300 flex items-center gap-2">
            <ListChecks className="w-4 h-4" /> 進行列表（{inProgress.length}）
          </h2>
        </div>
        {inProgress.length === 0 ? (
          <p className="text-xs text-zinc-500 py-3 text-center">掃碼後將玩家加入此列表</p>
        ) : (
          <div className="space-y-2">
            {inProgress.map((item) => (
              <div key={item.key} className="bg-zinc-950 border border-zinc-700 rounded-lg p-2 flex justify-between items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-zinc-100 truncate">{item.player.name}</p>
                  <p className="text-xs text-zinc-500 truncate">{item.quickAction.label}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleSettle(item)}
                    disabled={busy}
                    className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-zinc-950 px-3 py-1.5 rounded-lg text-xs font-bold min-h-[36px]"
                  >
                    完成結算
                  </button>
                  <button onClick={() => handleRemoveFromList(item.key)} className="p-1.5 text-zinc-500 hover:text-rose-400">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 掃碼大按鈕 + 手動 ID 輸入 */}
      {!scanned && (
        <>
          <button
            onClick={() => setScanOpen(true)}
            disabled={!stationId}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 rounded-3xl py-8 flex flex-col items-center gap-2 shadow-[0_0_30px_rgba(245,158,11,0.3)] mb-3"
          >
            <QrCode className="w-14 h-14" />
            <span className="text-xl font-bold">掃描玩家 QR</span>
          </button>

          <div className="relative my-3 flex items-center">
            <div className="flex-1 border-t border-zinc-800"></div>
            <span className="px-3 text-xs text-zinc-500">或</span>
            <div className="flex-1 border-t border-zinc-800"></div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-3">
            <p className="text-xs text-zinc-400 mb-2 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" />
              手動輸入玩家 ID（掃碼失敗時用）
            </p>
            <div className="flex gap-2">
              <input
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleManualLookup();
                }}
                disabled={!stationId || busy}
                placeholder="貼上或輸入玩家 ID（≥ 6 碼）"
                className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 text-sm font-mono disabled:opacity-50"
              />
              <button
                onClick={handleManualLookup}
                disabled={!stationId || busy || manualId.trim().length < 6}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 px-4 rounded-lg text-sm font-bold min-h-[44px]"
              >
                查詢
              </button>
            </div>
            <p className="text-[0.625rem] text-zinc-600 mt-2 leading-relaxed">
              ⚠️ 重生鍵需走 QR 掃碼路徑。手動輸入即使玩家在地獄狀態，也不會出現重生按鈕。
            </p>
          </div>
        </>
      )}

      {scanErr && (
        <div className="bg-rose-950 border border-rose-700 text-rose-300 rounded-lg p-3 text-sm flex items-center gap-2 mb-3">
          <AlertCircle className="w-4 h-4" />
          {scanErr}
        </div>
      )}

      {/* 掃描結果（玩家卡片 + 快捷模組列表） */}
      {scanned && (
        <section className="bg-zinc-900 border border-amber-500/40 rounded-2xl p-3 mb-3">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-xs text-zinc-500 flex items-center gap-1">
                {scanned.source === 'qr' ? (
                  <><QrCode className="w-3 h-3" /> QR 掃碼</>
                ) : (
                  <><Search className="w-3 h-3" /> 手動輸入</>
                )}
              </p>
              <h3 className="text-lg font-bold text-amber-400">{scanned.player.name}</h3>
              <p className="text-xs text-zinc-500 font-mono">{scanned.player.user_id}</p>
              {scanned.player.destiny_name && <p className="text-xs text-zinc-500">命格：{scanned.player.destiny_name}</p>}
            </div>
            <button onClick={() => setScanned(null)} className="text-zinc-500 hover:text-zinc-200">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 玩家狀態（不顯示持股，依 spec）*/}
          <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
            <Stat icon={<Wallet className="w-3 h-3 text-amber-500" />} label="金錢" value={scanned.player.money.toLocaleString()} />
            <Stat icon={<Heart className="w-3 h-3 text-rose-500" />} label="健康" value={`${scanned.player.health}/100`} />
            <Stat icon={<Sparkles className="w-3 h-3 text-teal-400" />} label="福分" value={scanned.player.blessing.toString()} />
            <Stat icon={<Scale className="w-3 h-3 text-purple-400" />} label="業力" value={scanned.player.karma.toString()} />
          </div>

          {/* 玩家道具（給關主判斷 req_item_id 是否符合）*/}
          <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-2 mb-3">
            <p className="text-[0.6875rem] text-zinc-500 mb-1.5 flex items-center gap-1">
              🎒 持有道具（{scanned.items.length}）
            </p>
            {scanned.items.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-1">無</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {scanned.items.map((it) => (
                  <span
                    key={it.item_id + it.granted_at}
                    title={it.description}
                    className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200"
                  >
                    <span>{it.icon}</span>
                    <span>{it.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 死亡狀態 → 重生鍵 */}
          {scanned.player.is_dead ? (
            <div className="bg-rose-950/40 border border-rose-900/60 rounded-lg p-3 text-center">
              <Skull className="w-8 h-8 text-rose-500 mx-auto mb-2" />
              <p className="text-rose-400 font-bold mb-2">玩家處於地獄狀態</p>
              <p className="text-xs text-zinc-400 mb-3">
                {scanned.source === 'manual'
                  ? '⚠️ 手動輸入路徑無法重生。請改請玩家拿出 QR 給你掃描，重生鍵才會出現。'
                  : scanned.allowRebirth
                    ? '此關卡具備重生鍵權限，可執行重生。'
                    : '此關卡無重生鍵，請帶玩家到具備重生鍵的關卡。'}
              </p>
              {scanned.allowRebirth && scanned.source === 'qr' && (
                <button
                  onClick={handleRebirth}
                  disabled={busy}
                  className="bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-zinc-950 px-4 py-2 rounded-lg text-sm font-bold min-h-[44px] flex items-center gap-2 mx-auto"
                >
                  <Sparkles className="w-4 h-4" />
                  {busy ? '處理中…' : '🔄 執行重生'}
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="text-xs text-zinc-500 mb-2">選擇要套用的快捷模組（加入進行列表後可繼續掃下一位）</p>
              <div className="space-y-2">
                {stationQuickActions.length === 0 && (
                  <p className="text-xs text-zinc-500 py-3 text-center">此關卡尚無你建立的快捷模組</p>
                )}
                {stationQuickActions.map((qa) => (
                  <button
                    key={qa.id}
                    onClick={() => handleAddToList(qa)}
                    className="w-full text-left bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 rounded-lg p-3 transition-colors"
                  >
                    <p className="font-bold text-zinc-100">{qa.label}</p>
                    <div className="flex gap-1.5 flex-wrap text-xs mt-1">
                      {qa.delta_money !== 0 && <span className="text-amber-400">${fmt(qa.delta_money)}</span>}
                      {qa.delta_health !== 0 && <span className="text-rose-400">❤️{fmt(qa.delta_health)}</span>}
                      {qa.delta_blessing !== 0 && <span className="text-teal-400">✨{fmt(qa.delta_blessing)}</span>}
                      {qa.delta_karma !== 0 && <span className="text-purple-400">⚖{fmt(qa.delta_karma)}</span>}
                      {qa.bound_item_name && <span className="text-zinc-300">🎁 {qa.bound_item_name}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {scanOpen && (
        <QrScannerModal
          title="掃描玩家 QR"
          hint="把玩家手機畫面對準框內"
          onClose={() => setScanOpen(false)}
          onScanned={handleScannedToken}
        />
      )}

      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 ${toast.ok ? 'bg-zinc-900 border-amber-500/40 text-amber-300' : 'bg-rose-950 border-rose-700 text-rose-300'} border px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-40 text-xs max-w-[90vw] text-center`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Verify modal — 完成結算前再驗證玩家身份 */}
      {verifySettle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4"
          onClick={() => setVerifySettle(null)}
        >
          <div
            className="bg-zinc-900 border border-amber-500/40 rounded-2xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <QrCode className="w-6 h-6 text-amber-400 shrink-0" />
              <div>
                <h4 className="font-bold text-zinc-100 text-base">確認玩家身份</h4>
                <p className="text-xs text-zinc-500 mt-0.5">完成結算前再驗證一次玩家還在現場</p>
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-700 rounded-lg p-3 mb-4">
              <p className="text-xs text-zinc-500">這筆要結算給：</p>
              <p className="text-amber-400 font-bold text-base">{verifySettle.player.name}</p>
              <p className="text-zinc-500 font-mono text-xs">{verifySettle.player.user_id}</p>
              <p className="text-zinc-300 text-sm mt-1">
                模組：<span className="text-zinc-100 font-bold">{verifySettle.quickAction.label}</span>
              </p>
            </div>

            <button
              onClick={() => setVerifyScanOpen(true)}
              disabled={busy}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 py-3 rounded-lg font-bold text-sm min-h-[44px] flex items-center justify-center gap-2 mb-3"
            >
              <QrCode className="w-4 h-4" /> 掃描玩家 QR
            </button>

            <div className="relative my-3 flex items-center">
              <div className="flex-1 border-t border-zinc-800"></div>
              <span className="px-3 text-xs text-zinc-500">或</span>
              <div className="flex-1 border-t border-zinc-800"></div>
            </div>

            <div className="flex gap-2 mb-2">
              <input
                value={verifyManualId}
                onChange={(e) => setVerifyManualId(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyManualId(); }}
                disabled={busy}
                placeholder="輸入玩家 ID（≥ 6 碼）"
                className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 text-sm font-mono"
              />
              <button
                onClick={handleVerifyManualId}
                disabled={busy || verifyManualId.trim().length < 6}
                className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-100 px-3 rounded-lg text-sm font-bold min-h-[44px]"
              >
                確認
              </button>
            </div>

            {verifyErr && (
              <div className="bg-rose-950/40 border border-rose-700 text-rose-300 rounded-lg p-2 text-xs flex items-start gap-2 mb-3">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{verifyErr}</span>
              </div>
            )}

            <button
              onClick={() => setVerifySettle(null)}
              disabled={busy}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm font-bold border border-zinc-700 disabled:opacity-50 min-h-[44px]"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Verify QR scanner（嵌套在 verify modal 流程內） */}
      {verifyScanOpen && (
        <QrScannerModal
          title="掃描玩家 QR 確認身份"
          hint="把要結算的玩家 QR 對準框內"
          onClose={() => setVerifyScanOpen(false)}
          onScanned={handleVerifyQrScanned}
        />
      )}

      {confirmSettle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4"
          onClick={() => setConfirmSettle(null)}
        >
          <div
            className="bg-zinc-900 border border-amber-500/40 rounded-2xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle2 className="w-6 h-6 text-amber-400 shrink-0" />
              <h4 className="font-bold text-zinc-100 text-base">確認結算？</h4>
            </div>
            <p className="text-sm text-zinc-300 mb-3">
              對 <span className="font-bold text-amber-400">{confirmSettle.player.name}</span> 套用快捷模組
              <span className="font-bold text-zinc-100 mx-1">「{confirmSettle.quickAction.label}」</span>
            </p>
            <div className="bg-zinc-950 border border-zinc-700 rounded-lg p-3 mb-4 space-y-1 text-xs">
              {confirmSettle.quickAction.delta_money !== 0 && (
                <div className="flex justify-between"><span className="text-zinc-500">金錢</span><span className="text-amber-400 font-mono">{fmt(confirmSettle.quickAction.delta_money)}</span></div>
              )}
              {confirmSettle.quickAction.delta_health !== 0 && (
                <div className="flex justify-between"><span className="text-zinc-500">健康</span><span className="text-rose-400 font-mono">{fmt(confirmSettle.quickAction.delta_health)}</span></div>
              )}
              {confirmSettle.quickAction.delta_blessing !== 0 && (
                <div className="flex justify-between"><span className="text-zinc-500">福分</span><span className="text-teal-400 font-mono">{fmt(confirmSettle.quickAction.delta_blessing)}</span></div>
              )}
              {confirmSettle.quickAction.delta_karma !== 0 && (
                <div className="flex justify-between"><span className="text-zinc-500">業力</span><span className="text-purple-400 font-mono">{fmt(confirmSettle.quickAction.delta_karma)}</span></div>
              )}
              {confirmSettle.quickAction.bound_item_name && (
                <div className="flex justify-between"><span className="text-zinc-500">發放道具</span><span className="text-zinc-200">🎁 {confirmSettle.quickAction.bound_item_name}</span></div>
              )}
            </div>
            <p className="text-[0.6875rem] text-zinc-500 mb-4 text-center">
              ⚠️ 確認後立即生效，無法復原
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmSettle(null)}
                disabled={busy}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2.5 rounded-lg text-sm font-bold border border-zinc-700 disabled:opacity-50 min-h-[44px]"
              >
                取消
              </button>
              <button
                onClick={() => performSettle(confirmSettle)}
                disabled={busy}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 py-2.5 rounded-lg text-sm font-bold min-h-[44px]"
              >
                {busy ? '處理中…' : '確認結算'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function fmt(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-zinc-950 rounded-lg p-2 flex items-center justify-between">
      <span className="flex items-center gap-1 text-zinc-500">{icon}{label}</span>
      <span className="font-bold text-zinc-100">{value}</span>
    </div>
  );
}

