import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Disposable local database required');
const schema = `audit_fixes_capital_${Date.now()}_${process.pid}`;
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
  for (const args of [['node_modules/prisma/build/index.js', 'migrate', 'deploy'], ['--import', 'tsx', 'prisma/seed.ts']]) {
    const result = spawnSync(process.execPath, args, { env: process.env, encoding: 'utf8', timeout: 120000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  const { app } = await import('../server/src/app');
  const { prisma } = await import('../server/src/prisma/prisma.service');
  disconnect = () => prisma.$disconnect();
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api`;
  let token = '';
  const api = async (method: string, path: string, body?: unknown, key?: string) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, data: await r.json() };
  };
  token = (await api('POST', '/auth/login', { login: 'admin', password: 'admin123' })).data.token;
  assert.equal((await api('POST', '/exchange-rate/today', { rate: 10 })).status, 200);

  const state = async () => {
    const owner = await db.owner.findUniqueOrThrow({ where: { id: 'owner-admin' } });
    const store = await db.store.findFirstOrThrow({ where: { isMainWarehouse: true } });
    const account = await db.financialAccount.findUnique({ where: { storeId: store.id } });
    return { capital: owner.capitalBalanceUsd.toString(), profit: owner.availableProfitUsd.toString(), paid: owner.totalPaidProfitUsd.toString(), reinvested: owner.totalReinvestedUsd.toString(), cash: store.cashBalanceUsd.toString(), account: account?.balanceUsd.toString(), tx: await db.ownerTransaction.count(), ledger: await db.ledgerEntry.count(), audit: await db.auditLog.count(), finance: await db.financialTransaction.count() };
  };
  const post = (kind: string, amountUsd: unknown, key?: string) => api('POST', `/owners/owner-admin/${kind}`, { amountUsd }, key);
  const ok = async (kind: string, amount: unknown) => {
    const result = await post(kind, amount);
    assert.equal(result.status, 200, JSON.stringify(result));
  };
  await db.owner.updateMany({ data: { availableProfitUsd: 100, totalAccruedProfitUsd: 100 } });
  await ok('investment', '100.01');
  let s = await state();
  assert.equal(s.capital, '100.01'); assert.equal(s.cash, '100.01'); assert.equal(s.account, s.cash);
  assert.equal(s.tx, 1); assert.equal(s.finance, 1); assert.equal(s.profit, '100');
  pass('investment: exact Decimal amounts, cash/account reconciliation, one history row');
  await ok('withdrawal', '0.01');
  s = await state(); assert.equal(s.capital, '100'); assert.equal(s.cash, '100'); assert.equal(s.account, s.cash);
  pass('withdrawal: capital and both cash balances decrease exactly');
  await ok('payout', '10.01');
  s = await state(); assert.equal(s.capital, '100'); assert.equal(s.profit, '89.99'); assert.equal(s.paid, '10.01'); assert.equal(s.cash, '89.99'); assert.equal(s.account, s.cash);
  pass('profit payout: profit reduced once without reducing capital');
  const beforeReinvest = await state();
  await ok('reinvest', '9.99');
  s = await state(); assert.equal(s.capital, '109.99'); assert.equal(s.profit, '80'); assert.equal(s.reinvested, '9.99'); assert.equal(s.cash, beforeReinvest.cash); assert.equal(s.finance, beforeReinvest.finance);
  assert.equal(s.tx, beforeReinvest.tx + 1); assert.equal(s.audit, beforeReinvest.audit + 1); assert.equal(s.ledger, beforeReinvest.ledger + 1);
  pass('reinvestment: profit becomes capital without fictitious cash movement; audit/ledger recorded');
  const beforeInvalid = await state();
  for (const kind of ['investment', 'withdrawal', 'payout', 'reinvest']) {
    for (const amount of [null, '', ' ', 0, -1, 'abc', 'NaN', 'Infinity', '1000000000000']) {
      assert.equal((await post(kind, amount)).status, 400, `${kind}: ${amount}`);
    }
  }
  assert.deepEqual(await state(), beforeInvalid);
  pass('36 invalid requests rejected without any balance/history changes');
  for (const kind of ['withdrawal', 'payout', 'reinvest']) {
    assert.equal((await post(kind, 10000)).status, 400);
    assert.deepEqual(await state(), beforeInvalid);
  }
  // Capital is sufficient, but cash is not: earlier owner update must roll back.
  assert.equal((await post('withdrawal', 100)).status, 400);
  assert.deepEqual(await state(), beforeInvalid);
  pass('insufficient capital/profit/cash: complete rollback including owner and journal');
  for (const kind of ['investment', 'withdrawal', 'payout', 'reinvest']) {
    const before = await state();
    const results = await Promise.all([post(kind, '1.01', `capital-${kind}`), post(kind, '1.01', `capital-${kind}`)]);
    assert.deepEqual(results.map(r => r.status), [200, 200]);
    assert.equal((await state()).tx, before.tx + 1);
    assert.equal((await post(kind, '2.01', `capital-${kind}`)).status, 409);
    const after = await state();
    assert.equal((await post(kind, '1.01', `capital-${kind}`)).status, 200);
    assert.deepEqual(await state(), after);
  }
  pass('all four operations: simultaneous same-key requests execute once; retries replay; changed payload rejected');
  const beforeRace = await state();
  const race = await Promise.all([post('payout', 50, 'race-payout'), post('reinvest', 50, 'race-reinvest')]);
  assert.deepEqual(race.map(r => r.status).sort(), [200, 400]);
  assert.equal((await state()).tx, beforeRace.tx + 1);
  const owner = await db.owner.findUniqueOrThrow({ where: { id: 'owner-admin' } });
  assert(owner.availableProfitUsd.eq(owner.totalAccruedProfitUsd.minus(owner.totalPaidProfitUsd).minus(owner.totalReinvestedUsd)));
  pass('concurrent payout/reinvestment cannot spend the same profit twice');
  const adminToken = token;
  token = (await api('POST', '/auth/login', { login: 'ahmad', password: 'seller123' })).data.token;
  assert(token);
  for (const kind of ['investment', 'withdrawal', 'payout', 'reinvest']) assert.equal((await post(kind, 1)).status, 403);
  // Expenses are not a seller's business either — the server refuses, not just the UI.
  const sellerExpense = await api('POST', '/expenses', { category: 'Аренда', amountTjs: 100, storeId: 'store-siyoma' });
  assert.equal(sellerExpense.status, 403, JSON.stringify(sellerExpense));
  token = (await api('POST', '/auth/login', { login: 'partner', password: 'partner123' })).data.token;
  // Owner money moves are run by the admin only (partners included).
  assert(token); assert.equal((await post('investment', '0.01')).status, 403);
  token = adminToken;
  pass('seller denied owner money moves and expenses; partner denied owner money moves (admin only)');
  const rows = await db.ownerTransaction.findMany();
  for (const row of rows) assert(row.exchangeRate.eq(10));
  assert.equal((await api('POST', '/exchange-rate/today', { rate: 11 })).status, 200);
  for (const row of await db.ownerTransaction.findMany()) assert(row.exchangeRate.eq(10));
  pass('historical operations retain their original exchange rate');
  const beforeLarge = await db.owner.findUniqueOrThrow({ where: { id: 'owner-admin' } });
  await ok('investment', 100000);
  const afterLarge = await db.owner.findUniqueOrThrow({ where: { id: 'owner-admin' } });
  assert(afterLarge.capitalBalanceUsd.minus(beforeLarge.capitalBalanceUsd).eq(100000));
  await ok('withdrawal', 100000);
  assert((await db.owner.findUniqueOrThrow({ where: { id: 'owner-admin' } })).capitalBalanceUsd.eq(beforeLarge.capitalBalanceUsd));
  pass('100000 USD investment and withdrawal succeed with exact balances');
  console.log(`Capital audit: ${passed} groups passed`);
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await disconnect?.();
  await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect();
  console.log('Functional regression schema removed');
}
