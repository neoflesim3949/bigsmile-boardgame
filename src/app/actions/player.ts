'use server';

import { ActionError, fail, ok, type ActionResult } from '@/lib/error';
import { withTx } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { getSetting, getSettings } from '@/lib/settings';

export type DestinyTheme = 'amber' | 'teal' | 'purple' | 'rose' | 'sky' | 'zinc';

export interface DestinyDrawResult {
  destiny_name: string;
  emoji: string;
  description: string;
  theme: DestinyTheme;
  rarity_label: string;
  money: number;
  health: number;
  blessing: number;
  karma: number;
}

/**
 * 命格抽卡。觸發條件由 page.tsx + middleware 守門：
 *   CardDrawMode === 'true' AND destiny_name IS NULL
 * 此 action 內部仍二次驗證，避免 client 繞過。
 */
export async function drawDestiny(): Promise<ActionResult<DestinyDrawResult>> {
  try {
    const session = await requireRole('player');

    const cardDrawMode = await getSetting('CardDrawMode');
    if (cardDrawMode !== 'true') {
      throw new ActionError('FORBIDDEN', '抽卡模式未啟用');
    }

    const result = await withTx(async (client) => {
      // 確保未抽過（idempotency）
      const existing = await client.query<{ destiny_name: string | null }>(
        `SELECT destiny_name FROM "PlayerStats" WHERE user_id = $1 FOR UPDATE`,
        [session.userId],
      );
      const row = existing.rows[0];
      if (row && row.destiny_name) {
        throw new ActionError('CONFLICT', '您已抽過命格，無需再抽');
      }

      // 抽範本（含視覺欄位 — emoji / theme / 描述都由後台 CRUD 設定）
      const templates = await client.query<{
        label: string;
        emoji: string;
        description: string;
        theme: DestinyTheme;
        rarity_label: string;
        money: number;
        health: number;
        blessing: number;
        karma: number;
      }>(
        `SELECT label, emoji, description, theme, rarity_label,
                money, health, blessing, karma
         FROM "InitialValueTemplate"
         WHERE is_active = true`,
      );

      let chosen: {
        label: string; emoji: string; description: string;
        theme: DestinyTheme; rarity_label: string;
        money: number; health: number; blessing: number; karma: number;
      };

      if (templates.rows.length > 0) {
        const idx = Math.floor(Math.random() * templates.rows.length);
        chosen = templates.rows[idx];
      } else {
        // 防呆：無範本時 fallback AppSettings + 預設視覺
        const fallback = await getSettings([
          'InitialMoney',
          'InitialHealth',
          'InitialBlessing',
          'InitialKarma',
        ]);
        chosen = {
          label: '預設命格',
          emoji: '🀄',
          description: '無命格範本，套用系統預設值。',
          theme: 'zinc',
          rarity_label: '普通',
          money: Number(fallback.InitialMoney) || 0,
          health: Number(fallback.InitialHealth) || 0,
          blessing: Number(fallback.InitialBlessing) || 0,
          karma: Number(fallback.InitialKarma) || 0,
        };
      }

      // upsert PlayerStats（idempotency：WHERE destiny_name IS NULL）
      const upd = await client.query<{
        destiny_name: string;
        money: number; health: number; blessing: number; karma: number;
      }>(
        `INSERT INTO "PlayerStats"
           (user_id, destiny_name, money, health, blessing, karma)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO UPDATE SET
           destiny_name = EXCLUDED.destiny_name,
           money        = EXCLUDED.money,
           health       = EXCLUDED.health,
           blessing     = EXCLUDED.blessing,
           karma        = EXCLUDED.karma,
           updated_at   = now()
         WHERE "PlayerStats".destiny_name IS NULL
         RETURNING destiny_name, money, health, blessing, karma`,
        [
          session.userId,
          chosen.label,
          chosen.money,
          Math.min(chosen.health, 100),
          chosen.blessing,
          chosen.karma,
        ],
      );

      if (upd.rows.length === 0) {
        throw new ActionError('CONFLICT', '命格抽取失敗，請重新整理');
      }

      await client.query(
        `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
         VALUES ($1, $1, 'destiny_draw', $2)`,
        [
          session.userId,
          JSON.stringify({
            destiny_name: chosen.label,
            money: chosen.money,
            health: chosen.health,
            blessing: chosen.blessing,
            karma: chosen.karma,
          }),
        ],
      );

      return {
        destiny_name: upd.rows[0].destiny_name,
        emoji: chosen.emoji,
        description: chosen.description,
        theme: chosen.theme,
        rarity_label: chosen.rarity_label,
        money: upd.rows[0].money,
        health: upd.rows[0].health,
        blessing: upd.rows[0].blessing,
        karma: upd.rows[0].karma,
      };
    });

    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

/**
 * 玩家進入頁面時呼叫，回傳是否需要被導向 onboarding。
 * 用於 page.tsx 開頭即時判斷（middleware 不打 DB，故由 server component 補檢查）。
 */
export interface OnboardingCheck {
  shouldOnboard: boolean;
  destiny_name: string | null;
}

export async function checkOnboardingStatus(): Promise<ActionResult<OnboardingCheck>> {
  try {
    const session = await requireRole('player');
    const cardDrawMode = await getSetting('CardDrawMode');

    const r = await (async () => {
      const { query } = await import('@/lib/db');
      return query<{ destiny_name: string | null }>(
        `SELECT destiny_name FROM "PlayerStats" WHERE user_id = $1`,
        [session.userId],
      );
    })();

    const destiny = r.rows[0]?.destiny_name ?? null;
    const shouldOnboard = cardDrawMode === 'true' && destiny === null;
    return ok({ shouldOnboard, destiny_name: destiny });
  } catch (err) {
    return fail(err);
  }
}
