// Runs a scenario against the real API on a freshly migrated and seeded temporary schema of the
// local database (one app process per schema), then drops the schema.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

export interface DisposableApi {
  db: PrismaClient;
  env: NodeJS.ProcessEnv;
  /** Calls the API as `token` (default: admin) with a fresh Idempotency-Key unless one is given. */
  call: (method: string, path: string, body?: unknown, opts?: { token?: string; key?: string }) => Promise<{ status: number; data: any }>;
  login: (login: string, password: string) => Promise<string>;
}

export async function withDisposableApi(label: string, fn: (api: DisposableApi) => Promise<void>) {
  const base = new URL(process.env.DATABASE_URL || '');
  assert(['localhost', '127.0.0.1'].includes(base.hostname), 'Disposable local database required');
  const schema = `audit_fixes_${label}_${Date.now()}_${process.pid}`;
  const url = new URL(base.href);
  url.searchParams.set('schema', schema);
  const env = { ...process.env, DATABASE_URL: url.href, SEED_TEST_DATA: 'true' };
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  try {
    for (const args of [['node_modules/prisma/build/index.js', 'migrate', 'deploy'], ['--import', 'tsx', 'prisma/seed.ts']]) {
      const r = spawnSync(process.execPath, args, { env, encoding: 'utf8', timeout: 120000 });
      assert.equal(r.status, 0, r.stdout + r.stderr);
    }
    const proc = spawn(process.execPath, ['--import', 'tsx', 'scripts/serve-api-fixture.ts'], { env: { ...env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const port: number = await new Promise((resolve, reject) => {
      let out = '';
      proc.stdout.on('data', (b) => { out += b; const m = out.match(/LISTENING (\d+)/); if (m) resolve(Number(m[1])); });
      proc.stderr.on('data', (b) => { out += b; if (process.env.API_TEST_LOG) process.stderr.write(b); });
      proc.on('exit', (code) => reject(new Error(`API fixture exited ${code}: ${out}`)));
    });
    const apiBase = `http://127.0.0.1:${port}/api`;
    let admin = '';
    const call: DisposableApi['call'] = async (method, path, body, opts = {}) => {
      const token = opts.token ?? admin;
      const r = await fetch(apiBase + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Idempotency-Key': opts.key ?? crypto.randomUUID() },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: r.status, data: await r.json().catch(() => null) };
    };
    const login = async (l: string, p: string) => (await call('POST', '/auth/login', { login: l, password: p }, { token: '' })).data.token as string;
    admin = await login('admin', 'admin123');
    try {
      await fn({ db, env, call, login });
    } finally {
      proc.kill();
    }
  } finally {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
  }
}
