'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sun, Moon, Type, Check } from 'lucide-react';

type FontSize = 'sm' | 'md' | 'lg' | 'xl';
type Theme = 'dark' | 'light';

const FONT_OPTIONS: { key: FontSize; label: string; size: string }[] = [
  { key: 'sm', label: '小', size: 'text-sm' },
  { key: 'md', label: '標準', size: 'text-base' },
  { key: 'lg', label: '大', size: 'text-lg' },
  { key: 'xl', label: '特大', size: 'text-xl' },
];

const FONT_SIZE_MAP: Record<FontSize, string> = {
  sm: '14px',
  md: '16px',
  lg: '18px',
  xl: '21px',
};

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'light') {
    document.documentElement.classList.add('bg-white');
    document.documentElement.classList.remove('bg-zinc-950');
  } else {
    document.documentElement.classList.remove('bg-white');
  }
}

function applyFontSize(size: FontSize) {
  document.documentElement.setAttribute('data-font-size', size);
  document.documentElement.style.fontSize = FONT_SIZE_MAP[size];
}

export default function SettingsPage() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [fontSize, setFontSize] = useState<FontSize>('md');

  // Load from localStorage on mount
  useEffect(() => {
    const savedTheme = (localStorage.getItem('pref_theme') as Theme) || 'dark';
    const savedFont = (localStorage.getItem('pref_font_size') as FontSize) || 'md';
    setTheme(savedTheme);
    setFontSize(savedFont);
    applyTheme(savedTheme);
    applyFontSize(savedFont);
  }, []);

  const handleTheme = (t: Theme) => {
    setTheme(t);
    localStorage.setItem('pref_theme', t);
    applyTheme(t);
  };

  const handleFontSize = (f: FontSize) => {
    setFontSize(f);
    localStorage.setItem('pref_font_size', f);
    applyFontSize(f);
  };

  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen p-4 pb-20 ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'}`}>
      {/* Header */}
      <header className="flex items-center gap-3 mb-8 mt-2">
        <Link
          href="/"
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors border ${
            isDark
              ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-amber-400 hover:border-amber-500/50'
              : 'bg-white border-zinc-200 text-zinc-500 hover:text-amber-600 hover:border-amber-400/50'
          }`}
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">個人設定</h1>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>外觀偏好，僅儲存於本裝置</p>
        </div>
      </header>

      <div className="max-w-md mx-auto space-y-6">

        {/* 顯示模式 */}
        <section className={`rounded-2xl p-5 border ${isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-zinc-200 shadow-sm'}`}>
          <h2 className={`text-sm font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            <Type className="w-4 h-4" /> 顯示模式
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {/* 深色 */}
            <button
              onClick={() => handleTheme('dark')}
              className={`relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                theme === 'dark'
                  ? 'border-amber-500 bg-amber-500/10'
                  : isDark ? 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600' : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300'
              }`}
            >
              {theme === 'dark' && (
                <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-zinc-950" />
                </span>
              )}
              <div className="w-14 h-10 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center">
                <Moon className="w-5 h-5 text-zinc-300" />
              </div>
              <span className="text-sm font-bold">深色</span>
              <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>預設</span>
            </button>

            {/* 淺色 */}
            <button
              onClick={() => handleTheme('light')}
              className={`relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                theme === 'light'
                  ? 'border-amber-500 bg-amber-500/10'
                  : isDark ? 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600' : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300'
              }`}
            >
              {theme === 'light' && (
                <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-zinc-950" />
                </span>
              )}
              <div className="w-14 h-10 rounded-lg bg-white border border-zinc-200 flex items-center justify-center shadow-sm">
                <Sun className="w-5 h-5 text-amber-500" />
              </div>
              <span className="text-sm font-bold">淺色</span>
              <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>&nbsp;</span>
            </button>
          </div>
        </section>

        {/* 字體大小 */}
        <section className={`rounded-2xl p-5 border ${isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-zinc-200 shadow-sm'}`}>
          <h2 className={`text-sm font-bold mb-1 flex items-center gap-2 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            <Type className="w-4 h-4" /> 字體大小
          </h2>
          <p className={`text-xs mb-4 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>立即套用，影響所有前台頁面文字大小。</p>

          <div className="grid grid-cols-4 gap-2">
            {FONT_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => handleFontSize(opt.key)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${
                  fontSize === opt.key
                    ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                    : isDark
                    ? 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-zinc-300'
                }`}
              >
                <span className={`font-bold leading-none ${opt.size}`}>A</span>
                <span className="text-xs">{opt.label}</span>
                {fontSize === opt.key && <Check className="w-3 h-3 text-amber-400" />}
              </button>
            ))}
          </div>

          {/* Preview */}
          <div className={`mt-4 p-3 rounded-lg border ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-100 border-zinc-200'}`}>
            <p className={`text-xs mb-1 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>預覽效果</p>
            <p className={`font-medium leading-relaxed ${isDark ? 'text-zinc-200' : 'text-zinc-700'}`}>
              開運大富翁｜金錢 12,500｜健康 80
            </p>
          </div>
        </section>

        {/* 說明 */}
        <p className={`text-xs text-center leading-relaxed ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
          以上設定僅儲存在本裝置，清除瀏覽器資料後將恢復預設值。
        </p>
      </div>
    </div>
  );
}
