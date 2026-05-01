'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 強制鎖深色 + 預設字級的路由前綴。
 * 這些頁面有自己的視覺需求（後台高密度資訊、看板大屏遠距），
 * 不應跟著玩家端 ShowAllStats / 字級偏好飄移。
 */
const FORCE_DARK_PREFIXES = ['/admin', '/display'];

/**
 * ThemeProvider — 在 client 端讀取 localStorage 偏好並套用到 <html>。
 * - 玩家端路由：跟隨 `pref_theme` + `pref_font_size`
 * - `/admin/*` 與 `/display/*`：**強制深色 + md 字級**，忽略偏好
 * - 路由變動時自動重新套用（next/navigation 的 usePathname）
 * 預設值：dark + md
 */
export default function ThemeProvider() {
  const pathname = usePathname();

  useEffect(() => {
    const forceDark = FORCE_DARK_PREFIXES.some((p) => pathname?.startsWith(p));

    const theme    = forceDark ? 'dark' : (localStorage.getItem('pref_theme')     || 'dark');
    const fontSize = forceDark ? 'md'   : (localStorage.getItem('pref_font_size') || 'md');

    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-font-size', fontSize);

    const fontSizeMap: Record<string, string> = {
      sm: '14px', md: '16px', lg: '18px', xl: '21px',
    };
    document.documentElement.style.fontSize = fontSizeMap[fontSize] ?? '16px';
  }, [pathname]);

  return null;
}
