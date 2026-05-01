import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

loadEnv({ path: '.env.local' });

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set. Copy .env.local.example to .env.local first.');
    process.exit(1);
  }
  const isLocal = /\/\/(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);
  const client = new Client({
    connectionString: url,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS "_Migrations" (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    (await client.query<{ filename: string }>(`SELECT filename FROM "_Migrations"`)).rows.map(
      (r) => r.filename,
    ),
  );

  let ranAny = false;
  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`→ Applying ${file}`);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(`INSERT INTO "_Migrations" (filename) VALUES ($1)`, [file]);
      await client.query('COMMIT');
      ranAny = true;
      console.log(`  ✓ ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ✗ ${file} failed:`, err);
      await client.end();
      process.exit(1);
    }
  }

  if (!ranAny) {
    console.log('Nothing to migrate. Database up to date.');
  }
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
