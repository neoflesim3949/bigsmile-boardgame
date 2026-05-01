import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { getSetting } from '@/lib/settings';
import { query } from '@/lib/db';
import OnboardingClient from './OnboardingClient';

/**
 * Server-side 進入防護。觸發條件（CLAUDE.md / V2.md / ARCH §6）：
 *   1. session.role === 'player'（middleware 已擋）
 *   2. CardDrawMode === 'true'
 *   3. PlayerStats.destiny_name IS NULL
 * 任一不符 → 一律重導 `/`。
 */
export default async function OnboardingPage() {
  const session = await requireRole('player');

  const cardDrawMode = await getSetting('CardDrawMode');
  if (cardDrawMode !== 'true') redirect('/');

  const r = await query<{ destiny_name: string | null }>(
    `SELECT destiny_name FROM "PlayerStats" WHERE user_id = $1`,
    [session.userId],
  );
  if (r.rows[0]?.destiny_name) redirect('/');

  return <OnboardingClient />;
}
