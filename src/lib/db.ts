import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

declare global {
  var __pgPool: Pool | undefined;
}

function getPool(): Pool {
  if (!global.__pgPool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set. Run `cp .env.local.example .env.local` and edit it.');
    }
    // 本機 Postgres（localhost / 127.0.0.1 / Docker host）不開 SSL；雲端一律 SSL。
    const isLocal = /\/\/(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);
    // SSL 嚴驗（code review #3.1）：
    //   設了 SUPABASE_DB_CA_CERT env var → 用 cert 嚴驗（rejectUnauthorized: true）
    //   未設 → fallback 到 rejectUnauthorized: false（向後相容；理論上 AWS 內網 MITM 難度極高）
    //
    // 啟用步驟：
    //   1. Supabase Dashboard → Project Settings → Database → SSL Configuration 下載 root cert（pem 格式）
    //   2. 設 env var `SUPABASE_DB_CA_CERT`（pem 內容直接貼，或 base64 後貼，下方自動偵測）
    //   3. 部署前用 staging 跑通連線測試
    const caCertRaw = process.env.SUPABASE_DB_CA_CERT;
    let sslOpts: { ca?: string; rejectUnauthorized: boolean } | undefined;
    if (isLocal) {
      sslOpts = undefined;
    } else if (caCertRaw) {
      // 自動偵測 base64：純 base64 不含 BEGIN/END marker，用 Buffer 解一次
      const ca = caCertRaw.includes('BEGIN CERTIFICATE')
        ? caCertRaw
        : Buffer.from(caCertRaw, 'base64').toString('utf-8');
      sslOpts = { ca, rejectUnauthorized: true };
    } else {
      // Production 沒設 cert 時 fail-loud（code review 0505 L3）
      if (process.env.NODE_ENV === 'production') {
        console.warn(
          '[db.ts] SUPABASE_DB_CA_CERT 未設定 — SSL 走 rejectUnauthorized:false。' +
            ' 生產環境建議設定 cert 啟用嚴驗（見 db.ts 註解）',
        );
      }
      sslOpts = { rejectUnauthorized: false };
    }
    global.__pgPool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
      // 卡死保險絲（0507_problem.md §2/§4）：避免 1 個壞 query 占連線永久、後續 acquire 也 hang。
      // - connectionTimeoutMillis：拿不到連線等 5s 就放棄（預設 0=等永遠）
      // - query_timeout：單 query client 端 30s 上限
      // - statement_timeout：PG 端 SET statement_timeout=30s 雙保險
      // 對既有壓測無影響（最久 query 也 < 5s），但對「真出意外」直接 abort 釋放連線。
      connectionTimeoutMillis: 5_000,
      query_timeout: 30_000,
      statement_timeout: 30_000,
      ssl: sslOpts,
    });
  }
  return global.__pgPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(sql, params as never[]);
}

/** PG SQLState `40P01` = deadlock_detected；偵測 message 也作備援（不同 driver 版本可能用不同形式）*/
function isDeadlockError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === '40P01') return true;
  if (typeof e.message === 'string' && /deadlock detected/i.test(e.message)) return true;
  return false;
}

const DEADLOCK_MAX_RETRIES = 2;

/**
 * pg 顯式交易包裝。
 *
 * **Deadlock auto-retry（CLAUDE.md §11）**：偵測到 PG 主動 abort（SQLState 40P01）→ 等 50ms 後 retry，
 * 最多 2 次（總共 3 次嘗試）。每次 retry 換新 client、新 BEGIN/COMMIT。
 *
 * 為什麼需要：實測 mixed test 「兩個 admin 並發推進」會撞 karma_band CTE 的 row lock 順序差。
 * 真實 production 不會發生（tickRound 30s 節流硬性序列化），但環境差異 / 網路抖動 / 其他 backend
 * 可能讓邊角 deadlock 偶發出現。retry 是廉價保險。
 *
 * 不重試其他錯誤（INSUFFICIENT_FUNDS / NOT_FOUND / ActionError 等業務錯誤直接 throw 給 caller）。
 */
export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= DEADLOCK_MAX_RETRIES; attempt++) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      client.release();
      return result;
    } catch (err) {
      lastErr = err;
      try { await client.query('ROLLBACK'); } catch { /* connection 已斷則 rollback 也會失敗 */ }
      client.release();
      if (attempt < DEADLOCK_MAX_RETRIES && isDeadlockError(err)) {
        // 等 50ms 讓另一邊的 tx 完成或 timeout，避免立刻又撞同一個 lock 序
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export type { PoolClient };
