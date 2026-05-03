'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Megaphone, CalendarDays, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { getBoardData, type BoardData } from '@/app/actions/board';

interface Props {
  initial: BoardData;
  token: string;
}

const POLL_MS = 60_000;

export default function BoardClient({ initial, token }: Props) {
  const [data, setData] = useState<BoardData>(initial);
  const [now, setNow] = useState(Date.now());
  const [eventIdx, setEventIdx] = useState(0);
  // null = 跟著 server 狀態（final_scoring_triggered_at）
  // true / false = user 主動 toggle 鎖定的顯示狀態
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  /** 終局榜單表頭排序欄位（排名固定不可選；預設 final_score 由大到小） */
  const [sortKey, setSortKey] = useState<'final_score' | 'money' | 'blessing' | 'health' | 'karma' | 'rebirth_count'>('final_score');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  function toggleSort(k: typeof sortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(k); setSortDir('desc'); }
  }

  // 強制深色 root（CLAUDE.md §6.2）
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

  const marqueeActive = !!(
    data.config.marquee_text &&
    (!data.config.marquee_until || new Date(data.config.marquee_until).getTime() > now)
  );

  // user 主動 toggle 後鎖定該選擇；無 override 時跟 server 狀態
  const serverIsFinal = !!data.config.final_scoring_triggered_at;
  const isFinal = userOverride !== null ? userOverride : serverIsFinal;
  const upClass = data.config.color_scheme === 'red_up' ? 'text-rose-400' : 'text-emerald-400';
  const downClass = data.config.color_scheme === 'red_up' ? 'text-emerald-400' : 'text-rose-400';

  const featured = data.stocks.filter((s) => data.featured_stock_ids.includes(s.id)).slice(0, 6);
  const visibleAll = data.stocks.filter((s) => s.is_visible);
  // 終局榜單：先依 final_score 由大到小綁固定 rank（V2.md §8 名次固定原則）
  // 之後不論點哪一欄排序，玩家身上的 rank 數字都不會變
  const lbFinalRanked = (data.finalLeaderboard ?? [])
    .slice()
    .sort((a, b) => b.final_score - a.final_score)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  // 依使用者選擇的欄位重排顯示順序（rank 欄位本身不可選）
  const lbFinalSorted = lbFinalRanked.slice().sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    return sortDir === 'desc' ? bv - av : av - bv;
  });
  const lbLive = data.liveLeaderboard ?? [];

  const dt = new Date(now);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const timeStr = `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  const dateStr = `${pad(dt.getMonth() + 1)}/${pad(dt.getDate())}`;
  const currentEvent = data.events[eventIdx];

  return (
    <div className="h-screen w-full bg-zinc-950 overflow-hidden flex flex-col text-zinc-100 font-sans cursor-default selection:bg-transparent">
      <header className="h-[10vh] flex items-center justify-between px-12 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.2)]">
            <span className="text-3xl">✨</span>
          </div>
          <h1 className="text-4xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500">
            {data.config.title}
          </h1>
        </div>
        <div className="flex items-center gap-8">
          <div className="px-4 py-2 rounded-xl bg-amber-500/20 text-amber-500 font-bold border border-amber-500/50 text-xl shadow-[0_0_15px_rgba(245,158,11,0.2)]">
            第 {data.config.current_round} 回合
          </div>
          <div className="flex items-center gap-3 text-2xl font-mono text-zinc-300">
            <CalendarDays className="w-8 h-8 text-amber-500" />
            {timeStr} | {dateStr}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 border border-zinc-800">
              <div className="w-4 h-4 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
              <span className="text-lg font-medium text-zinc-300">已連線</span>
            </div>
            <button
              onClick={() => setUserOverride(!isFinal)}
              className={`px-4 py-2 rounded-full font-bold border transition-colors shadow-lg ${
                isFinal
                  ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
              }`}
            >
              {isFinal ? '返回常規模式' : '🏆 展開最終榜單'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex px-8 py-8 gap-6 h-[75vh] pointer-events-none">
        {!isFinal && (
          <div className="w-[54%] glass-panel rounded-3xl p-6 flex flex-col border border-zinc-800 transition-all duration-500">
            <h2 className="text-2xl font-bold text-zinc-400 pl-4 border-l-4 border-amber-500 mb-4 uppercase tracking-widest">
              重點趨勢
            </h2>
            {featured.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-zinc-600">
                未設定重點商品
              </div>
            ) : (
              <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-3">
                {featured.map((s) => (
                  <FeaturedCard
                    key={s.id}
                    stock={s}
                    upClass={upClass}
                    downClass={downClass}
                    colorScheme={data.config.color_scheme}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {!isFinal && (
          <div className="flex-1 glass-panel rounded-3xl p-6 flex flex-col border border-zinc-800 transition-all duration-500">
            <h2 className="text-2xl font-bold text-zinc-400 pl-4 border-l-4 border-amber-500 mb-4 uppercase tracking-widest">
              行情總表
            </h2>
            <div className="flex-1 overflow-hidden">
              <table className="w-full text-left text-xl">
                <thead>
                  <tr className="text-zinc-500 border-b-2 border-zinc-800">
                    <th className="pb-4 font-normal w-20">代碼</th>
                    <th className="pb-4 font-normal">名稱</th>
                    <th className="pb-4 text-right font-normal">價格</th>
                    <th className="pb-4 text-right pr-4 font-normal">漲跌</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-200">
                  {visibleAll.length === 0 ? (
                    <tr><td colSpan={4} className="py-12 text-center text-zinc-600">尚無公開上架的商品</td></tr>
                  ) : (
                    visibleAll.map((s) => {
                      const old = s.history.length > 0 ? s.history[0].price : s.current_price;
                      const diff = s.current_price - old;
                      const pct = old > 0 ? (diff / old) * 100 : 0;
                      const up = diff > 0;
                      const flat = diff === 0;
                      const cls = flat ? 'text-zinc-400' : up ? upClass : downClass;
                      return (
                        <tr key={s.id} className="border-b border-zinc-800/60">
                          <td className="py-4 font-bold text-zinc-400 w-20">{s.code}</td>
                          <td className="py-4 font-medium">{s.name}</td>
                          <td className="py-4 text-right font-black text-amber-400">{s.current_price.toLocaleString()}</td>
                          <td className={`py-4 text-right pr-2 font-bold ${cls}`}>
                            <span className="inline-flex items-center gap-1 justify-end">
                              {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                              {flat ? <span className="w-5 h-5 inline-block" /> : up ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className={`${isFinal ? 'w-full' : 'w-[14%]'} glass-panel rounded-3xl ${isFinal ? 'p-8' : 'p-4'} flex flex-col border border-zinc-800 relative overflow-hidden shadow-[0_0_30px_rgba(245,158,11,0.05)] transition-all duration-500`}>
          {isFinal && <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500"></div>}
          <h2 className={`font-bold text-zinc-400 pl-4 border-l-4 border-amber-500 ${isFinal ? 'mb-6 text-4xl py-2' : 'mb-4 text-2xl'} uppercase tracking-widest flex justify-between items-end`}>
            <span className="text-zinc-100">🏆 風雲榜</span>
            {isFinal && <span className="text-xl font-normal text-zinc-500 normal-case tracking-normal">
              {data.config.final_scoring_triggered_at ? '最終結算成績' : '即時概況'}
            </span>}
          </h2>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <table className="w-full text-left text-xl">
              {/* regular mode 14% 窄欄不需要表頭（圓圈+名字已自明），避免 sticky header 視覺脫節 */}
              {isFinal && (
                <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur-sm z-20 shadow-md">
                  <tr className="text-zinc-500 border-b-2 border-zinc-800">
                    <th className="pb-4 font-normal text-center w-20">排名</th>
                    <th className="pb-4 font-normal pl-4">姓名</th>
                    <SortTh title="金錢" color="amber" sortKey="money" active={sortKey === 'money'} dir={sortDir} onClick={toggleSort} />
                    <SortTh title="福份" color="teal" sortKey="blessing" active={sortKey === 'blessing'} dir={sortDir} onClick={toggleSort} />
                    <SortTh title="健康" color="rose" sortKey="health" active={sortKey === 'health'} dir={sortDir} onClick={toggleSort} />
                    <SortTh title="業力" color="purple" sortKey="karma" active={sortKey === 'karma'} dir={sortDir} onClick={toggleSort} />
                    <SortTh title="重生次數" color="zinc" sortKey="rebirth_count" active={sortKey === 'rebirth_count'} dir={sortDir} onClick={toggleSort} />
                    <SortTh title="最終分數" color="white" emphasized sortKey="final_score" active={sortKey === 'final_score'} dir={sortDir} onClick={toggleSort} />
                  </tr>
                </thead>
              )}
              <tbody className="text-zinc-200">
                {(isFinal ? lbFinalSorted.length : lbLive.length) === 0 ? (
                  <tr>
                    <td colSpan={isFinal ? 8 : 2} className="py-12 text-center text-zinc-600">尚無玩家資料</td>
                  </tr>
                ) : isFinal ? (
                  lbFinalSorted.map((r) => {
                    // rank 永遠跟著 final_score（V2.md §8 名次固定原則）
                    const rank = r.rank;
                    return (
                      <tr key={r.user_id} className="border-b border-zinc-800/60">
                        <td className="py-4 text-center w-20">
                          {rank <= 3 ? (
                            <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full font-black text-xl shadow-lg ${
                              rank === 1 ? 'bg-yellow-400 text-yellow-900 shadow-yellow-400/20'
                                : rank === 2 ? 'bg-zinc-300 text-zinc-800'
                                : 'bg-amber-600 text-amber-100'
                            }`}>
                              {rank}
                            </span>
                          ) : (
                            <span className="font-bold text-zinc-500 text-2xl">{rank}</span>
                          )}
                        </td>
                        <td className={`py-4 pl-4 font-bold text-2xl tracking-wide ${rank <= 3 ? 'text-zinc-100' : 'text-zinc-400'}`}>
                          {r.name}
                        </td>
                        <td className="py-4 text-right font-bold text-amber-400">{r.money?.toLocaleString() ?? 0}</td>
                        <td className="py-4 text-right text-teal-400 font-medium">{r.blessing ?? 0}</td>
                        <td className="py-4 text-right text-rose-400 font-medium">{r.health ?? 0}</td>
                        <td className="py-4 text-right text-purple-400 font-medium">{r.karma ?? 0}</td>
                        <td className="py-4 text-right text-zinc-400">{r.rebirth_count ?? 0}</td>
                        <td className="py-4 pr-4 text-right font-black text-white text-3xl">
                          {r.final_score?.toLocaleString() ?? 0}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  lbLive.map((r, i) => {
                    const rank = i + 1;
                    return (
                      <tr key={r.user_id} className="border-b border-zinc-800/60">
                        <td className="py-3 text-center w-12">
                          {rank <= 3 ? (
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-black text-base shadow-lg ${
                              rank === 1 ? 'bg-yellow-400 text-yellow-900 shadow-yellow-400/20'
                                : rank === 2 ? 'bg-zinc-300 text-zinc-800'
                                : 'bg-amber-600 text-amber-100'
                            }`}>
                              {rank}
                            </span>
                          ) : (
                            <span className="font-bold text-zinc-500 text-lg">{rank}</span>
                          )}
                        </td>
                        <td className={`py-3 pl-2 font-bold text-lg tracking-wide truncate ${rank <= 3 ? 'text-zinc-100' : 'text-zinc-400'}`}>
                          {r.name}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <footer className="h-[15vh] shrink-0 flex flex-col bg-zinc-900/80 border-t border-zinc-800">
        <div className="h-1/2 flex items-center px-8 border-b border-zinc-800/50 bg-amber-500/5">
          <div className="flex items-center gap-4 bg-amber-500 text-zinc-950 px-6 py-2 rounded-xl font-bold text-xl mr-8 shrink-0">
            <Megaphone className="w-6 h-6" /> 大會事件
          </div>
          <div className="text-3xl font-bold text-amber-400 tracking-wide truncate">
            {currentEvent?.text ?? '目前無生效中的事件'}
          </div>
        </div>

        <div className="h-1/2 flex items-center px-8 overflow-hidden relative">
          <div className="flex items-center gap-3 bg-zinc-800 text-zinc-300 px-6 py-2 rounded-xl font-bold text-xl mr-8 shrink-0 z-10 border border-zinc-700">
            跑馬燈公告
          </div>
          <div className="text-2xl font-medium text-zinc-300 w-full flex-1 relative flex items-center whitespace-nowrap overflow-hidden">
            {marqueeActive ? (
              <span className="inline-block animate-marquee">
                {data.config.marquee_text} ⚡ {data.config.marquee_text} ⚡
              </span>
            ) : (
              <span className="text-zinc-600">— 暫無跑馬燈 —</span>
            )}
          </div>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
          padding-left: 100%;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { scrollbar-width: none; }
      `}</style>
    </div>
  );
}

type FinalSortKey = 'final_score' | 'money' | 'blessing' | 'health' | 'karma' | 'rebirth_count';

function SortTh({
  title, color, emphasized = false, sortKey, active, dir, onClick,
}: {
  title: string;
  color: string;
  emphasized?: boolean;
  sortKey: FinalSortKey;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: (k: FinalSortKey) => void;
}) {
  const map: Record<string, string> = {
    amber: 'hover:text-amber-500',
    teal: 'hover:text-teal-500',
    rose: 'hover:text-rose-500',
    purple: 'hover:text-purple-500',
    zinc: 'hover:text-zinc-300',
    white: 'hover:text-white',
  };
  const Indicator = active ? (dir === 'desc' ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <th
      onClick={() => onClick(sortKey)}
      className={`pb-3 text-right ${map[color] ?? ''} group transition-colors cursor-pointer pointer-events-auto select-none ${
        active ? 'text-amber-300' : (emphasized ? 'text-amber-500' : '')
      }`}
    >
      <div className={`flex items-center justify-end gap-1 ${emphasized ? 'font-bold' : ''}`}>
        {title}
        <Indicator className={`w-4 h-4 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
      </div>
    </th>
  );
}

function FeaturedCard({
  stock, upClass, downClass, colorScheme,
}: {
  stock: BoardData['stocks'][number];
  upClass: string;
  downClass: string;
  colorScheme: 'red_up' | 'green_up';
}) {
  const old = stock.history.length > 0 ? stock.history[0].price : stock.current_price;
  const diff = stock.current_price - old;
  const pct = old > 0 ? (diff / old) * 100 : 0;
  const up = diff > 0;
  const flat = diff === 0;
  const cls = flat ? 'text-zinc-400' : up ? upClass : downClass;
  const Arrow = flat ? null : up ? ArrowUpRight : ArrowDownRight;
  const lineColorHex = flat
    ? '#a1a1aa'
    : up
      ? (colorScheme === 'red_up' ? '#fb7185' : '#10b981')
      : (colorScheme === 'red_up' ? '#10b981' : '#fb7185');
  const gradientFrom = flat
    ? 'from-zinc-500/5'
    : up
      ? (colorScheme === 'red_up' ? 'from-rose-500/5' : 'from-emerald-500/5')
      : (colorScheme === 'red_up' ? 'from-emerald-500/5' : 'from-rose-500/5');

  return (
    <div className="bg-zinc-900/60 rounded-2xl p-3 relative overflow-hidden border border-zinc-800 min-h-0">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradientFrom} to-transparent`}></div>
      <div className="relative z-10 flex justify-between items-start mb-1.5 gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-zinc-100 truncate">
            <span className="font-mono text-amber-300 text-xs mr-1">{stock.code}</span>
            {stock.name}
          </h3>
          <p className={`${cls} font-bold text-sm flex items-center gap-1 mt-0.5`}>
            {Arrow ? <Arrow className="w-4 h-4" /> : <span className="w-4 h-4 inline-block" />}
            {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
          </p>
        </div>
        <p className="text-2xl font-black text-amber-500 shrink-0">{stock.current_price.toLocaleString()}</p>
      </div>
      <Sparkline points={stock.history} color={lineColorHex} />
    </div>
  );
}

function Sparkline({ points, color }: { points: BoardData['stocks'][number]['history']; color: string }) {
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
    const padX = 8;
    const padY = 12;

    const xs = (i: number) => padX + (i / (points.length - 1)) * (w - padX * 2);
    const ys = (p: number) => h - padY - ((p - min) / range) * (h - padY * 2);

    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, color + '40');
    gradient.addColorStop(1, color + '00');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(xs(0), h);
    points.forEach((p, i) => ctx.lineTo(xs(i), ys(p.price)));
    ctx.lineTo(xs(points.length - 1), h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(xs(i), ys(p.price));
      else ctx.lineTo(xs(i), ys(p.price));
    });
    ctx.stroke();
  }, [points, color]);

  return <canvas ref={ref} className="w-full h-40 absolute bottom-0 left-0 right-0 opacity-80" />;
}
