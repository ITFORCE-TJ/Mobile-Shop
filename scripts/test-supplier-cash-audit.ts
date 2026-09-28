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
  const purchase = await api('POST', '/purchases', { supplierId: 'sup-dubai', invoiceNumber: 'CASH-RECONCILE', storeId: warehouse.id, groups: [{ brand: 'Test', model: 'Phone', storage: '128', color: 'Black', purchasePriceUsd: 100, items: [{ imei: '350000000000001' }] }] });
  assert.equal(purchase.status, 201, JSON.stringify(purchase));
  const endpoint = `/supplier-invoices/${purchase.data.invoice.id}/payments`;
  await db.store.update({ where: { id: warehouse.id }, data: { cashBalanceTjs: 1000 } });
  const payment = { amountUsd: 10, sourceAccount: 'STORE_CASH', storeId: warehouse.id };
  const result = await api('POST', endpoint, payment, 'invoice-pay');
  assert.equal(result.status, 201, JSON.stringify(result));
  const check = async (expected: string) => {
    const store = await db.store.findUniqueOrThrow({ where: { id: warehouse.id } });
    const account = await db.financialAccount.findUniqueOrThrow({ where: { storeId: warehouse.id } });
    assert.equal(store.cashBalanceTjs.toString(), expected); assert(account.balanceTjs.eq(store.cashBalanceTjs));
  };
  await check('900');
  assert.equal(await db.financialTransaction.count({ where: { sourceType: 'CASH_LEDGER_RECONCILIATION' } }), 1);
  assert.equal(await db.auditLog.count({ where: { action: 'CASH_LEDGER_RECONCILIATION' } }), 1);
  pass('legacy cash with empty financial account: invoice paid; mirror reconciled and audited');
  assert.equal((await api('POST', endpoint, payment, 'invoice-pay')).status, 201);
  await check('900'); assert.equal(await db.supplierPayment.count(), 1);
  assert.equal((await api('POST', endpoint, payment, 'invoice-pay-2')).status, 201);
  await check('800');
  assert.equal(await db.financialTransaction.count({ where: { sourceType: 'CASH_LEDGER_RECONCILIATION' } }), 1);
  pass('retry does not pay twice; subsequent payment does not repeat reconciliation');
  const before = await db.supplierPayment.count();
  await db.store.update({ where: { id: warehouse.id }, data: { cashBalanceTjs: 0 } });
  assert.equal((await api('POST', endpoint, payment, 'insufficient')).status, 400);
  assert.equal(await db.supplierPayment.count(), before);
  const account = await db.financialAccount.findUniqueOrThrow({ where: { storeId: warehouse.id } });
  assert.equal(account.balanceTjs.toString(), '800');
  assert.equal(await db.financialTransaction.count({ where: { sourceType: 'CASH_LEDGER_RECONCILIATION' } }), 1);
  pass('real cash shortage rejected; payment and reconciliation both rolled back');
  await db.store.update({ where: { id: warehouse.id }, data: { cashBalanceTjs: 800 } });
  const fifo = await api('POST', '/suppliers/sup-dubai/payments', payment, 'fifo-payment');
  assert.equal(fifo.status, 201, JSON.stringify(fifo));
  await check('700');
  pass('supplier FIFO payment keeps both cash balances consistent');
  console.log(`Supplier cash audit: ${passed} groups passed`);
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await disconnect?.();
  await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect();
  console.log('Functional regression schema removed');
}
