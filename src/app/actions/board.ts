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
  /** 常規模式：每回合 tick 後更新；只給前 10 名 rank + name（保持神祕感） */
  liveLeaderboard: Array<{
    user_id: string;
    name: string;
  }>;
  /** 終局結算後展開（含全部欄位） */
  finalLeaderboard?: Array<{
    user_id: string;
    name: string;
    destiny_name: string | null;
    destiny_theme: string | null;
    karma_band_label: string | null;
    karma_band_theme: string | null;
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

    // 常規即時排行榜（每次 tickRound 後 BoardConfig 變動 → 看板會 fallback poll 拿到新值）
    // 排序規則跟 admin dashboard 相同：money×Wm + blessing×Wb − karma×Wk（JS 端算）
    // 直接讀預存的 final_score（每 tickRound + 改 ScoreWeight 自動重算）；ORDER BY DESC LIMIT 10 一次到位
    const liveRaw = await query<{ user_id: string; name: string }>(
      `SELECT a.user_id, a.name
       FROM "Account" a
       JOIN "PlayerStats" ps ON ps.user_id = a.user_id
       WHERE a.role = 'player' AND a.is_active = true
       ORDER BY ps.final_score DESC
       LIMIT 10`,
    );
    const liveLeaderboard = liveRaw.rows.map(({ user_id, name }) => ({ user_id, name }));

    let finalLeaderboard: BoardData['finalLeaderboard'];
    if (cfg.final_scoring_triggered_at) {
      // 直接讀預存的 final_score（triggerFinalScoring 時已重算鎖定）
      // LATERAL JOIN KarmaBand 取狀態；LEFT JOIN InitialValueTemplate 取命格 theme
      const lbRaw = await query<{
        user_id: string; name: string;
        destiny_name: string | null; destiny_theme: string | null;
        karma_band_label: string | null; karma_band_theme: string | null;
        money: number; blessing: number; health: number; karma: number;
        rebirth_count: number;
        final_score: number;
      }>(
        `SELECT a.user_id, a.name,
                ps.destiny_name, tpl.theme AS destiny_theme,
                kb.label AS karma_band_label, kb.theme AS karma_band_theme,
                ps.money, ps.blessing, ps.health, ps.karma,
                ps.rebirth_count, ps.final_score
         FROM "Account" a
         JOIN "PlayerStats" ps ON ps.user_id = a.user_id
         LEFT JOIN LATERAL (
           SELECT label, theme FROM "KarmaBand"
           WHERE is_active = true
             AND (karma_min IS NULL OR ps.karma >= karma_min)
             AND (karma_max IS NULL OR ps.karma <= karma_max)
           ORDER BY sort_order ASC LIMIT 1
         ) kb ON true
         LEFT JOIN "InitialValueTemplate" tpl ON tpl.label = ps.destiny_name
         WHERE a.role = 'player' AND a.is_active = true
         ORDER BY ps.final_score DESC`,
      );
      finalLeaderboard = lbRaw.rows;
    }

    return ok({
      config: cfg,
      stocks: stocks.rows,
      featured_stock_ids: cfg.featured_stock_ids,
      events: events.rows,
      liveLeaderboard,
      finalLeaderboard,
    });
  } catch (err) {
    return fail(err);
  }
}
