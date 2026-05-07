'use client';

import { useEffect, useRef, useState } from 'react';
import { X, AlertCircle, QrCode, Upload } from 'lucide-react';

interface Props {
  onClose: () => void;
  onScanned: (text: string) => void;
  /** 標題（預設「掃描 QR Code」） */
  title?: string;
  /** 框內提示文字 */
  hint?: string;
}

interface Html5QrcodeLike {
  start: (
    cam: { facingMode: 'environment' | 'user' } | string,
    cfg: { fps: number; qrbox: number },
    onDecode: (text: string) => void,
    onErrorIgnore: (e: unknown) => void,
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
  scanFile: (file: File, showImage?: boolean) => Promise<string>;
}

/**
 * 共用 QR 掃碼 Modal
 *
 * 防崩重點：
 * - useEffect 空 deps（不依賴 onScanned，用 ref 拿最新 callback）→ 不會因 parent re-render 反覆重啟 camera
 * - stoppedRef 確保 scanner.stop() 只被叫一次（之前 race 在 iOS WebKit 會把整個 process 帶崩）
 * - 啟動失敗 → 顯示具體錯誤 + 提供「上傳圖片」fallback（適用 in-app 瀏覽器、相機被佔等情境）
 */
export default function QrScannerModal({ onClose, onScanned, title = '掃描 QR Code', hint = '把 QR 對準框內' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onScannedRef = useRef(onScanned);
  onScannedRef.current = onScanned;

  const scannerRef = useRef<Html5QrcodeLike | null>(null);
  const stoppedRef = useRef(false);

  const [err, setErr] = useState<string | null>(null);
  const [stage, setStage] = useState<'init' | 'running' | 'failed'>('init');
  const [fileBusy, setFileBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let elemId = '';

    (async () => {
      try {
        // 預檢相機 API
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          setErr('此瀏覽器不支援相機 API（如 LINE 內建瀏覽器）。請點下面「改上傳照片」，或在 Safari/Chrome 開啟此頁。');
          setStage('failed');
          return;
        }

        const mod = await import('html5-qrcode');
        if (cancelled) return;
        const Html5Qrcode = (mod as unknown as { Html5Qrcode: new (id: string) => Html5QrcodeLike }).Html5Qrcode;

        if (!containerRef.current) return;
        elemId = `qr-target-${Math.random().toString(36).slice(2, 10)}`;
        const div = document.createElement('div');
        div.id = elemId;
        div.style.width = '100%';
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(div);

        const scanner = new Html5Qrcode(elemId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 250 },
          (decoded) => {
            // 一律單一 stop 入口：標記已停，本 callback 不直接呼叫 stop
            // 等 parent 收到 onScanned → 關 modal → 元件 unmount → cleanup 統一 stop
            if (stoppedRef.current) return;
            stoppedRef.current = true;
            onScannedRef.current(decoded);
          },
          () => { /* per-frame decode error，忽略 */ },
        );

        // 若元件在 start() 期間被 unmount，要主動清理
        if (cancelled) {
          stoppedRef.current = true;
          await scanner.stop().catch(() => {});
          scanner.clear();
          return;
        }
        setStage('running');
      } catch (e: unknown) {
        if (cancelled) return;
        const raw = e instanceof Error ? e.message : String(e);
        setErr(humanizeCameraError(raw));
        setStage('failed');
      }
    })();

    return () => {
      cancelled = true;
      // 唯一的 stop 入口
      if (scannerRef.current && !stoppedRef.current) {
        stoppedRef.current = true;
        const s = scannerRef.current;
        s.stop().catch(() => {}).finally(() => { try { s.clear(); } catch { /* noop */ } });
      } else if (scannerRef.current && stoppedRef.current) {
        // 已被 success callback 標記為停 → 這裡才真正停
        const s = scannerRef.current;
        s.stop().catch(() => {}).finally(() => { try { s.clear(); } catch { /* noop */ } });
      }
    };
  }, []);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileBusy(true);
    setErr(null);
    let tempDiv: HTMLDivElement | null = null;
    try {
      const mod = await import('html5-qrcode');
      const Html5Qrcode = (mod as unknown as { Html5Qrcode: new (id: string) => Html5QrcodeLike }).Html5Qrcode;
      const elemId = `qr-file-${Math.random().toString(36).slice(2, 10)}`;
      tempDiv = document.createElement('div');
      tempDiv.id = elemId;
      tempDiv.style.display = 'none';
      document.body.appendChild(tempDiv);
      const scanner = new Html5Qrcode(elemId);
      const decoded = await scanner.scanFile(file, false);
      try { scanner.clear(); } catch { /* noop */ }
      if (!stoppedRef.current) {
        stoppedRef.current = true;
        onScannedRef.current(decoded);
      }
    } catch (er: unknown) {
      const raw = er instanceof Error ? er.message : '解碼失敗';
      setErr(`解碼失敗：${raw}（請確認照片清楚、QR 完整）`);
    } finally {
      setFileBusy(false);
      if (tempDiv && tempDiv.parentNode) tempDiv.parentNode.removeChild(tempDiv);
      e.target.value = '';
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/95 p-4 flex flex-col items-center justify-center" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 max-w-md w-full relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 z-10">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-lg font-bold text-zinc-100 mb-3 text-center flex items-center justify-center gap-2">
          <QrCode className="w-5 h-5" /> {title}
        </h3>

        <div
          ref={containerRef}
          className={`bg-black rounded-lg overflow-hidden min-h-[280px] ${stage === 'failed' ? 'opacity-30' : ''}`}
        />

        {err && (
          <div className="mt-3 bg-rose-950 border border-rose-700 text-rose-300 rounded-lg p-3 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="leading-relaxed">{err}</span>
          </div>
        )}

        <p className="text-xs text-zinc-500 text-center mt-3">{hint}</p>

        <label className={`mt-3 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-lg py-2 cursor-pointer text-sm min-h-[44px] ${fileBusy ? 'opacity-60 pointer-events-none' : ''}`}>
          <Upload className="w-4 h-4" />
          {fileBusy ? '解碼中…' : '無法掃描？改上傳照片'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileUpload}
            disabled={fileBusy}
          />
        </label>
      </div>
    </div>
  );
}

function humanizeCameraError(msg: string): string {
  if (/permission|allowed|notallowed|denied/i.test(msg)) return '請允許相機權限後再重試。若已拒絕：iOS 設定 → Safari → 相機 → 改為「詢問」或「允許」。';
  if (/notfound|no camera/i.test(msg)) return '找不到相機。請確認裝置有相機並未被停用。';
  if (/notreadable|busy|in use/i.test(msg)) return '相機被其他 app 佔用，請關閉其他相機 app 後再試。';
  if (/secure|https/i.test(msg)) return '此頁需要 HTTPS 才能使用相機（目前環境不安全）。';
  if (/unsupported|getUserMedia/i.test(msg)) return '此瀏覽器不支援相機，請改用「上傳照片」或在 Safari / Chrome 開啟。';
  return `${msg}。可改用下方「上傳照片」。`;
}
