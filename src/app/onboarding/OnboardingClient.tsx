'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ChevronRight, AlertCircle } from 'lucide-react';
import { drawDestiny, type DestinyDrawResult, type DestinyTheme } from '@/app/actions/player';

// 色系 → Tailwind class palette。
// 為什麼前端寫死：Tailwind JIT 必須能在編譯期看到完整的 class 字串才會生成樣式，
// 所以這層映射不能移到 DB。只做「色系名稱」由後台選，視覺字典由前端維護。
interface ThemePalette {
  gradient: string;          // 卡面文字 / 漸層用
  border: string;
  glow: string;
  tag: string;
  rarityText: string;
}

const THEME_PALETTE: Record<DestinyTheme, ThemePalette> = {
  amber: {
    gradient: 'from-amber-600 to-yellow-400',
    border: 'border-amber-500',
    glow: 'shadow-[0_0_40px_rgba(245,158,11,0.6)]',
    tag: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    rarityText: 'text-amber-400',
  },
  teal: {
    gradient: 'from-teal-600 to-cyan-400',
    border: 'border-teal-500',
    glow: 'shadow-[0_0_40px_rgba(20,184,166,0.6)]',
    tag: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    rarityText: 'text-teal-400',
  },
  purple: {
    gradient: 'from-purple-600 to-indigo-400',
    border: 'border-purple-500',
    glow: 'shadow-[0_0_40px_rgba(168,85,247,0.6)]',
    tag: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    rarityText: 'text-purple-400',
  },
  rose: {
    gradient: 'from-rose-600 to-pink-400',
    border: 'border-rose-500',
    glow: 'shadow-[0_0_40px_rgba(244,63,94,0.6)]',
    tag: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    rarityText: 'text-rose-400',
  },
  sky: {
    gradient: 'from-sky-600 to-blue-400',
    border: 'border-sky-500',
    glow: 'shadow-[0_0_40px_rgba(14,165,233,0.6)]',
    tag: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    rarityText: 'text-sky-400',
  },
  zinc: {
    gradient: 'from-zinc-500 to-zinc-300',
    border: 'border-zinc-400',
    glow: 'shadow-[0_0_40px_rgba(161,161,170,0.6)]',
    tag: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
    rarityText: 'text-zinc-400',
  },
};

// 預先散布的粒子位置（不能在 render 用 Math.random，違反 react-hooks/purity）
const PARTICLES = [
  { left: 14, top: 22, delay: 0.1, duration: 0.9 },
  { left: 78, top: 18, delay: 0.4, duration: 1.1 },
  { left: 32, top: 58, delay: 0.2, duration: 0.7 },
  { left: 65, top: 72, delay: 0.6, duration: 1.0 },
  { left: 22, top: 81, delay: 0.3, duration: 0.8 },
  { left: 88, top: 45, delay: 0.0, duration: 1.2 },
  { left: 50, top: 12, delay: 0.5, duration: 0.9 },
  { left: 12, top: 50, delay: 0.7, duration: 1.0 },
  { left: 70, top: 30, delay: 0.2, duration: 0.7 },
  { left: 40, top: 35, delay: 0.8, duration: 1.1 },
  { left: 85, top: 65, delay: 0.4, duration: 0.8 },
  { left: 55, top: 88, delay: 0.1, duration: 1.0 },
] as const;

type Phase = 'idle' | 'shuffling' | 'revealing' | 'done';

export default function OnboardingClient() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<DestinyDrawResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);


  function handleDraw() {
    if (phase !== 'idle' || pending) return;
    setErrorMsg(null);
    setPhase('shuffling');

    startTransition(async () => {
      // 同時並行：洗牌動畫 + 後端抽卡
      const drawPromise = drawDestiny();
      const minWaitMs = 1500;
      const startedAt = Date.now();

      const res = await drawPromise;
      const elapsed = Date.now() - startedAt;
      if (elapsed < minWaitMs) {
        await new Promise((r) => setTimeout(r, minWaitMs - elapsed));
      }

      if (!res.ok) {
        setErrorMsg(res.error?.message ?? '抽卡失敗，請重試');
        setPhase('idle');
        return;
      }
      setResult(res.data!);
      setPhase('revealing');
      setTimeout(() => setPhase('done'), 800);
    });
  }

  function handleConfirm() {
    router.replace('/');
  }

  const palette = result ? (THEME_PALETTE[result.theme] ?? THEME_PALETTE.zinc) : null;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center relative overflow-hidden px-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.07)_0%,transparent_70%)] pointer-events-none" />

      {phase === 'shuffling' && (
        <div className="absolute inset-0 pointer-events-none">
          {PARTICLES.map((p, i) => (
            <div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-ping"
              style={{
                left: `${p.left}%`,
                top: `${p.top}%`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="text-center mb-10 z-10">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Sparkles className="w-6 h-6 text-amber-400 animate-pulse" />
          <span className="text-sm font-bold text-amber-400 tracking-widest uppercase">命格占卜</span>
          <Sparkles className="w-6 h-6 text-amber-400 animate-pulse" />
        </div>
        <h1 className="text-4xl font-bold text-zinc-100 mb-2">抽取你的命格</h1>
        <p className="text-zinc-500 text-sm max-w-xs mx-auto leading-relaxed">
          命格決定你的初始數值。<br />靜心一念，點擊牌面，開啟你的命運之旅。
        </p>
      </div>

      <div className="relative z-10 mb-10">
        {(phase === 'idle' || phase === 'shuffling') && (
          <div className="relative flex items-center justify-center" style={{ width: 220, height: 320 }}>
            {[3, 2, 1].map((offset) => (
              <div
                key={offset}
                className={`absolute rounded-2xl border border-zinc-700/50 bg-gradient-to-br from-zinc-800 to-zinc-900 transition-all duration-200 ${
                  phase === 'shuffling' ? 'animate-bounce' : ''
                }`}
                style={{
                  width: 200,
                  height: 300,
                  top: -offset * 4,
                  left: offset * 3,
                  animationDelay: `${offset * 0.1}s`,
                }}
              />
            ))}

            <button
              onClick={handleDraw}
              disabled={phase !== 'idle'}
              className={`relative w-[200px] h-[300px] rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-zinc-800 to-zinc-900 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 select-none ${
                phase === 'idle'
                  ? 'hover:border-amber-500 hover:shadow-[0_0_30px_rgba(245,158,11,0.3)] hover:scale-105 active:scale-95'
                  : 'cursor-not-allowed'
              } ${phase === 'shuffling' ? 'animate-pulse scale-105 border-amber-500/70' : ''}`}
            >
              <div className="absolute inset-3 rounded-xl border border-amber-500/20 bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(245,158,11,0.03)_8px,rgba(245,158,11,0.03)_16px)]" />
              <div className="relative z-10 flex flex-col items-center gap-3">
                <div className="text-5xl">🀄</div>
                <span className="text-amber-400/80 font-bold text-sm tracking-widest">
                  {phase === 'shuffling' ? '洗牌中...' : '點擊抽取'}
                </span>
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-amber-500/50 animate-pulse"
                      style={{ animationDelay: `${i * 0.2}s` }}
                    />
                  ))}
                </div>
              </div>
            </button>
          </div>
        )}

        {(phase === 'revealing' || phase === 'done') && result && palette && (
          <div className="relative" style={{ perspective: '1000px', width: 220, height: 320 }}>
            <div
              className="relative w-full h-full transition-all duration-700"
              style={{
                transformStyle: 'preserve-3d',
                transform: phase === 'done' ? 'rotateY(0deg)' : 'rotateY(180deg)',
              }}
            >
              <div
                className={`absolute inset-0 rounded-2xl border-2 ${palette.border} bg-gradient-to-br from-zinc-900 to-zinc-950 flex flex-col items-center justify-between p-6 ${phase === 'done' ? palette.glow : ''} transition-shadow duration-700`}
                style={{ backfaceVisibility: 'hidden' }}
              >
                <div className="text-center">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded border ${palette.tag}`}>
                    {result.rarity_label}
                  </span>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <div className="text-6xl">{result.emoji}</div>
                  <h2 className={`text-2xl font-bold bg-gradient-to-br ${palette.gradient} bg-clip-text text-transparent`}>
                    {result.destiny_name}
                  </h2>
                  <p className="text-xs text-zinc-400 text-center leading-relaxed px-2">{result.description}</p>
                </div>

                <div className="w-full grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between bg-zinc-900/80 rounded-lg px-2 py-1.5">
                    <span className="text-zinc-500">金錢</span>
                    <span className="text-amber-400 font-bold">{result.money.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between bg-zinc-900/80 rounded-lg px-2 py-1.5">
                    <span className="text-zinc-500">健康</span>
                    <span className="text-rose-400 font-bold">{result.health}</span>
                  </div>
                  <div className="flex justify-between bg-zinc-900/80 rounded-lg px-2 py-1.5">
                    <span className="text-zinc-500">福分</span>
                    <span className="text-teal-400 font-bold">{result.blessing}</span>
                  </div>
                  <div className="flex justify-between bg-zinc-900/80 rounded-lg px-2 py-1.5">
                    <span className="text-zinc-500">業力</span>
                    <span className="text-purple-400 font-bold">{result.karma}</span>
                  </div>
                </div>
              </div>

              <div
                className="absolute inset-0 rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              >
                <span className="text-5xl">🀄</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="z-10 mb-4 flex items-start gap-2 text-rose-400 text-sm bg-rose-950/30 border border-rose-900/60 rounded-lg px-4 py-2 max-w-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {phase === 'done' && result && palette && (
        <div className="z-10 text-center animate-fade-in">
          <div className="mb-6">
            <p className="text-zinc-300 text-lg font-semibold mb-1">
              你的命格是 <span className={`bg-gradient-to-r ${palette.gradient} bg-clip-text text-transparent font-bold`}>{result.destiny_name}</span>！
            </p>
            <p className="text-zinc-500 text-sm">命格已決定，願你在這場遊戲中財源廣進。</p>
          </div>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-2 mx-auto bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold px-8 py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.4)] hover:shadow-[0_0_30px_rgba(245,158,11,0.6)] active:scale-95 min-h-[44px]"
          >
            接受命格，開始遊戲
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {phase === 'idle' && (
        <p className="z-10 text-zinc-600 text-xs animate-pulse">輕觸牌面，開啟你的命運</p>
      )}
    </div>
  );
}
