import { query } from './db';

/**
 * AppSettings 唯一存取入口。新 key 在這裡新增 type 與預設值。
 * 讀取走 getSetting；寫入走 setSetting（自動寫入 Transaction 稽核）。
 */

export type AppSettingsKey =
  | 'BoardGameEnabled'
  | 'CardDrawMode'
  | 'TourMode'
  | 'EventStartAt'
  | 'EventEndAt'
  | 'ExchangeRate'
  | 'TransferFeeRate'
  | 'ScoreWeightMoney'
  | 'ScoreWeightBlessing'
  | 'ScoreWeightKarma'
  | 'InitialMoney'
  | 'InitialHealth'
  | 'InitialBlessing'
  | 'InitialKarma'
  | 'RebirthMoney'
  | 'RebirthHealth'
  | 'RebirthBlessing'
  | 'RebirthKarma'
  | 'ShowAllStats'
  | 'BankLoanCapacityRatio'
  | 'BankInterestIntervalMinutes'
  | 'BankInterestBlessingAmount'
  | 'QRTokenTTL'
  | 'ManualRefreshCooldownSeconds'
  | 'BoardRefreshInterval'
  | 'BoardMarqueeMaxMinutes'
  | 'RoundIntervalMinutes'
  | 'StockPriceRule';

export const DEFAULT_SETTINGS: Record<AppSettingsKey, string> = {
  BoardGameEnabled: 'false',
  CardDrawMode: 'false',
  TourMode: 'false',
  EventStartAt: '',
  EventEndAt: '',
  ExchangeRate: '10',
  TransferFeeRate: '0',
  ScoreWeightMoney: '0.05',
  ScoreWeightBlessing: '200',
  ScoreWeightKarma: '150',
  InitialMoney: '1000',
  InitialHealth: '80',
  InitialBlessing: '10',
  InitialKarma: '0',
  RebirthMoney: '500',
  RebirthHealth: '50',
  RebirthBlessing: '5',
  RebirthKarma: '0',
  ShowAllStats: 'true',
  BankLoanCapacityRatio: '10',
  BankInterestIntervalMinutes: '10',
  BankInterestBlessingAmount: '1',
  QRTokenTTL: '300',
  ManualRefreshCooldownSeconds: '60',
  BoardRefreshInterval: '60',
  BoardMarqueeMaxMinutes: '120',
  RoundIntervalMinutes: '10',
  StockPriceRule: '{}',
};

export async function getSetting(key: AppSettingsKey): Promise<string> {
  const result = await query<{ value: string }>(`SELECT value FROM "AppSettings" WHERE key = $1`, [
    key,
  ]);
  return result.rows[0]?.value ?? DEFAULT_SETTINGS[key];
}

export async function getSettings<K extends AppSettingsKey>(
  keys: K[],
): Promise<Record<K, string>> {
  if (keys.length === 0) return {} as Record<K, string>;
  const result = await query<{ key: K; value: string }>(
    `SELECT key, value FROM "AppSettings" WHERE key = ANY($1)`,
    [keys],
  );
  const map = new Map(result.rows.map((r) => [r.key, r.value] as const));
  const out = {} as Record<K, string>;
  for (const k of keys) out[k] = map.get(k) ?? DEFAULT_SETTINGS[k];
  return out;
}

export async function setSetting(
  key: AppSettingsKey,
  value: string,
  actorUserId: string | null,
): Promise<void> {
  // 寫入 + 稽核（auditing 寫入 Transaction，user_id 用 actor 自己當 placeholder）。
  await query(
    `INSERT INTO "AppSettings" (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()`,
    [key, value, actorUserId],
  );
  if (actorUserId) {
    await query(
      `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
       VALUES ($1, $1, 'settings_update', $2)`,
      [actorUserId, JSON.stringify({ key, value })],
    );
  }
}
