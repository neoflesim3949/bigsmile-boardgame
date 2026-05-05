import { query, type PoolClient } from './db';

/**
 * AppSettings 唯一存取入口。新 key 在這裡新增 type 與預設值。
 * 讀取走 getSetting；寫入走 setSetting（自動寫入 Transaction 稽核）。
 */

export type AppSettingsKey =
  | 'BoardGameEnabled'
  | 'BoardGameStartedAt'
  | 'CardDrawMode'
  | 'TourMode'
  | 'EventStartAt'
  | 'EventEndAt'
  | 'ExchangeRate'
  | 'ExchangeRateMultiplier'
  | 'TransferFeeRate'
  | 'ScoreWeightMoney'
  | 'ScoreWeightBlessing'
  | 'ScoreWeightKarma'
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
  | 'StockPriceRule'
  | 'StockSellBlessingPenaltyDivisor'
  | 'MaxDestinyDraws';

export const DEFAULT_SETTINGS: Record<AppSettingsKey, string> = {
  BoardGameEnabled: 'false',
  BoardGameStartedAt: '',
  CardDrawMode: 'false',
  TourMode: 'false',
  EventStartAt: '',
  EventEndAt: '',
  ExchangeRate: '10',
  ExchangeRateMultiplier: '1.0',
  TransferFeeRate: '0',
  ScoreWeightMoney: '0.05',
  ScoreWeightBlessing: '200',
  ScoreWeightKarma: '150',
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
  // 賣股獲利每 N 元扣 1 福分（formula: blessing_penalty = round(profit / divisor)）
  // 預設 10000 = 「每 1K 獲利扣 0.1 福分」=「每 10K 獲利扣 1 福分」
  StockSellBlessingPenaltyDivisor: '10000',
  MaxDestinyDraws: '100',
};

/**
 * 取單一 setting。
 *
 * **在 tx 內呼叫一律傳 `client`**（CLAUDE.md §3.2）— 否則會走獨立連線占用第 2 個 pool slot，
 * 500 並發時會雙倍消耗 pool。Standalone（無 tx）情境才省略 client 參數。
 */
export async function getSetting(key: AppSettingsKey, client?: PoolClient): Promise<string> {
  const sql = `SELECT value FROM "AppSettings" WHERE key = $1`;
  const result = client
    ? await client.query<{ value: string }>(sql, [key])
    : await query<{ value: string }>(sql, [key]);
  return result.rows[0]?.value ?? DEFAULT_SETTINGS[key];
}

/**
 * 批次取多個 setting — 比多次 getSetting 少 N-1 個 round-trip。
 * 同樣建議 tx 內傳 `client`。
 */
export async function getSettings<K extends AppSettingsKey>(
  keys: K[],
  client?: PoolClient,
): Promise<Record<K, string>> {
  if (keys.length === 0) return {} as Record<K, string>;
  const sql = `SELECT key, value FROM "AppSettings" WHERE key = ANY($1)`;
  const result = client
    ? await client.query<{ key: K; value: string }>(sql, [keys])
    : await query<{ key: K; value: string }>(sql, [keys]);
  const map = new Map(result.rows.map((r) => [r.key, r.value] as const));
  const out = {} as Record<K, string>;
  for (const k of keys) out[k] = map.get(k) ?? DEFAULT_SETTINGS[k];
  return out;
}

/**
 * 寫 AppSettings + 稽核 Transaction。
 *
 * **tx 內呼叫一律傳 `client`**（與 getSetting 一致，CLAUDE.md §3.2）— 否則占第 2 個 connection。
 *
 * actorUserId null 時跳過稽核（保留原行為；目前 codebase 沒有 caller 傳 null，
 * 若日後需 system audit 須先 INSERT 一個 system Account row 對應 FK，再放開稽核）。
 */
export async function setSetting(
  key: AppSettingsKey,
  value: string,
  actorUserId: string | null,
  client?: PoolClient,
): Promise<void> {
  const upsertSql = `INSERT INTO "AppSettings" (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()`;
  if (client) {
    await client.query(upsertSql, [key, value, actorUserId]);
  } else {
    await query(upsertSql, [key, value, actorUserId]);
  }
  if (actorUserId) {
    const auditSql = `INSERT INTO "Transaction" (user_id, actor_user_id, tx_type, payload)
       VALUES ($1, $1, 'settings_update', $2)`;
    const auditParams = [actorUserId, JSON.stringify({ key, value })];
    if (client) {
      await client.query(auditSql, auditParams);
    } else {
      await query(auditSql, auditParams);
    }
  }
}
