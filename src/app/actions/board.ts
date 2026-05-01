'use server';

import { ActionError, fail, ok, type ActionResult } from '@/lib/error';
import { query } from '@/lib/db';
import { verifyQrToken } from '@/lib/qr';

/** 看板需要的全部資料（依 display token 驗證） */
export interface BoardData {
  config: {
    title: string;
    color_scheme: 'red_up' | 'green_up';
    event_rotate_seconds: number;
    marquee_text: string;
    marquee_until: string | null;
    final_scoring_triggered_at: string | null;
    current_round: number;
    last_tick_at: string | null;
  };
  stocks: Array<{
    id: string;
    code: string;
    name: string;
    current_price: number;
    is_visible: boolean;
    history: Array<{ recorded_at: string; price: number }>;
  }>;
  featured_stock_ids: string[];
  events: Array<{
    id: string;
    text: string;
    priority: number;
  }>;
  finalLeaderboard?: Array<{
    user_id: string;
    name: string;
    money: number;
    blessing: number;
    health: number;
    karma: number;
    rebirth_count: number;
    final_score: number;
  }>;
}

/**
 * 看板取資料：依 display token 驗證 + 取資料。
 * 採嵌套 SELECT 一次拿到所有表（避免 N+1）。
 */
export async function getBoardData(token: string): Promise<ActionResult<BoardData>> {
  try {
    if (!token) throw new ActionError('UNAUTHENTICATED', '缺少 token');
    const decoded = verifyQrToken(token, 'display');
    if (!decoded) throw new ActionError('UNAUTHENTICATED', 'token 無效或已過期');

    // 比對 DB（看是否撤銷）
    const tokenRow = await query<{ revoked_at: string | null; expires_at: string }>(
      `SELECT revoked_at, expires_at FROM "DisplayToken" WHERE jti = $1`,
      [decoded.sub],
    );
    if (tokenRow.rows.length === 0) throw new ActionError('UNAUTHENTICATED', 'token 不存在');
    if (tokenRow.rows[0].revoked_at) throw new ActionError('UNAUTHENTICATED', 'token 已撤銷');

    const board = await query<{
      title: string;
      featured_stock_ids: string[];
      color_scheme: 'red_up' | 'green_up';
      event_rotate_seconds: number;
      marquee_text: string;
      marquee_until: string | null;
      final_scoring_triggered_at: string | null;
      current_round: number;
      last_tick_at: string | null;
    }>(
      `SELECT title, featured_stock_ids, color_scheme, event_rotate_seconds,
              marquee_text, marquee_until, final_scoring_triggered_at,
              current_round, last_tick_at
       FROM "BoardConfig" WHERE id = 1`,
    );
    if (board.rows.length === 0) throw new ActionError('NOT_FOUND', '看板設定缺失');
    const cfg = board.rows[0];

    // 一次撈所有股票 + 最近 60 筆歷史（用 jsonb_agg 嵌套，無 N+1）
    const stocks = await query<{
      id: string;
      code: string;
      name: string;
      current_price: number;
      is_visible: boolean;
      history: Array<{ recorded_at: string; price: number }>;
    }>(
      `SELECT s.id, s.code, s.name, s.current_price, s.is_visible,
              COALESCE(
                (SELECT jsonb_agg(jsonb_build_object('recorded_at', sh.recorded_at, 'price', sh.price)
                                  ORDER BY sh.recorded_at ASC)
                 FROM (SELECT recorded_at, price
                       FROM "StockHistory"
                       WHERE stock_id = s.id
                       ORDER BY recorded_at DESC
                       LIMIT 60) sh),
                '[]'::jsonb
              ) AS history
       FROM "Stock" s
       ORDER BY s.code ASC`,
    );

    const events = await query<{ id: string; text: string; priority: number }>(
      `SELECT id, text, priority
       FROM "Event"
       WHERE is_active = true
         AND (start_at IS NULL OR start_at <= now())
         AND (end_at IS NULL OR end_at > now())
       ORDER BY priority DESC, created_at DESC
       LIMIT 30`,
    );

    let finalLeaderboard: BoardData['finalLeaderboard'];
    if (cfg.final_scoring_triggered_at) {
      const settings = await query<{ key: string; value: string }>(
        `SELECT key, value FROM "AppSettings"
         WHERE key IN ('ScoreWeightMoney', 'ScoreWeightBlessing', 'ScoreWeightKarma')`,
      );
      const sm = new Map(settings.rows.map((r) => [r.key, r.value] as const));
      const wM = Number(sm.get('ScoreWeightMoney') ?? '0.05');
      const wB = Number(sm.get('ScoreWeightBlessing') ?? '200');
      const wK = Number(sm.get('ScoreWeightKarma') ?? '150');
      const lb = await query<NonNullable<BoardData['finalLeaderboard']>[number]>(
        `SELECT a.user_id, a.name,
                ps.money, ps.blessing, ps.health, ps.karma, ps.rebirth_count,
                ROUND(ps.money * $1 + ps.blessing * $2 - ps.karma * $3)::int AS final_score
         FROM "Account" a
         JOIN "PlayerStats" ps ON ps.user_id = a.user_id
         WHERE a.role = 'player' AND a.is_active = true
         ORDER BY final_score DESC NULLS LAST
         LIMIT 100`,
        [wM, wB, wK],
      );
      finalLeaderboard = lb.rows;
    }

    return ok({
      config: cfg,
      stocks: stocks.rows,
      featured_stock_ids: cfg.featured_stock_ids,
      events: events.rows,
      finalLeaderboard,
    });
  } catch (err) {
    return fail(err);
  }
}
