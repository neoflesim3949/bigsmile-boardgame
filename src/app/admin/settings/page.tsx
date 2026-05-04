import { requireRole } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { query } from '@/lib/db';
import SettingsClient from './SettingsClient';
import type { TemplateRow, KarmaBandRow } from '@/app/actions/admin';

export default async function SettingsPage() {
  await requireRole('admin');

  const settings = await getSettings([
    'ShowAllStats',
    'ScoreWeightMoney',
    'ScoreWeightBlessing',
    'ScoreWeightKarma',
    'InitialMoney',
    'InitialHealth',
    'InitialBlessing',
    'InitialKarma',
    'RebirthMoney',
    'RebirthHealth',
    'RebirthBlessing',
    'RebirthKarma',
    'ExchangeRate',
    'ManualRefreshCooldownSeconds',
    'StockSellBlessingPenaltyDivisor',
    'BankLoanCapacityRatio',
    'BankInterestIntervalMinutes',
    'BankInterestBlessingAmount',
    'EventStartAt',
    'EventEndAt',
    'BoardGameEnabled',
    'CardDrawMode',
    'TourMode',
  ]);

  const [tplResult, kbResult] = await Promise.all([
    query<TemplateRow>(
      `SELECT id, label, emoji, description, theme, rarity_label,
              money, health, blessing, karma, is_active, draw_ratio
       FROM "InitialValueTemplate"
       ORDER BY created_at ASC`,
    ),
    query<KarmaBandRow>(
      `SELECT id, label, karma_min, karma_max,
              money_delta, health_delta, blessing_delta, karma_delta,
              theme, sort_order, is_active
       FROM "KarmaBand"
       ORDER BY sort_order ASC, created_at ASC`,
    ),
  ]);

  return (
    <SettingsClient
      initialSettings={settings}
      initialTemplates={tplResult.rows}
      initialKarmaBands={kbResult.rows}
    />
  );
}
