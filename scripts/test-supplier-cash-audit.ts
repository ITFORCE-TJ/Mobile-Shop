import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Disposable local database required');
const schema = `audit_fixes_supplier_cash_${Date.now()}_${process.pid}`;
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


  const warehouse = await db.store.findFirstOrThrow({ where: { isMainWarehouse: true } });
  const purchase = await api('POST', '/purchases', { supplierId: 'sup-dubai', invoiceNumber: 'CASH-RECONCILE', storeId: warehouse.id, groups: [{ brand: 'Test', model: 'Phone', ram: '8', storage: '128', color: 'Black', purchasePriceUsd: 100, items: [{ imei: '350000000000001' }] }] });
  assert.equal(purchase.status, 201, JSON.stringify(purchase));
  const endpoint = `/supplier-invoices/${purchase.data.invoice.id}/payments`;
  // Registers are kept in USD and their ledger account must mirror them exactly.
  const setCash = async (usd: number, accountUsd = usd) => {
    await db.store.update({ where: { id: warehouse.id }, data: { cashBalanceUsd: usd } });
    await db.financialAccount.upsert({ where: { storeId: warehouse.id }, update: { balanceUsd: accountUsd, balanceTjs: 0 },
      create: { name: `Касса ${warehouse.name}`, type: 'CASH', storeId: warehouse.id, balanceUsd: accountUsd } });
  };
  const check = async (expected: string) => {
    const store = await db.store.findUniqueOrThrow({ where: { id: warehouse.id } });
    const account = await db.financialAccount.findUniqueOrThrow({ where: { storeId: warehouse.id } });
    assert.equal(store.cashBalanceUsd.toString(), expected); assert(account.balanceUsd.eq(store.cashBalanceUsd));
  };
  await setCash(100);
  const payment = { amountUsd: 10, sourceAccount: 'STORE_CASH', storeId: warehouse.id };
  const result = await api('POST', endpoint, payment, 'invoice-pay');
  assert.equal(result.status, 201, JSON.stringify(result));
  await check('90');
  pass('invoice paid in USD: register and ledger account both -$10');
  assert.equal((await api('POST', endpoint, payment, 'invoice-pay')).status, 201);
  await check('90'); assert.equal(await db.supplierPayment.count(), 1);
  assert.equal((await api('POST', endpoint, payment, 'invoice-pay-2')).status, 201);
  await check('80');
  pass('retry does not pay twice; subsequent payment debits once more');

  // A register that drifted from its ledger account is reported and blocks payouts until
  // an explicit cash adjustment resets both — never silently "reconciled".
  await setCash(500, 80);
  const drifted = await api('POST', endpoint, payment, 'drifted');
  assert.equal(drifted.status, 409, JSON.stringify(drifted));
  assert.match(String(drifted.data?.message), /Расхождение кассы/);
  assert.equal(await db.supplierPayment.count(), 2);
  const adjusted = await api('POST', `/stores/${warehouse.id}/adjust-cash`, { newBalanceUsd: 500, reason: 'Пересчёт кассы' }, 'adjust');
  assert.equal(adjusted.status, 200, JSON.stringify(adjusted));
  await check('500');
  pass('register/ledger drift is rejected with 409 until a cash adjustment resets both');

  const before = await db.supplierPayment.count();
  await setCash(0);
  assert.equal((await api('POST', endpoint, payment, 'insufficient')).status, 400);
  assert.equal(await db.supplierPayment.count(), before);
  await check('0');
  pass('real cash shortage rejected; nothing moves');
  await setCash(80);
  const fifo = await api('POST', '/suppliers/sup-dubai/payments', payment, 'fifo-payment');
  assert.equal(fifo.status, 201, JSON.stringify(fifo));
  await check('70');
  pass('supplier FIFO payment keeps both cash balances consistent');
  console.log(`Supplier cash audit: ${passed} groups passed`);
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await disconnect?.();
  await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect();
  console.log('Functional regression schema removed');
}
