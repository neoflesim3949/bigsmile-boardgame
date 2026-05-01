import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

loadEnv({ path: '.env.local' });

interface SeedAccount {
  user_id: string;
  name: string;
  login_id: string;
  password: string;
  role: 'admin' | 'player' | 'captain';
}

const ACCOUNTS: SeedAccount[] = [
  { user_id: 'admin001', name: '大會管理員', login_id: 'admin', password: 'admin1234', role: 'admin' },
  { user_id: 'captain001', name: '關主小明', login_id: 'captain1', password: 'captain12', role: 'captain' },
  { user_id: 'player001', name: '玩家阿華', login_id: 'player001', password: 'player001', role: 'player' },
  { user_id: 'player002', name: '玩家小美', login_id: 'player002', password: 'player002', role: 'player' },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const isLocal = /\/\/(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);
  const client = new Client({
    connectionString: url,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();

  console.log('→ Seeding accounts...');
  for (const a of ACCOUNTS) {
    const hash = await bcrypt.hash(a.password, 12);
    await client.query(
      `INSERT INTO "Account" (user_id, name, login_id, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (user_id) DO UPDATE SET
         name = EXCLUDED.name,
         login_id = EXCLUDED.login_id,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         is_active = true`,
      [a.user_id, a.name, a.login_id, hash, a.role],
    );

    if (a.role === 'player') {
      await client.query(
        `INSERT INTO "PlayerStats" (user_id, money, health, blessing, karma)
         VALUES ($1, 1000, 80, 10, 0)
         ON CONFLICT (user_id) DO NOTHING`,
        [a.user_id],
      );
    }
    console.log(`  ✓ ${a.role.padEnd(7)} ${a.login_id} / ${a.password}`);
  }

  console.log('→ Seeding initial value templates...');
  const templates = [
    {
      label: '富貴命',
      emoji: '💰',
      theme: 'amber',
      rarity_label: '稀有',
      description: '金錢豐厚，但仍需謹慎修身。',
      money: 5000, health: 80, blessing: 5, karma: 0,
    },
    {
      label: '清修命',
      emoji: '🧘',
      theme: 'teal',
      rarity_label: '普通',
      description: '身心清淨，福報豐盛，財富需努力積累。',
      money: 1000, health: 100, blessing: 20, karma: 0,
    },
    {
      label: '勞碌命',
      emoji: '⚒️',
      theme: 'zinc',
      rarity_label: '普通',
      description: '勤勉耕耘，方能水到渠成。',
      money: 2000, health: 60, blessing: 10, karma: 5,
    },
  ];
  for (const t of templates) {
    await client.query(
      `INSERT INTO "InitialValueTemplate"
         (id, label, emoji, theme, rarity_label, description, money, health, blessing, karma)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (label) DO NOTHING`,
      [
        randomUUID(),
        t.label, t.emoji, t.theme, t.rarity_label, t.description,
        t.money, t.health, t.blessing, t.karma,
      ],
    );
  }

  console.log('→ Ensuring BoardConfig single row exists...');
  await client.query(
    `INSERT INTO "BoardConfig" (id, title) VALUES (1, '開運大富翁 ── 大廳')
     ON CONFLICT (id) DO NOTHING`,
  );

  console.log('→ Seeding default AppSettings (only if missing)...');
  const defaults: Array<[string, string]> = [
    ['BoardGameEnabled', 'false'],
    ['CardDrawMode', 'false'],
    ['TourMode', 'false'],
    ['ShowAllStats', 'true'],
    ['ExchangeRate', '10'],
    ['ManualRefreshCooldownSeconds', '60'],
    ['QRTokenTTL', '300'],
    ['InitialMoney', '1000'],
    ['InitialHealth', '80'],
    ['InitialBlessing', '10'],
    ['InitialKarma', '0'],
    ['RebirthMoney', '500'],
    ['RebirthHealth', '50'],
    ['RebirthBlessing', '5'],
    ['RebirthKarma', '0'],
    ['ScoreWeightMoney', '0.05'],
    ['ScoreWeightBlessing', '200'],
    ['ScoreWeightKarma', '150'],
  ];
  for (const [k, v] of defaults) {
    await client.query(
      `INSERT INTO "AppSettings" (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [k, v],
    );
  }

  console.log('Done.');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
