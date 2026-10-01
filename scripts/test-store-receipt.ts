// Store receipt by IMEI against a disposable schema: the admin has 20 phones in the main
// warehouse and delivers 10 to Саховат; the seller scans them and completes one receipt.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { D } from '../server/src/common/decimal';

const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Disposable local database required');
const schema = `audit_fixes_receipt_${Date.now()}_${process.pid}`;
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
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api`;
  const call = async (token: string, method: string, path: string, body?: unknown, key: string = crypto.randomUUID()) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const login = async (l: string, p: string) => (await call('', 'POST', '/auth/login', { login: l, password: p })).data.token as string;
  const admin = await login('admin', 'admin123');
  assert.equal((await call(admin, 'POST', '/exchange-rate/today', { rate: 10.9 })).status, 200);

  // Саховат with its seller Фаридун; the seeded partner works in Сиёма.
  await db.store.create({ data: { id: 'store-sahovat', name: 'Саховат' } });
  const createdSeller = await call(admin, 'POST', '/users', { login: 'faridun', password: 'seller123', name: 'Фаридун', role: 'SELLER', storeId: 'store-sahovat' });
  assert.equal(createdSeller.status, 201, JSON.stringify(createdSeller));
  assert.equal((await call(admin, 'PATCH', '/users/user-partner', { storeId: 'store-siyoma' })).status, 200);
  const seller = await login('faridun', 'seller123');
  const partner = await login('partner', 'partner123');
  const otherSeller = await login('ahmad', 'seller123');

  const warehouse = await db.store.findFirstOrThrow({ where: { isMainWarehouse: true } });
  const imeis = Array.from({ length: 20 }, (_, i) => `35700000000${String(i).padStart(4, '0')}`);
  for (const [i, imei] of imeis.entries()) {
    await db.device.create({ data: { imei, brand: 'Apple', model: `iPhone ${13 + (i % 3)}`, ram: '6', storage: '128GB', color: 'Black', storeId: warehouse.id, status: 'MAIN_WAREHOUSE', purchasePriceUsd: 400 + i, costBasisUsd: 400 + i } });
  }
  const soldElsewhere = await db.device.create({ data: { imei: '357999999999990', brand: 'Apple', model: 'iPhone 12', storage: '64GB', color: 'White', storeId: 'store-siyoma', status: 'STORE_STOCK', purchasePriceUsd: 300, costBasisUsd: 300 } });

  // ---------- main warehouse is ADMIN only ----------
  for (const token of [seller, partner]) {
    const devices = (await call(token, 'GET', '/devices')).data as any[];
    assert(!devices.some((d) => d.storeId === warehouse.id), 'store staff must not list main warehouse devices');
    const viaQuery = (await call(token, 'GET', `/devices?storeId=${warehouse.id}`)).data as any[];
    assert(!viaQuery.some((d) => d.storeId === warehouse.id));
    const bySearch = (await call(token, 'GET', `/devices?search=${imeis[0]}`)).data as any[];
    assert.equal(bySearch.length, 0);
    const stores = (await call(token, 'GET', '/stores')).data as any[];
    const wh = stores.find((s) => s.isMainWarehouse);
    assert(wh && wh.cashBalanceUsd === undefined, 'main warehouse balance must be hidden');
    const pull = await call(token, 'POST', '/transfers', { fromStoreId: warehouse.id, toStoreId: token === seller ? 'store-sahovat' : 'store-siyoma', deviceIds: [] });
    assert.equal(pull.status, 403, JSON.stringify(pull));
  }
  pass('sellers and partners cannot list, search, query or pull main warehouse stock; its cash is hidden');

  // ---------- scanning ----------
  const lookup = await call(seller, 'POST', '/store-receipts/lookup', { imei: ` ${imeis[0]} ` });
  assert.equal(lookup.status, 200, JSON.stringify(lookup));
  assert.deepEqual(Object.keys(lookup.data).sort(), ['brand', 'color', 'id', 'imei', 'imei2', 'model', 'ram', 'storage'].sort());
  for (const [imei, expected] of [['000000000000000', 404], [soldElsewhere.imei, 409]] as const) {
    const r = await call(seller, 'POST', '/store-receipts/lookup', { imei });
    assert.equal(r.status, expected, `${imei}: ${JSON.stringify(r)}`);
    assert(typeof r.data.message === 'string' && r.data.message.length > 5);
  }
  assert.equal((await call(admin, 'POST', '/store-receipts/lookup', { imei: imeis[0] })).status, 403);
  pass('IMEI lookup returns model/RAM/storage/color only (no cost); unknown and elsewhere IMEIs are rejected with a reason');

  // ---------- completing the receipt ----------
  const ten = imeis.slice(0, 10);
  const bad = await call(seller, 'POST', '/store-receipts', { imeis: [ten[0], ten[0]] });
  assert.equal(bad.status, 400, JSON.stringify(bad));
  const mixed = await call(seller, 'POST', '/store-receipts', { imeis: [ten[0], soldElsewhere.imei] });
  assert.equal(mixed.status, 409, JSON.stringify(mixed));
  assert.equal(await db.device.count({ where: { storeId: warehouse.id } }), 20, 'a rejected receipt moves nothing');

  const before = {
    finance: await db.financialTransaction.count(),
    ledger: await db.ledgerEntry.count(),
    cash: (await db.store.findMany()).map((s) => [s.id, String(s.cashBalanceUsd)]),
    costs: (await db.device.findMany({ orderBy: { imei: 'asc' } })).map((d) => [d.imei, String(d.purchasePriceUsd), String(d.costBasisUsd)]),
  };
  const key = crypto.randomUUID();
  // The client cannot pick the destination: a manipulated storeId is ignored.
  const receipt = await call(seller, 'POST', '/store-receipts', { imeis: ten, storeId: 'store-siyoma' }, key);
  assert.equal(receipt.status, 201, JSON.stringify(receipt));
  assert.equal(receipt.data.itemCount, 10);
  assert.equal(receipt.data.storeId, 'store-sahovat');
  const replay = await call(seller, 'POST', '/store-receipts', { imeis: ten, storeId: 'store-siyoma' }, key);
  assert.equal(replay.data.id, receipt.data.id);
  assert.equal(await db.storeReceipt.count(), 1);
  assert.equal(await db.device.count({ where: { storeId: warehouse.id } }), 10);
  assert.equal(await db.device.count({ where: { storeId: 'store-sahovat', status: 'STORE_STOCK' } }), 10);
  const again = await call(seller, 'POST', '/store-receipts', { imeis: [ten[3]] });
  assert.equal(again.status, 409, 'an already received phone cannot be received twice');
  pass('10 phones received into Саховат in one receipt (destination forced to the seller store); a retry returns the same receipt');

  // ---------- concurrency ----------
  const race = await Promise.all([1, 2].map(() => call(seller, 'POST', '/store-receipts', { imeis: [imeis[10], imeis[11]] })));
  assert.equal(race.filter((r) => r.status === 201).length, 1, JSON.stringify(race));
  assert.equal(await db.device.count({ where: { storeId: 'store-sahovat' } }), 12);
  pass('two simultaneous receipts of the same phones: exactly one succeeds');

  // ---------- records ----------
  const items = await db.storeReceiptItem.findMany({ where: { receiptId: receipt.data.id } });
  assert.deepEqual(items.map((i) => i.imei).sort(), [...ten].sort());
  const timeline = await db.deviceTimelineEvent.count({ where: { type: 'RECEIPT', device: { imei: { in: ten } } } });
  assert.equal(timeline, 10);
  assert.equal(await db.auditLog.count({ where: { action: 'STORE_RECEIPT', targetId: receipt.data.id } }), 1);
  assert.deepEqual({ finance: await db.financialTransaction.count(), ledger: await db.ledgerEntry.count() }, { finance: before.finance, ledger: before.ledger });
  assert.deepEqual((await db.device.findMany({ orderBy: { imei: 'asc' } })).map((d) => [d.imei, String(d.purchasePriceUsd), String(d.costBasisUsd)]), before.costs);
  pass('receipt items, device movement history and audit entry recorded; no money moved and purchase costs kept');

  // ---------- notification ----------
  const notes = await db.notification.findMany({ where: { actionType: 'STORE_RECEIPT', targetId: receipt.data.id } });
  assert.equal(notes.length, 1);
  assert.equal(notes[0].message, 'Саховат — продавец Фаридун оприходовал 10 телефонов.');
  assert.equal(notes[0].targetRole, 'ADMIN');
  assert.equal(notes[0].documentRef, receipt.data.receiptNumber);
  assert.deepEqual(((notes[0].details as any).imeis as string[]).sort(), [...ten].sort());
  assert((await call(seller, 'GET', '/notifications')).data.every((n: any) => n.actionType !== 'STORE_RECEIPT'));
  const adminNotes = (await call(admin, 'GET', '/notifications')).data as any[];
  assert(adminNotes.some((n) => n.id === notes[0].id && n.storeName === 'Саховат' && n.actorName === 'Фаридун'));
  pass('ADMIN gets one notification for the whole receipt (text, IMEIs, document, link); store staff never see it');

  // ---------- selling before acknowledgement ----------
  const received = await db.device.findUniqueOrThrow({ where: { imei: ten[0] } });
  const saleKey = crypto.randomUUID();
  const saleBody = { storeId: 'store-sahovat', items: [{ deviceId: received.id, salePriceTjs: 9000 }], paymentMethod: 'CASH', cashAmountTjs: 9000, cardAmountTjs: 0 };
  const sale = await call(seller, 'POST', '/sales', saleBody, saleKey);
  assert.equal(sale.status, 201, JSON.stringify(sale));
  assert.equal((await call(seller, 'POST', '/sales', saleBody, saleKey)).data.id, sale.data.id);
  pass('the seller sells a received phone before the admin has looked at the receipt');

  // Every audited business event notifies the admin once, from the backend, even on a retry.
  const saleNotes = await db.notification.findMany({ where: { actionType: 'SALE', targetId: sale.data.id } });
  assert.equal(saleNotes.length, 1, 'one notification for the sale despite the retried request');
  assert.equal(saleNotes[0].targetRole, 'ADMIN');
  assert.equal(saleNotes[0].storeName, 'Саховат');
  assert.equal(saleNotes[0].actorName, 'Фаридун');
  assert.equal(String(saleNotes[0].amountTjs), '9000');
  assert.equal(saleNotes[0].targetRoute, '/sales-history');
  pass('the sale notifies the admin once (store, employee, amount, link) — generated by the backend audit event');

  // ---------- viewing and acknowledgement ----------
  assert.equal((await call(seller, 'GET', `/store-receipts/${receipt.data.id}`)).status, 200);
  assert.equal((await call(otherSeller, 'GET', `/store-receipts/${receipt.data.id}`)).status, 404);
  assert.equal((await call(seller, 'POST', `/store-receipts/${receipt.data.id}/acknowledge`)).status, 403);
  const snapshot = async () => ({
    devices: (await db.device.findMany({ orderBy: { imei: 'asc' } })).map((d) => [d.imei, d.storeId, d.status]),
    cash: (await db.store.findMany({ orderBy: { id: 'asc' } })).map((s) => [s.id, String(s.cashBalanceUsd)]),
    owners: (await db.owner.findMany({ orderBy: { id: 'asc' } })).map((o) => [o.id, String(o.availableProfitUsd), String(o.capitalBalanceUsd)]),
    receipts: await db.storeReceipt.count(),
    finance: await db.financialTransaction.count(),
  });
  const beforeAck = await snapshot();
  const ack = await call(admin, 'POST', `/store-receipts/${receipt.data.id}/acknowledge`);
  assert.equal(ack.status, 200, JSON.stringify(ack));
  assert(ack.data.acknowledgedAt);
  assert.equal(ack.data.acknowledgedByName, 'Далер');
  const ackAgain = await call(admin, 'POST', `/store-receipts/${receipt.data.id}/acknowledge`);
  assert.equal(ackAgain.status, 200);
  assert.equal(ackAgain.data.acknowledgedAt, ack.data.acknowledgedAt);
  assert.deepEqual(await snapshot(), beforeAck);
  assert(D(String((await db.notification.findUniqueOrThrow({ where: { id: notes[0].id } })).read ? 1 : 0)).eq(1));
  pass('acknowledgement only marks the receipt reviewed (and its notification read): no stock, cash, profit or receipt change');

  console.log(`Store receipt: ${passed} groups passed`);
} finally {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  await disconnect?.();
  await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect();
}
