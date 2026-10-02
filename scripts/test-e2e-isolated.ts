// Runs the e2e business-flow suite in a temporary schema (migrated and seeded here, dropped
// afterwards), so it never touches the working database.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const url = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
  console.error('test:e2e: нужна локальная база (DATABASE_URL на localhost)');
  process.exit(1);
}
const schema = `audit_fixes_e2e_${Date.now()}_${process.pid}`;
url.searchParams.set('schema', schema);
const env = { ...process.env, DATABASE_URL: url.href, SEED_TEST_DATA: 'true' };
const db = new PrismaClient({ datasources: { db: { url: url.href } } });
await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
let code = 1;
try {
  for (const args of [['node_modules/prisma/build/index.js', 'migrate', 'deploy'], ['--import', 'tsx', 'prisma/seed.ts']]) {
    const r = spawnSync(process.execPath, args, { env, encoding: 'utf8', timeout: 120000 });
    if (r.status !== 0) { console.error(r.stdout + r.stderr); throw new Error(`${args.join(' ')} failed`); }
  }
  code = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test-e2e-all.ts'], { env, stdio: 'inherit', timeout: 300000 }).status ?? 1;
} finally {
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
}
process.exit(code);
