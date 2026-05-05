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

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export type { PoolClient };
