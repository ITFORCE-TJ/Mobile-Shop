import { D } from '../server/src/common/decimal';
import 'dotenv/config';
import assert from './lib/decimal-assert';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { WebSocket } from 'ws';

const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Local database required');
const schema = `audit_fixes_${Date.now()}_${process.pid}`;
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.href;
process.env.SEED_TEST_DATA = 'true';
const db = new PrismaClient();
await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
let server: import('node:http').Server | undefined;
let disconnect: (() => Promise<void>) | undefined;
let passed = 0;
const pass = (name: string) => { passed++; console.log(`PASS ${name}`); };
try {
  for (const args of [
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    ['--import', 'dotenv/config', '--import', 'tsx', 'prisma/seed.ts'],
    ['--import', 'dotenv/config', '--import', 'tsx', 'scripts/test-e2e-all.ts'],
  ]) {
    const result = spawnSync(process.execPath, args, { env: process.env, encoding: 'utf8', timeout: 120000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    console.log(result.stdout);
  }
  const { prisma } = await import('../server/src/prisma/prisma.service');
  disconnect = () => prisma.$disconnect();
  const reports = await import('../server/src/modules/reports/reports.service');
  const expenses = await import('../server/src/modules/expenses/expenses.service');
  const { OwnersService } = await import('../server/src/modules/owners/owners.service');
  const { SuppliersService } = await import('../server/src/modules/suppliers/suppliers.service');
  const { app } = await import('../server/src/app');
  const { RealtimeSyncGateway } = await import('../server/src/websocket/websocket.gateway');
  server = app.listen(0, '127.0.0.1');
  RealtimeSyncGateway.init(server);
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const port = (server.address() as import('node:net').AddressInfo).port;
  const api = async (route: string, token?: string, body?: unknown, method = body ? 'POST' : 'GET') => {
    const res = await fetch(`http://127.0.0.1:${port}/api${route}`, { method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json() };
  };
  const login = async (name: string, password: string) => {
    const res = await api('/auth/login', undefined, { login: name, password });
    assert.equal(res.status, 200); return res.data.token as string;
  };
  const admin = await login('admin', 'admin123');
  const seller = await login('ahmad', 'seller123');
  const otherSession = await login('ahmad', 'seller123');
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${seller}`);
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const socketClosed = new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => { socket.terminate(); reject(new Error('Logout did not close WebSocket')); }, 5000);
    socket.once('close', code => { clearTimeout(timeout); resolve(code); });
  });
  assert.equal((await api('/auth/logout', seller, {})).status, 200);
  assert.equal((await api('/stores', seller)).status, 401);
  assert.equal((await api('/stores', otherSession)).status, 200);
  assert.equal(await socketClosed, 1008);
  pass('logout revokes only the current session and closes its WebSocket');
  assert.equal((await api('/users/user-ahmad', admin, { password: 'changed123' }, 'PATCH')).status, 200);
  const changedPasswordHash = (await prisma.user.findUniqueOrThrow({ where: { id: 'user-ahmad' } })).password;
  const reseed = spawnSync(process.execPath, ['--import', 'dotenv/config', '--import', 'tsx', 'prisma/seed.ts'], { env: process.env, encoding: 'utf8', timeout: 60000 });
  assert.equal(reseed.status, 0, reseed.stderr);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: 'user-ahmad' } })).password, changedPasswordHash);
  pass('repeated seed preserves an existing changed password');
  assert.equal((await api('/stores', otherSession)).status, 401);
  const fresh = await login('ahmad', 'changed123');
  assert.equal((await api('/stores', fresh)).status, 200);
  assert.equal((await api('/owners', fresh)).status, 403);
  pass('password change revokes existing sessions; new login and role restrictions work');

  // The expense scenarios below pay from this register: top it up directly, moving the
  // store's cash and its ledger account together as every cash operation does.
  const cash = await prisma.financialAccount.findUniqueOrThrow({ where: { storeId: 'store-siyoma' } });
  await prisma.$transaction([
    prisma.store.update({ where: { id: 'store-siyoma' }, data: { cashBalanceUsd: { increment: 100 } } }),
    prisma.financialAccount.update({ where: { id: cash.id }, data: { balanceUsd: { increment: 100 }, balanceTjs: { increment: 1000 } } }),
  ]);
  const cashBefore = await prisma.financialAccount.findUniqueOrThrow({ where: { id: cash.id } });

  const shares = (a: number) => OwnersService.updateProfitShares([{ ownerId: 'owner-admin', sharePercent: a }, { ownerId: 'owner-partner', sharePercent: 100 - a }], 'user-admin');
  const balances = async () => (await prisma.owner.findMany({ orderBy: { id: 'asc' } })).map(o => o.availableProfitUsd);
  await prisma.owner.updateMany({ data: { availableProfitUsd: D(100), totalAccruedProfitUsd: D(100) } });
  await shares(60);
  // A new cash bonus is nobody's income: owner balances do not move.
  const bonus = await SuppliersService.createBonus({ supplierId: 'sup-dubai', bonusType: 'CASH_DISCOUNT', amountUsd: D(100), createdByUserId: 'user-admin' });
  assert.deepEqual(await balances(), [100, 100]);
  await SuppliersService.deleteBonus(bonus.id, 'user-admin');
  assert.deepEqual(await balances(), [100, 100]);
  pass('new cash bonus is not accrued to owners; deleting it moves nothing');
  // A bonus booked before that rule still carries its 60/40 owner accrual.
  const legacyBonus = async () => {
    const created = await SuppliersService.createBonus({ supplierId: 'sup-dubai', bonusType: 'CASH_DISCOUNT', amountUsd: D(100), createdByUserId: 'user-admin' });
    await prisma.supplierBonus.update({ where: { id: created.id }, data: { ownerProfitAllocations: [{ ownerId: 'owner-admin', amountUsd: 60 }, { ownerId: 'owner-partner', amountUsd: 40 }] } });
    await prisma.owner.update({ where: { id: 'owner-admin' }, data: { availableProfitUsd: { increment: 60 }, totalAccruedProfitUsd: { increment: 60 } } });
    await prisma.owner.update({ where: { id: 'owner-partner' }, data: { availableProfitUsd: { increment: 40 }, totalAccruedProfitUsd: { increment: 40 } } });
    return created;
  };
  const legacyCash = await legacyBonus();
  assert.deepEqual(await balances(), [160, 140]);
  await shares(50);
  await SuppliersService.deleteBonus(legacyCash.id, 'user-admin');
  assert.deepEqual(await balances(), [100, 100]);
  pass('legacy bonus deletion reverses its original 60/40 accrual after shares change');
  await shares(60);
  const editedBonus = await legacyBonus();
  await shares(50);
  await SuppliersService.updateBonus(editedBonus.id, { amountUsd: D(80), actorUserId: 'user-admin' });
  assert.deepEqual(await balances(), [100, 100]);
  await shares(70);
  await SuppliersService.deleteBonus(editedBonus.id, 'user-admin');
  assert.deepEqual(await balances(), [100, 100]);
  pass('legacy bonus amount edit reverses its owner accrual without booking a new one; deletion moves nothing more');
  await shares(60);
  const beforeSummary = await reports.computeReportsSummary({ period: 'ALL' });
  const expense = await expenses.createExpenseStandalone({ category: 'OTHER', amountTjs: D(105), storeId: 'store-siyoma', paidFromCashRegister: true, createdByUserId: 'user-admin' });
  await shares(50);
  await expenses.deleteExpense(expense.id, 'user-admin');
  assert.deepEqual(await balances(), [100, 100]);
  assert.equal((await reports.computeReportsSummary({ period: 'ALL' })).expensesTjs, beforeSummary.expensesTjs);
  pass('expense cancellation restores historical allocations and removes summary expense');
  const edited = await expenses.createExpenseStandalone({ category: 'OTHER', amountTjs: D(105), storeId: 'store-siyoma', paidFromCashRegister: true, createdByUserId: 'user-admin' });
  await expenses.updateExpense(edited.id, { amountTjs: D(210) }, 'user-admin');
  await expenses.updateExpense(edited.id, { amountTjs: D(315) }, 'user-admin');
  await shares(70);
  await expenses.deleteExpense(edited.id, 'user-admin');
  assert.deepEqual(await balances(), [100, 100]);
  assert.equal((await prisma.financialAccount.findUniqueOrThrow({ where: { id: cash.id } })).balanceTjs, cashBefore.balanceTjs);
  pass('repeated expense edits reverse the live posting, not an earlier reversal');
  const concurrent = await expenses.createExpenseStandalone({ category: 'OTHER', amountTjs: D(105), storeId: 'store-siyoma', createdByUserId: 'user-admin' });
  const cancellations = await Promise.allSettled([expenses.deleteExpense(concurrent.id, 'user-admin'), expenses.deleteExpense(concurrent.id, 'user-admin')]);
  assert.equal(cancellations.filter(r => r.status === 'fulfilled').length, 1);
  assert.deepEqual(await balances(), [100, 100]);
  pass('concurrent expense cancellation returns cash and profit exactly once');
  const legacy = await expenses.createExpenseStandalone({ category: 'OTHER', amountTjs: D(105), paidFromCashRegister: false, createdByUserId: 'user-admin' });
  await db.$executeRaw`UPDATE expenses SET "ownerProfitAllocations" = NULL WHERE id = ${legacy.id}`;
  const beforeLegacy = await balances();
  await assert.rejects(expenses.deleteExpense(legacy.id, 'user-admin'), /исходное распределение/);
  assert.deepEqual(await balances(), beforeLegacy);
  assert.equal((await prisma.expense.findUniqueOrThrow({ where: { id: legacy.id } })).cancelledAt, null);
  pass('missing historical allocation rejects cancellation atomically');
  console.log(`Audit regressions: ${passed} passed`);
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await disconnect?.();
  await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect();
}
