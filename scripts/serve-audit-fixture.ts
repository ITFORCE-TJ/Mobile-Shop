import 'dotenv/config';
import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Disposable local database required');
const schema = `audit_fixes_browser_${Date.now()}_${process.pid}`;
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.href;
process.env.SEED_TEST_DATA = 'true';
const db = new PrismaClient();
await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
let server: import('node:http').Server | undefined;
let disconnect: (() => Promise<void>) | undefined;
try {
  for (const args of [['node_modules/prisma/build/index.js', 'migrate', 'deploy'], ['--import', 'tsx', 'prisma/seed.ts']]) {
    const result = spawnSync(process.execPath, args, { env: process.env, encoding: 'utf8', timeout: 120000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  const { app } = await import('../server/src/app');
  const { prisma } = await import('../server/src/prisma/prisma.service');
  const { RealtimeSyncGateway } = await import('../server/src/websocket/websocket.gateway');
  disconnect = () => prisma.$disconnect();
  app.use(express.static(path.resolve('dist')));
  app.get('*', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
  server = app.listen(3199, '127.0.0.1');
  RealtimeSyncGateway.init(server);
  await new Promise<void>(resolve => server!.once('listening', resolve));
  console.log(`AUDIT_FIXTURE_READY http://127.0.0.1:3199 schema=${schema}; send stop on stdin to clean up`);
  await new Promise<void>(resolve => {
    process.once('SIGINT', resolve); process.once('SIGTERM', resolve);
    process.stdin.on('data', data => { if (String(data).trim() === 'stop') resolve(); });
  });
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await disconnect?.();
  await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect();
  console.log('Functional regression schema removed');
  process.exit(0);
}
