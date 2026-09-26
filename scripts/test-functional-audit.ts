import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Disposable local database required');
const schema = `audit_fixes_functional_${Date.now()}_${process.pid}`;
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
  assert.equal((await api('POST', '/stores/store-siyoma/adjust-cash', { newBalanceTjs: 10000, reason: 'Test fixture' })).status, 200);
  const adjustment = await db.financialTransaction.findFirstOrThrow({ where: { sourceType: 'STORE_ADJUSTMENT', sourceId: 'store-siyoma' } });
  assert(adjustment.amountTjs.eq(10000));
  assert.equal(adjustment.direction, 'IN');
  assert.equal(adjustment.type, 'ADJUSTMENT');
  const cash = async () => (await db.store.findUniqueOrThrow({ where: { id: 'store-siyoma' } })).cashBalanceTjs.toString();
  const expense = { category: 'OTHER', amountTjs: '12.34', storeId: 'store-siyoma', paidFromCashRegister: true };
  const retries = await Promise.all([api('POST', '/expenses', expense, 'same-expense'), api('POST', '/expenses', expense, 'same-expense')]);
  assert.deepEqual(retries.map(r => r.status), [201, 201]);
  assert.equal(retries[0].data.id, retries[1].data.id);
  assert.equal(await db.expense.count(), 1);
  assert.equal(await cash(), '9987.66');
  assert.equal((await api('POST', '/expenses', { ...expense, amountTjs: 99 }, 'same-expense')).status, 409);
  assert.equal((await api('POST', '/expenses', expense, 'same-expense')).data.id, retries[0].data.id);
  pass('persistent atomic idempotency, simultaneous replay and changed-payload conflict');

  const failed = await api('POST', '/expenses', { ...expense, amountTjs: 999999 }, 'failed-expense');
  assert.equal(failed.status, 400);
  const storedFailure = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM operation_requests WHERE key = 'user-admin:failed-expense'`;
  assert.equal(Number(storedFailure[0].count), 0);
  assert.equal(await db.expense.count(), 1);
  pass('failed operation rolls back data and idempotency record');

  const purchase = (number: string, items: { imei: string; imei2?: string }[], price = 1) => api('POST', '/purchases', {
    supplierId: 'sup-dubai', invoiceNumber: number, storeId: 'main-warehouse', groups: [{ brand: 'Audit', model: 'Phone', storage: '128', color: 'Black', purchasePriceUsd: price, items }],
  });
  const p = await purchase('ROUND', [{ imei: '350000000000001' }, { imei: '350000000000002' }, { imei: '350000000000003' }]);
  assert.equal(p.status, 201);
  const invoiceId = p.data.invoice.id;
  assert.equal((await api('PUT', `/supplier-invoices/${invoiceId}`, { totalAmountUsd: 1 })).status, 200);
  const devices = await db.device.findMany({ where: { purchaseInvoiceId: invoiceId } });
  assert.equal(devices.reduce((a, d) => a.plus(d.costBasisUsd), new (devices[0].costBasisUsd.constructor as any)(0)).toString(), '1');
  const groups = await db.invoiceGroup.findMany({ where: { invoiceId } });
  assert.equal(groups.reduce((a, g) => a.plus(g.purchasePriceUsd.mul(g.quantity)), new (devices[0].costBasisUsd.constructor as any)(0)).toString(), '1');
  pass('invoice/device/group cent reconciliation');
  const concurrentEdits = await Promise.all([api('PUT', `/supplier-invoices/${invoiceId}`, { totalAmountUsd: 4 }), api('PUT', `/supplier-invoices/${invoiceId}`, { totalAmountUsd: 5 })]);
  assert(concurrentEdits.every(r => r.status === 200));
  const supplier = await db.supplier.findUniqueOrThrow({ where: { id: 'sup-dubai' } });
  const invoice = await db.supplierInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  assert.equal(supplier.totalDebtUsd.toString(), invoice.totalAmountUsd.toString());
  pass('parallel invoice edits preserve supplier debt');
  const paymentBody = { amountUsd: 0.5, storeId: 'store-siyoma' };
  const payments = await Promise.all([api('POST', `/supplier-invoices/${invoiceId}/payments`, paymentBody, 'same-payment'), api('POST', `/supplier-invoices/${invoiceId}/payments`, paymentBody, 'same-payment')]);
  assert(payments.every(r => r.status === 201));
  assert.equal(await db.supplierPayment.count(), 1);
  assert.equal((await api('PUT', `/supplier-invoices/${invoiceId}`, { totalAmountUsd: 0.49 })).status, 400);
  pass('supplier payment retry and below-paid invoice boundary');

  const imeiRace = await Promise.all([purchase('IMEI-A', [{ imei: '350000000000011', imei2: '350000000000012' }]), purchase('IMEI-B', [{ imei: '350000000000012', imei2: '350000000000011' }])]);
  assert.equal(imeiRace.filter(r => r.status === 201).length, 1);
  assert.equal(await db.device.count({ where: { OR: [{ imei: '350000000000011' }, { imei2: '350000000000011' }] } }), 1);
  pass('concurrent cross-slot IMEI uniqueness');

  const store = await api('POST', '/stores', { name: 'Audit nonzero' });
  await api('POST', `/stores/${store.data.id}/adjust-cash`, { newBalanceTjs: 100, reason: 'fixture' });
  assert.equal((await api('DELETE', `/stores/${store.data.id}`)).status, 400);
  assert.equal((await db.store.findUniqueOrThrow({ where: { id: store.data.id } })).cashBalanceTjs.toString(), '100');
  pass('nonzero cash register cannot be deleted');

  await db.owner.updateMany({ data: { totalAccruedProfitUsd: 100, availableProfitUsd: 100 } });
  await api('POST', '/owners/owner-admin/investment', { amountUsd: 100 });
  assert.equal((await api('POST', '/owners/owner-admin/payout', { amountUsd: 5 })).status, 200);
  const shares = [{ ownerId: 'owner-admin', sharePercent: 60 }, { ownerId: 'owner-partner', sharePercent: 40 }];
  assert.equal((await api('POST', '/owners/profit-shares', { shares, rebalanceBalances: true })).status, 400);
  assert.equal((await api('POST', '/owners/profit-shares', { shares })).status, 200);
  for (const o of await db.owner.findMany()) assert(o.availableProfitUsd.eq(o.totalAccruedProfitUsd.minus(o.totalPaidProfitUsd).minus(o.totalReinvestedUsd)));
  await api('POST', '/owners/owner-partner/link-user', { userId: null });
  assert.equal((await api('GET', '/owners')).data.find((o: any) => o.id === 'owner-partner').userId, null);
  pass('partner settlement identity and explicit unlink persist');

  assert.equal((await api('POST', '/users', { login: 'invalid', password: 'test-only-password', name: 'Invalid', role: 'SELLER', storeId: 'store-siyoma', baseSalaryTjs: -1 })).status, 400);
  assert.equal((await api('PATCH', '/users/user-ahmad', { salesCommissionPercent: 150 })).status, 400);
  assert.equal((await api('PATCH', '/users/user-ahmad/status', { active: 'false' })).status, 400);
  assert.equal((await api('PUT', '/suppliers/sup-dubai', { name: '   ' })).status, 400);
  pass('invalid compensation, boolean and blank supplier rejected');

  const racePurchase = await api('POST', '/purchases', { supplierId: 'sup-china', invoiceNumber: 'SALE-EDIT-RACE', storeId: 'store-siyoma', groups: [{ brand: 'Audit', model: 'Race', storage: '128', color: 'Black', purchasePriceUsd: 10, items: [{ imei: '350000000000099' }] }] });
  assert.equal(racePurchase.status, 201);
  const raceId = racePurchase.data.invoice.id;
  const raceDeviceId = racePurchase.data.devices[0].id;
  const [saleRace, editRace] = await Promise.all([
    api('POST', '/sales', { storeId: 'store-siyoma', paymentMethod: 'CASH', items: [{ deviceId: raceDeviceId, salePriceTjs: 200 }] }),
    api('PUT', '/supplier-invoices/' + raceId, { totalAmountUsd: 12 }),
  ]);
  assert.equal(saleRace.status, 201);
  assert([200, 400].includes(editRace.status));
  const saleItem = await db.saleItem.findFirstOrThrow({ where: { deviceId: raceDeviceId } });
  const soldDevice = await db.device.findUniqueOrThrow({ where: { id: raceDeviceId } });
  assert(saleItem.costBasisUsd.eq(soldDevice.costBasisUsd));
  pass('sale racing invoice repricing snapshots the committed cost');

  const createdSupplier = await api('POST', '/suppliers', { name: 'Audit CRUD' }, 'supplier-create');
  assert.equal(createdSupplier.status, 201);
  assert.equal((await api('POST', '/suppliers', { name: 'Audit CRUD' }, 'supplier-create')).data.id, createdSupplier.data.id);
  assert.equal((await api('PUT', '/suppliers/' + createdSupplier.data.id, { name: 'Audit Updated' })).status, 200);
  assert.equal((await api('DELETE', '/suppliers/' + createdSupplier.data.id)).status, 200);
  assert.equal(await db.auditLog.count({ where: { targetId: createdSupplier.data.id } }), 3);
  pass('supplier CRUD is audited and create retry does not duplicate');

  const repairBase = { storeId: 'store-siyoma', imei: '350000000000098', brand: 'Audit', model: 'Repair', problemDescription: 'Test' };
  assert.equal((await api('POST', '/repairs', { ...repairBase, estimatedCostTjs: -1 })).status, 400);
  assert.equal((await api('POST', '/repairs', { ...repairBase, prepaymentTjs: 1 })).status, 400);
  pass('repair rejects negative estimates and unsupported unbooked prepayment');

  await db.auditLog.createMany({ data: Array.from({ length: 501 }, (_, i) => ({ userId: 'user-admin', userName: 'Audit', userRole: 'ADMIN', action: 'AUDIT_TEST', details: String(i) })) });
  const seen = new Set<string>();
  let cursor: string | undefined;
  while (true) {
    const batch = await api('GET', '/audit-logs?limit=200' + (cursor ? '&cursor=' + cursor : ''));
    assert.equal(batch.status, 200);
    for (const row of batch.data) { assert(!seen.has(row.id)); seen.add(row.id); }
    if (batch.data.length < 200) break;
    cursor = batch.data.at(-1).id;
  }
  assert.equal(seen.size, await db.auditLog.count());
  pass('cursor history returns all records beyond 500 with tied timestamps');
  await db.notification.create({ data: { id: 'scoped-notification', title: 'Private', message: 'Test', targetUserId: 'user-partner', targetRole: 'ADMIN' } });
  assert(!(await api('GET', '/notifications')).data.some((n: any) => n.id === 'scoped-notification'));
  assert.equal((await api('PATCH', '/notifications/scoped-notification/read')).status, 404);
  await api('POST', '/notifications/read-all');
  assert.equal((await db.notification.findUniqueOrThrow({ where: { id: 'scoped-notification' } })).read, false);
  pass('notification recipient and role restrictions are both enforced');
  token = (await api('POST', '/auth/login', { login: 'partner', password: 'partner123' })).data.token;
  assert.equal((await purchase('FORBIDDEN', [{ imei: '350000000000021' }])).status, 403);
  pass('main warehouse purchase permission enforced on backend');
  console.log(`Functional regressions: ${passed} passed`);
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await disconnect?.();
  await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect();
  console.log('Functional regression schema removed');
}
