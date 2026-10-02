// Admin control of bonuses, on the real database:
//  - removing old bonus accruals (cash bonuses booked as owner profit, distributed bonus pool):
//    owners' profit goes back by exactly what was booked, with journal and audit, once;
//  - the Bonus Account: transfer to Central Cash, payout, and their cancellation — each one
//    ledger posting with its historical TJS share, never overdrawn, never owner profit.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Prisma } from '@prisma/client';
import { withDisposableApi } from './lib/disposable-api';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
let passed = 0;
const pass = (s: string) => { passed++; console.log(`PASS ${s}`); };

await withDisposableApi('bonusadmin', async ({ db, env, call, login }) => {
  const setRate = async (rate: number) => assert.equal((await call('POST', '/exchange-rate/today', { rate })).status, 200);
  const owners = async () => Object.fromEntries((await db.owner.findMany()).map((o) => [o.id, [String(o.totalAccruedProfitUsd), String(o.availableProfitUsd)]]));
  const ledger = async (accountId: string) => {
    const rows = await db.financialTransaction.findMany({ where: { balanceCurrency: 'USD', OR: [{ accountId }, { destinationAccountId: accountId }] } });
    let tjs = D(0); let usd = D(0);
    for (const r of rows) { const sign = r.accountId === accountId ? (r.direction === 'IN' ? 1 : -1) : 1; tjs = tjs.plus(D(r.amountTjs).mul(sign)); usd = usd.plus(D(r.amountUsd).mul(sign)); }
    return { tjs, usd };
  };
  const bonus = async () => {
    const a = await db.financialAccount.findUniqueOrThrow({ where: { systemKey: 'BONUS_ACCOUNT' } });
    const l = await ledger(a.id);
    assert.equal(String(a.balanceUsd), l.usd.toString(), 'Bonus Account cached = ledger');
    return { usd: D(a.balanceUsd), tjs: l.tjs };
  };
  const central = async () => {
    const s = await db.store.findUniqueOrThrow({ where: { id: 'main-warehouse' } });
    // Created on first use: a fresh database has no Central Cash account yet.
    const a = await db.financialAccount.findUnique({ where: { storeId: 'main-warehouse' } });
    const l = a ? await ledger(a.id) : { usd: D(0), tjs: D(0) };
    assert.equal(String(s.cashBalanceUsd), String(a?.balanceUsd ?? 0), 'central register = account');
    assert.equal(String(a?.balanceUsd ?? 0), l.usd.toString(), 'central account = ledger');
    return { usd: D(s.cashBalanceUsd), tjs: l.tjs };
  };

  // ---------- old accruals: a cash bonus booked as owner profit + a distributed bonus pool ----------
  await setRate(10);
  const cash = await call('POST', '/supplier-bonuses', { supplierId: 'sup-dubai', campaignTitle: 'Старый бонус', bonusType: 'CASH_DISCOUNT', amountUsd: 300 });
  assert.equal(cash.status, 201, JSON.stringify(cash));
  // What the earlier version recorded for it: owner profit + a journal line.
  await db.supplierBonus.update({ where: { id: cash.data.id }, data: { ownerProfitAllocations: [{ ownerId: 'owner-admin', amountUsd: 300 }] } });
  await db.owner.update({ where: { id: 'owner-admin' }, data: { totalAccruedProfitUsd: { increment: 300 }, availableProfitUsd: { increment: 300 } } });
  await db.ledgerEntry.create({ data: { type: 'SUPPLIER_BONUS', description: 'Денежный бонус (старая версия): +$300', amountUsd: 300, exchangeRate: 10, userName: 'test', referenceId: cash.data.id } });
  // A free bonus phone sold, its $150 distributed 90/60 by the earlier version.
  const phone = await db.device.create({ data: { imei: '356900000000001', brand: 'T', model: 'Bonus', storage: '1', color: 'c', status: 'STORE_STOCK', storeId: 'store-siyoma', isBonus: true, bonusCampaign: 'Акция', purchasePriceUsd: 0, costBasisUsd: 0 } });
  assert.equal((await call('POST', '/sales', { storeId: 'store-siyoma', items: [{ deviceId: phone.id, salePriceTjs: 1500 }], paymentMethod: 'CASH' })).status, 201);
  const entry = await db.bonusPoolEntry.findFirstOrThrow({ where: { deviceId: phone.id } });
  const log = await db.bonusDistributionLog.create({ data: { periodName: 'Старое распределение', totalAmountUsd: 150, type: 'DISTRIBUTION', allocations: [{ ownerId: 'owner-admin', amountUsd: 90 }, { ownerId: 'owner-partner', amountUsd: 60 }], performedByUserId: 'user-admin' } });
  await db.bonusPoolEntry.update({ where: { id: entry.id }, data: { status: 'DISTRIBUTED', distributionId: log.id, distributedAt: new Date() } });
  await db.owner.update({ where: { id: 'owner-admin' }, data: { totalAccruedProfitUsd: { increment: 90 }, availableProfitUsd: { increment: 90 } } });
  await db.owner.update({ where: { id: 'owner-partner' }, data: { totalAccruedProfitUsd: { increment: 60 }, availableProfitUsd: { increment: 60 } } });

  const preview = await call('GET', '/bonuses/legacy-accruals');
  assert.equal(preview.status, 200, JSON.stringify(preview));
  assert.equal(String(preview.data.totalUsd), '450');
  const perOwner = Object.fromEntries(preview.data.perOwner.map((o: any) => [o.ownerId, String(o.amountUsd)]));
  assert.deepEqual(perOwner, { 'owner-admin': '390', 'owner-partner': '60' });
  const seller = await login('ahmad', 'seller123');
  assert.equal((await call('GET', '/bonuses/legacy-accruals', undefined, { token: seller })).status, 403);
  pass('preview lists old accruals: $300 cash bonus + $150 distributed pool = $450 (admin $390, partner $60); admin only');

  const before = { owners: await owners(), bonus: await bonus(), central: await central() };
  const stale = await call('POST', '/bonuses/legacy-accruals/reverse', { expectedTotalUsd: 400 });
  assert.equal(stale.status, 409, JSON.stringify(stale));
  assert.deepEqual(await owners(), before.owners);
  const done = await call('POST', '/bonuses/legacy-accruals/reverse', { expectedTotalUsd: 450 });
  assert.equal(done.status, 200, JSON.stringify(done));
  const after = await owners();
  assert.equal(D(after['owner-admin'][0]).minus(before.owners['owner-admin'][0]).toString(), '-390');
  assert.equal(D(after['owner-admin'][1]).minus(before.owners['owner-admin'][1]).toString(), '-390');
  assert.equal(D(after['owner-partner'][1]).minus(before.owners['owner-partner'][1]).toString(), '-60');
  assert.deepEqual((await db.supplierBonus.findUniqueOrThrow({ where: { id: cash.data.id } })).ownerProfitAllocations, []);
  assert.notEqual((await db.bonusPoolEntry.findUniqueOrThrow({ where: { id: entry.id } })).annulledAt, null);
  assert.equal(await db.ledgerEntry.count({ where: { referenceId: cash.data.id, amountUsd: -300 } }), 1, 'journal reversal');
  assert.equal(await db.auditLog.count({ where: { action: 'BONUS_LEGACY_ACCRUAL_REVERSED' } }), 1);
  assert.deepEqual({ bonus: await bonus(), central: await central() }, { bonus: before.bonus, central: before.central }, 'no money moves');
  assert.equal(String((await call('GET', '/bonuses/legacy-accruals')).data.totalUsd), '0');
  assert.equal((await call('POST', '/bonuses/legacy-accruals/reverse', { expectedTotalUsd: 0 })).status, 400);
  pass('stale confirmation refused; reversal takes back exactly $390 / $60 with journal and audit, moves no money, runs once');

  // ---------- Bonus Account: transfer, payout, cancellation ----------
  await setRate(11);
  assert.equal((await call('POST', '/supplier-bonuses', { supplierId: 'sup-dubai', campaignTitle: 'Новый', bonusType: 'CASH_DISCOUNT', amountUsd: 500 })).status, 201);
  let b = await bonus();
  assert.equal(b.usd.toString(), '800'); assert.equal(b.tjs.toString(), '8500');
  let c = await central();

  for (const [body, label] of [[{ amountUsd: 0 }, 'zero'], [{ amountUsd: 900 }, 'more than the balance']] as const) {
    assert.equal((await call('POST', '/bonus-account/transfer', body)).status, 400, label);
  }
  assert.equal((await call('POST', '/bonus-account/payout', { amountUsd: 10 })).status, 400, 'payout needs a recipient/purpose');
  assert.equal((await call('POST', '/bonus-account/transfer', { amountUsd: 10 }, { token: seller })).status, 403);
  assert.deepEqual(await bonus(), b);

  const key = crypto.randomUUID();
  const t1 = await call('POST', '/bonus-account/transfer', { amountUsd: 400, comment: 'В оборот' }, { key });
  assert.equal(t1.status, 201, JSON.stringify(t1));
  assert.equal((await call('POST', '/bonus-account/transfer', { amountUsd: 400, comment: 'В оборот' }, { key })).data.id, t1.data.id, 'retry returns the same operation');
  b = await bonus(); const c1 = await central();
  assert.equal(b.usd.toString(), '400'); assert.equal(b.tjs.toString(), '4250');
  assert.equal(c1.usd.minus(c.usd).toString(), '400'); assert.equal(c1.tjs.minus(c.tjs).toString(), '4250');
  pass('transfer $400 to Central Cash: one posting, 4250 TJS (its share of 8500 TJS / $800); retry moves nothing again');

  const p1 = await call('POST', '/bonus-account/payout', { amountUsd: 100, comment: 'Премия продавцам' });
  assert.equal(p1.status, 201, JSON.stringify(p1));
  b = await bonus();
  assert.equal(b.usd.toString(), '300'); assert.equal(b.tjs.toString(), '3187.5');
  assert.deepEqual(await owners(), after, 'a payout is nobody\'s profit');
  pass('payout $100 with its purpose: Bonus Account $300 / 3187.50 TJS, owners unchanged');

  const t2 = await call('POST', '/bonus-account/transfer', { amountUsd: 300, comment: 'Остаток' });
  assert.equal(t2.status, 201);
  b = await bonus();
  assert.equal(b.usd.toString(), '0'); assert.equal(b.tjs.toString(), '0');
  pass('transferring the whole rest leaves exactly $0 / 0 TJS');

  // Cancellations: each reversed with its own amounts, only once; never overdraw Central Cash.
  const cp = await call('POST', `/bonus-account/operations/${p1.data.id}/cancel`, {});
  assert.equal(cp.status, 200, JSON.stringify(cp));
  b = await bonus();
  assert.equal(b.usd.toString(), '100'); assert.equal(b.tjs.toString(), '1062.5');
  assert.equal((await call('POST', `/bonus-account/operations/${p1.data.id}/cancel`, {})).status, 400, 'second cancel refused');
  c = await central();
  const exp = await call('POST', '/expenses', { category: 'Аренда', amountTjs: Number(c.usd.minus(100).mul(11).toFixed(2)), storeId: 'main-warehouse', paidFromCashRegister: true, comment: 'test' });
  assert.equal(exp.status, 201, JSON.stringify(exp));
  const snap = { bonus: await bonus(), central: await central() };
  assert.equal((await call('POST', `/bonus-account/operations/${t1.data.id}/cancel`, {})).status, 400, 'Central Cash cannot cover $400');
  assert.deepEqual({ bonus: await bonus(), central: await central() }, snap);
  const ct2 = await call('POST', `/bonus-account/operations/${t2.data.id}/cancel`, {});
  assert.equal(ct2.status, 400, 'nor $300'); // central now ~$100
  pass('cancelling a payout returns $100 / 1062.50 TJS once; a transfer Central Cash can no longer cover is refused without changes');

  const history = await call('GET', '/bonus-account/operations');
  assert.equal(history.status, 200);
  assert.deepEqual(history.data.map((o: any) => [o.kind, String(o.amountUsd), o.status]).sort(), [
    ['PAYOUT', '100', 'CANCELLED'], ['TRANSFER', '300', 'POSTED'], ['TRANSFER', '400', 'POSTED'],
  ]);
  pass('history lists every operation with its state');

  // A payout that stays: company money spent, still nobody's profit.
  assert.equal((await call('POST', '/bonus-account/payout', { amountUsd: 50, comment: 'Подарки клиентам' })).status, 201);
  assert.equal((await bonus()).usd.toString(), '50');
  const check = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-owner-balances.ts'], { env, encoding: 'utf8', timeout: 120000 });
  assert.match(check.stdout, /Расхождений нет/, check.stdout + check.stderr);
  pass('owner capital reconciliation passes (payouts and transfers are company money, not profit)');
});

console.log(`\nBonus admin: ${passed} checks passed`);
