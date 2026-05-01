import { requireRole } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { query } from '@/lib/db';
import SettingsClient from './SettingsClient';
import type { TemplateRow } from '@/app/actions/admin';

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
    'BankLoanCapacityRatio',
    'BankInterestIntervalMinutes',
    'BankInterestBlessingAmount',
    'EventStartAt',
    'EventEndAt',
    'BoardGameEnabled',
    'CardDrawMode',
    'TourMode',
  ]);

  const tplResult = await query<TemplateRow>(
    `SELECT id, label, emoji, description, theme, rarity_label,
            money, health, blessing, karma, is_active
     FROM "InitialValueTemplate"
     ORDER BY created_at ASC`,
  );

  return <SettingsClient initialSettings={settings} initialTemplates={tplResult.rows} />;
}
