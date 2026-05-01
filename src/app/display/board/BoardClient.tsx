'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, Minus, Trophy } from 'lucide-react';
import { getBoardData, type BoardData } from '@/app/actions/board';

interface Props {
  initial: BoardData;
  token: string;
}

const POLL_MS = 60_000; // fallback polling，realtime 推漏時救援

export default function BoardClient({ initial, token }: Props) {
  const [data, setData] = useState<BoardData>(initial);
  const [now, setNow] = useState(Date.now());
  const [eventIdx, setEventIdx] = useState(0);

  // 強制深色 root（per CLAUDE.md §6.2）— 把 data attribute 設上，避免被全域偏好覆蓋
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
    return () => {
      document.documentElement.removeAttribute('data-theme');
    };
  }, []);

  // 60 秒 fallback polling
  useEffect(() => {
    const id = setInterval(async () => {
      const r = await getBoardData(token);
      if (r.ok) setData(r.data!);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [token]);

  // 時鐘
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 事件輪播
  useEffect(() => {
    if (data.events.length === 0) return;
    const interval = Math.max(1, data.config.event_rotate_seconds) * 1000;
    const id = setInterval(() => {
      setEventIdx((i) => (i + 1) % data.events.length);
    }, interval);
    return () => clearInterval(id);
  }, [data.events.length, data.config.event_rotate_seconds]);

  // 跑馬燈是否還在生效時間
  const marqueeActive = !!(
    data.config.marquee_text &&
    (!data.config.marquee_until || new Date(data.config.marquee_until).getTime() > now)
  );

  const featured = data.stocks.filter((s) => data.featured_stock_ids.includes(s.id));
  const others = data.stocks.filter((s) => !data.featured_stock_ids.includes(s.id) && s.is_visible);

  // 終局結算畫面
  if (data.config.final_scoring_triggered_at && data.finalLeaderboard) {
    return <FinalLeaderboard board={data} />;
  }

  // 漲跌色（依 color_scheme）
  const upClass = data.config.color_scheme === 'red_up' ? 'text-rose-400' : 'text-emerald-400';
  const downClass = data.config.color_scheme === 'red_up' ? 'text-emerald-400' : 'text-rose-400';

  return (
    <div className="fixed inset-0 bg-zinc-950 text-zinc-100 overflow-hidden pointer-events-none select-none">
      {/* 標題 + 回合 + 時間 */}
      <header className="px-12 pt-8 flex items-end justify-between">
        <h1 className="text-6xl font-bold tracking-wider bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent">
          {data.config.title}
        </h1>
        <div className="text-right">
          <p className="text-3xl text-amber-400 font-bold">第 {data.config.current_round} 回合</p>
          <p className="text-xl text-zinc-500 mt-1 font-mono">{new Date(now).toLocaleTimeString()}</p>
        </div>
      </header>

      {/* 主要區：左 重點曲線（最多 4 檔大圖） + 右 全部行情列表 */}
      <div className="grid grid-cols-2 gap-8 px-12 mt-6 h-[820px]">
        <section className="space-y-4">
          <h2 className="text-3xl font-bold text-zinc-300 mb-2">📈 重點商品</h2>
          <div className={`grid gap-4 ${featured.length <= 2 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {featured.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center text-zinc-600 col-span-2">
                未設定重點商品
              </div>
            ) : (
              featured.map((s) => (
                <FeaturedStockCard key={s.id} stock={s} upClass={upClass} downClass={downClass} />
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="text-3xl font-bold text-zinc-300 mb-4">📊 全部行情</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800 overflow-hidden">
            {others.length === 0 && featured.length === 0 ? (
              <div className="p-12 text-center text-zinc-600">尚未建立股票</div>
            ) : (
              [...featured, ...others].map((s) => (
                <StockListRow key={s.id} stock={s} upClass={upClass} downClass={downClass} />
              ))
            )}
          </div>
        </section>
      </div>

      {/* 事件區 */}
      {data.events.length > 0 && (
        <div className="absolute bottom-20 left-12 right-12 bg-zinc-900/80 border border-amber-500/20 rounded-2xl p-6 flex items-center gap-4 backdrop-blur-md">
          <div className="text-amber-400 text-2xl font-bold">📢 活動</div>
          <p className="text-3xl text-zinc-100 flex-1">{data.events[eventIdx]?.text}</p>
          <div className="text-zinc-500 text-sm font-mono">
            {eventIdx + 1} / {data.events.length}
          </div>
        </div>
      )}

      {/* 跑馬燈 */}
      {marqueeActive && (
        <div className="absolute bottom-0 left-0 right-0 bg-amber-500/95 text-zinc-950 py-3 overflow-hidden">
          <div className="whitespace-nowrap font-bold text-3xl animate-marquee">
            ⚡ {data.config.marquee_text} ⚡ {data.config.marquee_text}
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </div>
  );
}

function FeaturedStockCard({
  stock, upClass, downClass,
}: {
  stock: BoardData['stocks'][number];
  upClass: string;
  downClass: string;
}) {
  const old = stock.history.length > 0 ? stock.history[0].price : stock.current_price;
  const diff = stock.current_price - old;
  const trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const cls = trend === 'up' ? upClass : trend === 'down' ? downClass : 'text-zinc-400';
  const Arrow = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden">
      <div className="flex justify-between items-baseline mb-2">
        <div>
          <span className="font-mono text-amber-300 text-lg">{stock.code}</span>
          <h3 className="text-2xl font-bold text-zinc-100">{stock.name}</h3>
        </div>
        <div className={`flex items-center gap-1 ${cls}`}>
          <Arrow className="w-6 h-6" />
          <span className="font-mono font-bold text-4xl">{stock.current_price.toLocaleString()}</span>
        </div>
      </div>
      <Sparkline points={stock.history} trend={trend} upClass={upClass} downClass={downClass} />
    </div>
  );
}

function StockListRow({
  stock, upClass, downClass,
}: {
  stock: BoardData['stocks'][number];
  upClass: string;
  downClass: string;
}) {
  const old = stock.history.length > 0 ? stock.history[0].price : stock.current_price;
  const diff = stock.current_price - old;
  const trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const cls = trend === 'up' ? upClass : trend === 'down' ? downClass : 'text-zinc-400';
  const Arrow = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus;
  const pctRaw = old > 0 ? ((diff / old) * 100) : 0;

  return (
    <div className="grid grid-cols-[3fr_2fr_2fr_2fr] gap-4 px-6 py-4 items-center">
      <div>
        <span className="font-mono text-amber-300 text-sm">{stock.code}</span>
        <h4 className="text-2xl font-bold text-zinc-100">{stock.name}</h4>
      </div>
      <div className="text-right">
        <span className="font-mono text-3xl font-bold text-zinc-100">{stock.current_price.toLocaleString()}</span>
      </div>
      <div className={`flex items-center justify-end gap-1 ${cls}`}>
        <Arrow className="w-5 h-5" />
        <span className="font-mono text-2xl">{diff >= 0 ? '+' : ''}{diff}</span>
      </div>
      <div className={`text-right font-mono text-xl ${cls}`}>
        {pctRaw >= 0 ? '+' : ''}{pctRaw.toFixed(1)}%
      </div>
    </div>
  );
}

/** Canvas sparkline（per CLAUDE.md §6.2 — 用 canvas 不用 SVG） */
function Sparkline({
  points, trend, upClass, downClass,
}: {
  points: BoardData['stocks'][number]['history'];
  trend: 'up' | 'down' | 'flat';
  upClass: string;
  downClass: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    if (points.length < 2) {
      ctx.fillStyle = '#3f3f46';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('歷史資料不足', w / 2, h / 2);
      return;
    }

    const prices = points.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const padX = 10;
    const padY = 16;

    // 漸層
    const colorMap: Record<string, string> = {
      'text-rose-400': '#fb7185',
      'text-emerald-400': '#34d399',
      'text-zinc-400': '#a1a1aa',
    };
    const lineColor = colorMap[trend === 'up' ? upClass : trend === 'down' ? downClass : 'text-zinc-400'] ?? '#a1a1aa';

    const xs = (i: number) => padX + (i / (points.length - 1)) * (w - padX * 2);
    const ys = (p: number) => h - padY - ((p - min) / range) * (h - padY * 2);

    // 填充
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, lineColor + '60');
    gradient.addColorStop(1, lineColor + '00');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(xs(0), h);
    points.forEach((p, i) => ctx.lineTo(xs(i), ys(p.price)));
    ctx.lineTo(xs(points.length - 1), h);
    ctx.closePath();
    ctx.fill();

    // 線
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(xs(i), ys(p.price));
      else ctx.lineTo(xs(i), ys(p.price));
    });
    ctx.stroke();

    // 終點點
    const last = points[points.length - 1];
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.arc(xs(points.length - 1), ys(last.price), 4, 0, Math.PI * 2);
    ctx.fill();
  }, [points, trend, upClass, downClass]);

  return <canvas ref={ref} className="w-full h-32" />;
}

function FinalLeaderboard({ board }: { board: BoardData }) {
  const lb = board.finalLeaderboard ?? [];

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-amber-950 via-zinc-950 to-zinc-950 text-zinc-100 overflow-hidden pointer-events-none">
      <header className="text-center pt-12">
        <Trophy className="w-24 h-24 text-amber-400 mx-auto mb-4" />
        <h1 className="text-7xl font-bold bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent mb-2">
          最終排行榜
        </h1>
        <p className="text-2xl text-zinc-400">{board.config.title}</p>
      </header>

      <div className="px-24 mt-12 grid grid-cols-3 gap-8">
        {lb.slice(0, 3).map((row, i) => (
          <div
            key={row.user_id}
            className={`text-center p-8 rounded-3xl border-2 ${
              i === 0 ? 'border-amber-400 bg-amber-500/10 transform scale-110'
              : i === 1 ? 'border-zinc-300 bg-zinc-300/10'
              : 'border-amber-700 bg-amber-700/10'
            }`}
          >
            <div className="text-6xl mb-2">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</div>
            <p className="text-3xl font-bold">{row.name}</p>
            <p className="text-amber-300 text-5xl font-bold mt-3">{row.final_score?.toLocaleString()}</p>
            <p className="text-zinc-500 text-sm mt-2">分</p>
          </div>
        ))}
      </div>

      <div className="px-24 mt-10 max-h-[480px] overflow-hidden">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
          <div className="grid grid-cols-[60px_2fr_1fr_1fr_1fr_1fr_60px] gap-3 text-zinc-500 text-sm border-b border-zinc-800 pb-2 mb-2">
            <div>名次</div>
            <div>玩家</div>
            <div className="text-right">分數</div>
            <div className="text-right">金錢</div>
            <div className="text-right">福分</div>
            <div className="text-right">業力</div>
            <div className="text-right">重生</div>
          </div>
          {lb.slice(3, 13).map((row, i) => (
            <div
              key={row.user_id}
              className="grid grid-cols-[60px_2fr_1fr_1fr_1fr_1fr_60px] gap-3 py-2 text-xl text-zinc-200"
            >
              <div className="font-bold text-amber-400">#{i + 4}</div>
              <div className="truncate">{row.name}</div>
              <div className="text-right font-mono text-amber-300">{row.final_score?.toLocaleString()}</div>
              <div className="text-right text-amber-400">{row.money?.toLocaleString()}</div>
              <div className="text-right text-teal-400">{row.blessing}</div>
              <div className="text-right text-purple-400">{row.karma}</div>
              <div className="text-right text-zinc-500 text-sm">×{row.rebirth_count}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
