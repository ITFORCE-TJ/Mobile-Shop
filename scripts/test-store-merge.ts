// Merging a store into another, on the real database: works after the store had cash
// collections, carries its register over by one ledger transfer (both currencies), leaves every
// existing journal row exactly as it was, and closes the source store instead of deleting it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Prisma } from '@prisma/client';
import { withDisposableApi } from './lib/disposable-api';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
let passed = 0;
const pass = (s: string) => { passed++; console.log(`PASS ${s}`); };

await withDisposableApi('merge', async ({ db, env, call }) => {
  const setRate = async (rate: number) => assert.equal((await call('POST', '/exchange-rate/today', { rate })).status, 200);
  let n = 0;
  // A phone bought on credit (supplier debt = its cost) keeps the books balanced.
  const sell = async (storeId: string, tjs: number, cost: number, isBonus = false) => {
    if (cost > 0) await db.supplier.update({ where: { id: 'sup-dubai' }, data: { totalDebtUsd: { increment: cost } } });
    const d = await db.device.create({ data: { imei: `3561${String(++n).padStart(11, '0')}`, brand: 'T', model: 'M', storage: '1', color: 'c', status: 'STORE_STOCK', storeId, isBonus, bonusCampaign: isBonus ? 'Акция' : null, purchasePriceUsd: cost, costBasisUsd: cost } });
    const r = await call('POST', '/sales', { storeId, items: [{ deviceId: d.id, salePriceTjs: tjs }], paymentMethod: 'CASH' });
    assert.equal(r.status, 201, JSON.stringify(r));
  };
  const ledger = async (accountId: string) => {
    const rows = await db.financialTransaction.findMany({ where: { balanceCurrency: 'USD', OR: [{ accountId }, { destinationAccountId: accountId }] } });
    let tjs = D(0); let usd = D(0);
    for (const r of rows) {
      const sign = r.accountId === accountId ? (r.direction === 'IN' ? 1 : -1) : 1;
      tjs = tjs.plus(D(r.amountTjs).mul(sign)); usd = usd.plus(D(r.amountUsd).mul(sign));
    }
    return { tjs, usd };
  };
  const reg = async (storeId: string) => {
    const s = await db.store.findUniqueOrThrow({ where: { id: storeId } });
    const a = await db.financialAccount.findUniqueOrThrow({ where: { storeId } });
    const l = await ledger(a.id);
    return { usd: D(s.cashBalanceUsd), account: D(a.balanceUsd), ledgerUsd: l.usd, ledgerTjs: l.tjs, active: s.active, accountActive: a.active };
  };
  const journal = async () => ({
    ft: (await db.financialTransaction.findMany({ orderBy: { id: 'asc' } })).map((t) => [t.id, t.accountId, t.destinationAccountId, t.shopId, String(t.amountTjs), String(t.amountUsd), t.status]),
    ledger: (await db.ledgerEntry.findMany({ orderBy: { id: 'asc' } })).map((e) => [e.id, e.storeId, String(e.amountUsd ?? '')]),
  });

  // Store X: sales at two rates, a bonus phone, a collection, more sales and an expense.
  await db.store.create({ data: { id: 'store-x', name: 'Магазин X' } });
  await setRate(10);
  await sell('store-x', 1000, 50);                // $100
  await sell('store-x', 500, 0, true);            // $50 bonus phone
  const collected = await call('POST', '/cash-collections', { storeId: 'store-x', expectedCashUsd: '150' });
  assert.equal(collected.status, 201, JSON.stringify(collected));
  await setRate(11);
  await sell('store-x', 2200, 100);               // $200
  const expense = await call('POST', '/expenses', { category: 'Аренда', amountTjs: 110, storeId: 'store-x', paidFromCashRegister: true, comment: 'test' });
  assert.equal(expense.status, 201, JSON.stringify(expense));  // −$10
  const x0 = await reg('store-x');
  assert.equal(x0.usd.toString(), '190');
  assert.equal(x0.ledgerTjs.toString(), '2090');
  const target0 = await reg('store-siyoma').catch(async () => {
    // Сиёма has had no cash activity yet: its account is created on first use.
    return { usd: D(0), account: D(0), ledgerUsd: D(0), ledgerTjs: D(0), active: true, accountActive: true };
  });
  const before = await journal();

  // Refusals change nothing.
  assert.equal((await call('POST', '/stores/main-warehouse/merge', { targetStoreId: 'store-siyoma' })).status, 400);
  assert.equal((await call('POST', '/stores/store-x/merge', { targetStoreId: 'store-x' })).status, 400);
  assert.deepEqual(await journal(), before);
  pass('merging the main warehouse or a store into itself is refused without changes');

  // The merge.
  const merged = await call('POST', '/stores/store-x/merge', { targetStoreId: 'store-siyoma' });
  assert.equal(merged.status, 200, JSON.stringify(merged));
  const after = await journal();
  const oldIds = new Set(before.ft.map((r) => r[0]));
  assert.deepEqual(after.ft.filter((r) => oldIds.has(r[0] as string)), before.ft, 'existing ledger transactions untouched');
  assert.deepEqual(after.ledger.filter((e) => before.ledger.some((b) => b[0] === e[0])), before.ledger, 'existing journal entries untouched');
  const added = await db.financialTransaction.findMany({ where: { id: { notIn: [...oldIds] as string[] } } });
  assert.equal(added.length, 1, 'one closing transfer');
  assert.equal(added[0].type, 'TRANSFER');
  assert.equal(added[0].sourceType, 'STORE_MERGE');
  assert.equal(String(added[0].amountUsd), '190');
  assert.equal(String(added[0].amountTjs), '2090');
  pass('existing journal rows are not rewritten; one closing transfer carries $190 / 2090 TJS');

  const x1 = await reg('store-x');
  const t1 = await reg('store-siyoma');
  assert.equal(x1.usd.toString(), '0'); assert.equal(x1.account.toString(), '0'); assert.equal(x1.ledgerTjs.toString(), '0');
  assert.equal(x1.active, false); assert.equal(x1.accountActive, false);
  assert.equal(t1.usd.minus(target0.usd).toString(), '190');
  assert.equal(t1.ledgerTjs.minus(target0.ledgerTjs).toString(), '2090');
  assert.equal(t1.usd.toString(), t1.account.toString()); assert.equal(t1.account.toString(), t1.ledgerUsd.toString());
  pass('X: register $0 / 0 TJS, store and account closed; Сиёма: +$190 / +2090 TJS, register = account = ledger');

  for (const [model, where] of [
    ['sale', { storeId: 'store-x' }], ['device', { storeId: 'store-x' }], ['expense', { storeId: 'store-x' }], ['cashHandover', { storeId: 'store-x' }],
  ] as const) {
    assert.equal(await (db as any)[model].count({ where }), 0, `${model} moved to the target store`);
  }
  assert.equal(await db.cashHandover.count({ where: { storeId: 'store-siyoma' } }), 1);
  const stores = await call('GET', '/stores');
  assert(!stores.data.some((s: { id: string }) => s.id === 'store-x'), 'closed store not listed');
  const report = await call('GET', '/reports/summary?period=ALL');
  assert(!report.data.storeBreakdown.some((s: { storeId: string }) => s.storeId === 'store-x'), 'closed store not in reports');
  assert.equal((await call('POST', '/stores/store-x/merge', { targetStoreId: 'store-siyoma' })).status, 400, 'a closed store cannot be merged again');
  assert.equal((await call('POST', '/stores/store-siyoma/merge', { targetStoreId: 'store-x' })).status, 400, 'nothing can be merged into a closed store');
  pass('sales, stock, expenses and collections now belong to Сиёма; X is gone from store lists and reports; merging again is refused');

  // Сиёма's next collection: the bonus phone was collected before, so nothing is bonus now.
  const bonus0 = await db.financialAccount.findUnique({ where: { systemKey: 'BONUS_ACCOUNT' } });
  const next = await call('POST', '/cash-collections', { storeId: 'store-siyoma', expectedCashUsd: t1.usd.toString() });
  assert.equal(next.status, 201, JSON.stringify(next));
  assert.equal(String(next.data.regularAmountUsd), t1.usd.toString());
  assert.equal(String(next.data.bonusAmountUsd), '0');
  assert.equal(String((await db.financialAccount.findUnique({ where: { systemKey: 'BONUS_ACCOUNT' } }))?.balanceUsd), String(bonus0?.balanceUsd));
  pass('the merged store\'s next collection works; its already collected bonus phone is not collected again');

  const check = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-owner-balances.ts'], { env, encoding: 'utf8', timeout: 120000 });
  assert.match(check.stdout, /Расхождений нет/, check.stdout + check.stderr);
  pass('owner capital reconciliation still passes');
});

console.log(`\nStore merge: ${passed} checks passed`);
