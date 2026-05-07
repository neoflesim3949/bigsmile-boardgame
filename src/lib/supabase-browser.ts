'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client（**僅供 Realtime 訂閱用**，不做 PostgREST 讀寫）。
 *
 * 設計：
 * - 用 `NEXT_PUBLIC_*` env（公開 anon key）— 與 server-side `pg` pool 完全分離
 * - 看板透過 `BoardConfig` postgres_changes Realtime 推 → 收到信號後呼叫 `getBoardData()`
 *   server action 拉新快照（不直接 SELECT，避免 RLS / table-grant 麻煩）
 * - lazy singleton：第一次 `getSupabaseBrowser()` 才初始化
 *
 * 為什麼分一個 browser client（不重用 server pg pool）：
 * - pg 走 server-side、SECRETS 不能帶到 browser
 * - Realtime 走 WebSocket、必須 browser 自己連
 *
 * Quota：Supabase free tier WS 上限 ~200；本系統最多 3 台看板（CLAUDE.md §1）綽綽有餘
 */

let _client: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing — Realtime cannot start',
    );
  }
  _client = createClient(url, anonKey, {
    auth: { persistSession: false }, // 看板無 user session，純 anon Realtime
    realtime: {
      params: { eventsPerSecond: 10 }, // 推進回合 / 跑馬燈頻率上限保守設
    },
  });
  return _client;
}
