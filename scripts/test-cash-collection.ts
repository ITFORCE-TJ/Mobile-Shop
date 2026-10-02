// Cash collection (инкассация) against a disposable schema: sales at different rates paid in
// cash, by card/transfer and split, an expense and a refund paid from the register, then the full
// handover to Central Cash. Every sale raises the store's single register by its whole receipt,
// whatever the payment method. Expected TJS/USD figures are computed here independently.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { D } from '../server/src/common/decimal';

const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Disposable local database required');
const schema = `audit_fixes_cash_${Date.now()}_${process.pid}`;
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
  const seller = await login('ahmad', 'seller123');
  const partner = await login('partner', 'partner123');
  const setRate = async (rate: number) => assert.equal((await call(admin, 'POST', '/exchange-rate/today', { rate })).status, 200);

  let n = 0;
  const device = async (storeId = 'store-siyoma') => db.device.create({ data: { imei: `3599${String(++n).padStart(11, '0')}`, brand: 'Apple', model: 'iPhone', storage: '128GB', color: 'Black', storeId, status: 'STORE_STOCK', purchasePriceUsd: 50, costBasisUsd: 50 } });
  const registerUsd = async () => D((await db.store.findUniqueOrThrow({ where: { id: 'store-siyoma' } })).cashBalanceUsd);
  const sell = async (priceTjs: number, paymentMethod: string, cash: number, card: number, expectedUsd?: string) => {
    const d = await device();
    const before = await registerUsd();
    const r = await call(seller, 'POST', '/sales', { storeId: 'store-siyoma', items: [{ deviceId: d.id, salePriceTjs: priceTjs }], paymentMethod, cashAmountTjs: cash, cardAmountTjs: card });
    assert.equal(r.status, 201, JSON.stringify(r));
    if (expectedUsd !== undefined) {
      // The whole receipt reaches the register, by one ledger row with its TJS and USD.
      assert.equal((await registerUsd()).minus(before).toString(), expectedUsd, `${paymentMethod} ${priceTjs} TJS: register +$${expectedUsd}`);
      const row = await db.financialTransaction.findFirstOrThrow({ where: { sourceType: 'SALE', sourceId: r.data.id } });
      assert.equal(String(row.amountTjs), String(priceTjs));
      assert.equal(String(row.amountUsd), expectedUsd);
      assert.equal((await db.sale.findUniqueOrThrow({ where: { id: r.data.id } })).paymentMethod, paymentMethod);
    }
    return r.data;
  };

  // ---------- sales at three rates, every payment method ----------
  await setRate(10);
  const firstSale = await sell(1000, 'CASH', 1000, 0, '100');      // +1000 TJS / +$100
  await setRate(11);
  await sell(1100, 'CASH', 1100, 0, '100');                        // +1100 TJS / +$100
  await sell(2200, 'CARD', 0, 2200, '200');                        // card/transfer: +2200 TJS / +$200
  await sell(1650, 'SPLIT', 550, 1100, '150');                     // split: the whole +1650 TJS / +$150
  await setRate(12);
  await sell(1200, 'CASH', 1200, 0, '100');                        // +1200 TJS / +$100
  pass('CASH, CARD and SPLIT receipts each raise the store register by their whole amount; the method is kept on the sale')
  const expense = await call(admin, 'POST', '/expenses', { category: 'Аренда', amountTjs: 120, storeId: 'store-siyoma', paidFromCashRegister: true, comment: 'Хозтовары' });
  assert.equal(expense.status, 201, JSON.stringify(expense));    // −120 TJS / −$10
  const refund = await call(admin, 'POST', `/sales/${firstSale.id}/refund`, { reason: 'Брак', refundAmountTjs: 1000, penaltyFeeTjs: 0, paymentMethod: 'CASH' });
  assert.equal(refund.status, 200, JSON.stringify(refund));       // −1000 TJS at today's 12 → −$83.33

  const expectedTjs = D(1000).plus(1100).plus(2200).plus(1650).plus(1200).minus(120).minus(1000);                       // 6030
  const expectedUsd = D(100).plus(100).plus(200).plus(150).plus(100).minus(10).minus(D(1000).div(12).toDecimalPlaces(2)); // 556.67
  const register = async (id: string) => D((await db.store.findUniqueOrThrow({ where: { id } })).cashBalanceUsd);
  assert.equal((await register('store-siyoma')).toString(), expectedUsd.toString(), 'register USD before collection');
  pass(`store register after sales/expense/refund: ${expectedTjs} TJS = $${expectedUsd} (all payment methods, each at its own rate)`);

  // ---------- balances for the admin (ADMIN only) ----------
  const balances = await call(admin, 'GET', '/cash-collections/balances');
  assert.equal(balances.status, 200, JSON.stringify(balances));
  const siyoma = balances.data.stores.find((s: any) => s.storeId === 'store-siyoma');
  assert.equal(String(siyoma.cashTjs), expectedTjs.toString());
  assert.equal(String(siyoma.cashUsd), expectedUsd.toString());
  for (const token of [seller, partner]) {
    assert.equal((await call(token, 'GET', '/cash-collections/balances')).status, 403);
    assert.equal((await call(token, 'POST', '/cash-collections', { storeId: 'store-siyoma', expectedCashUsd: 1 })).status, 403);
  }
  pass('balances show TJS from historical rows and USD from the register; sellers and partners get 403');

  // ---------- snapshot of everything the collection must not touch ----------
  const untouched = async () => ({
    sales: (await db.sale.findMany({ orderBy: { id: 'asc' } })).map((s) => [s.id, String(s.totalTjs), String(s.totalUsd), s.status]),
    owners: (await db.owner.findMany({ orderBy: { id: 'asc' } })).map((o) => [o.id, String(o.capitalBalanceUsd), String(o.totalAccruedProfitUsd), String(o.availableProfitUsd)]),
    suppliers: (await db.supplier.findMany({ orderBy: { id: 'asc' } })).map((s) => [s.id, String(s.totalDebtUsd)]),
    expenses: (await db.expense.findMany({ orderBy: { id: 'asc' } })).map((e) => [e.id, String(e.amountTjs), String(e.amountUsd)]),
    companyCashUsd: (await db.store.findMany()).reduce((sum, s) => sum.plus(s.cashBalanceUsd), D(0)).toString(),
  });
  const before = await untouched();
  const centralBefore = await register('main-warehouse');
  const centralLedgerBefore = (await call(admin, 'GET', '/cash-collections/balances')).data.central;

  // ---------- stale confirmation is refused and changes nothing ----------
  const stale = await call(admin, 'POST', '/cash-collections', { storeId: 'store-siyoma', expectedCashUsd: '200.00' });
  assert.equal(stale.status, 409, JSON.stringify(stale));
  assert.deepEqual(await untouched(), before);
  pass('a collection confirmed for a different amount is refused (409) without any change');

  // ---------- the collection ----------
  const key = crypto.randomUUID();
  const collected = await call(admin, 'POST', '/cash-collections', { storeId: 'store-siyoma', expectedCashUsd: expectedUsd.toString(), comment: 'Вечерняя инкассация' }, key);
  assert.equal(collected.status, 201, JSON.stringify(collected));
  assert.equal(String(collected.data.amountTjs), expectedTjs.toString());
  assert.equal(String(collected.data.amountUsd), expectedUsd.toString());
  const replay = await call(admin, 'POST', '/cash-collections', { storeId: 'store-siyoma', expectedCashUsd: expectedUsd.toString(), comment: 'Вечерняя инкассация' }, key);
  assert.equal(replay.status, 201);
  assert.equal(replay.data.id, collected.data.id);
  assert.equal(await db.cashHandover.count(), 1);
  pass(`collected ${expectedTjs} TJS / $${expectedUsd}; a retried request returns the same document`);

  const after = await untouched();
  const balancesAfter = (await call(admin, 'GET', '/cash-collections/balances')).data;
  const storeAfter = balancesAfter.stores.find((s: any) => s.storeId === 'store-siyoma');
  assert.equal((await register('store-siyoma')).toString(), '0');
  assert.equal(String(storeAfter.cashTjs), '0');
  assert.equal(String(storeAfter.cashUsd), '0');
  assert.equal((await register('main-warehouse')).minus(centralBefore).toString(), expectedUsd.toString());
  assert.equal(D(balancesAfter.central.cashTjs).minus(centralLedgerBefore.cashTjs).toString(), expectedTjs.toString());
  assert.equal(D(balancesAfter.central.cashUsd).minus(centralLedgerBefore.cashUsd).toString(), expectedUsd.toString());
  assert.equal(after.companyCashUsd, before.companyCashUsd);
  assert.deepEqual({ ...after, companyCashUsd: '' }, { ...before, companyCashUsd: '' });
  pass('store is exactly 0 TJS / $0; Central Cash +same TJS/USD; company cash, sales, profit, capital, supplier debt, expenses unchanged');

  // ---------- document, audit, notification ----------
  const handover = await db.cashHandover.findUniqueOrThrow({ where: { id: collected.data.id } });
  assert.equal(handover.storeId, 'store-siyoma');
  assert.equal(String(handover.amountTjs), expectedTjs.toString());
  assert.equal(String(handover.amountUsd), expectedUsd.toString());
  assert.equal(handover.acceptedByName, 'Далер');
  const ledgerRow = await db.financialTransaction.findUniqueOrThrow({ where: { id: handover.financialTransactionId } });
  assert.equal(ledgerRow.type, 'TRANSFER');
  assert.equal(String(ledgerRow.amountTjs), expectedTjs.toString());
  assert.equal(String(ledgerRow.amountUsd), expectedUsd.toString());
  assert.equal(await db.auditLog.count({ where: { action: 'CASH_COLLECTION' } }), 1);
  const notes = await db.notification.findMany({ where: { actionType: 'CASH_COLLECTION' } });
  assert.equal(notes.length, 1);
  assert.equal(notes[0].targetRole, 'ADMIN');
  assert.equal(String(notes[0].amountTjs), expectedTjs.toString());
  assert.equal(String(notes[0].amountUsd), expectedUsd.toString());
  assert.equal(notes[0].storeId, 'store-siyoma');
  assert.equal(notes[0].documentRef, ledgerRow.transactionNumber);
  const sellerNotes = (await call(seller, 'GET', '/notifications')).data as any[];
  assert(!sellerNotes.some((x) => x.actionType === 'CASH_COLLECTION'));
  pass('one handover document (store, both amounts, employee, ledger reference), one audit row, one ADMIN-only notification');

  // ---------- repeated / concurrent collections ----------
  const empty = await call(admin, 'POST', '/cash-collections', { storeId: 'store-siyoma', expectedCashUsd: '0' });
  assert.equal(empty.status, 400, JSON.stringify(empty));
  await sell(330, 'CASH', 330, 0);                                 // +330 TJS at 12 → $27.50
  const two = await Promise.all([1, 2].map(() => call(admin, 'POST', '/cash-collections', { storeId: 'store-siyoma', expectedCashUsd: '27.5' })));
  assert.equal(two.filter((r) => r.status === 201).length, 1, JSON.stringify(two));
  assert(two.every((r) => [201, 400, 409].includes(r.status)), JSON.stringify(two));
  assert.equal((await register('store-siyoma')).toString(), '0');
  assert.equal(await db.cashHandover.count(), 2);
  pass('an empty register is refused; two simultaneous collections move the cash once, never below zero');

  // ---------- cancelling restores the historical amounts ----------
  const cancel = await call(admin, 'POST', `/cash-collections/${collected.data.id}/cancel`);
  assert.equal(cancel.status, 200, JSON.stringify(cancel));
  const restored = (await call(admin, 'GET', '/cash-collections/balances')).data.stores.find((s: any) => s.storeId === 'store-siyoma');
  assert.equal(String(restored.cashTjs), expectedTjs.toString());
  assert.equal(String(restored.cashUsd), expectedUsd.toString());
  pass('cancelling a collection returns exactly the same TJS and USD to the store');

  console.log(`Cash collection: ${passed} groups passed`);
} finally {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  await disconnect?.();
  await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect();
}
