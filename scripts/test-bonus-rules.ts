import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

// Supplier bonuses are nobody's income: they are recorded and shown in reports, never accrued
// to an owner, a register, an account or a payout, and are zeroed on the Bonuses page at each
// quarterly close. Owner profit payout and reinvestment no longer exist.
const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Disposable local database required');
const schema = `audit_fixes_bonus_${Date.now()}_${process.pid}`;
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
  const api = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const adminToken = (await api('POST', '/auth/login', { login: 'admin', password: 'admin123' })).data.token;
  token = adminToken;
  assert.equal((await api('POST', '/exchange-rate/today', { rate: 10 })).status, 200);

  // Every place a bonus could wrongly land: owner balances, store registers, ledger accounts.
  const money = async () => ({
    owners: (await db.owner.findMany({ orderBy: { id: 'asc' } })).map(o => [o.id, o.capitalBalanceUsd.toString(), o.totalAccruedProfitUsd.toString(), o.availableProfitUsd.toString()]),
    stores: (await db.store.findMany({ orderBy: { id: 'asc' } })).map(s => [s.id, s.cashBalanceUsd.toString()]),
    accounts: (await db.financialAccount.findMany({ orderBy: { id: 'asc' } })).map(a => [a.id, a.balanceUsd.toString()]),
  });
  const report = async () => {
    const r = await api('GET', '/reports/summary?period=ALL');
    assert.equal(r.status, 200, JSON.stringify(r));
    return r.data;
  };

  // 1. Cash bonus: recorded only.
  let before = await money();
  let reportBefore = await report();
  const bonus = await api('POST', '/supplier-bonuses', { supplierId: 'sup-dubai', campaignTitle: 'Квартальный бонус', bonusType: 'CASH_DISCOUNT', amountUsd: 250 });
  assert.equal(bonus.status, 201, JSON.stringify(bonus));
  assert.deepEqual(await money(), before);
  let reportAfter = await report();
  assert.equal(String(reportAfter.periodCashBonusesUsd - reportBefore.periodCashBonusesUsd), '250');
  assert.equal(reportAfter.netProfitUsd, reportBefore.netProfitUsd);
  pass('cash bonus $250: no owner/register/account change; shown in report, not in net profit');

  // 2. Bonus phone: its profit is nobody's — reported apart, not in profit or store profit.
  const device = await db.device.create({ data: {
    imei: '990000000000777', brand: 'Test', model: 'Bonus phone', storage: '128GB', color: 'Black', isBonus: true,
    bonusCampaign: 'Квартальный бонус', status: 'STORE_STOCK', storeId: 'store-siyoma', purchasePriceUsd: 0, costBasisUsd: 0,
  } });
  before = await money();
  reportBefore = await report();
  token = (await api('POST', '/auth/login', { login: 'ahmad', password: 'seller123' })).data.token;
  const sale = await api('POST', '/sales', { storeId: 'store-siyoma', items: [{ deviceId: device.id, salePriceTjs: 1500 }], paymentMethod: 'CASH' });
  assert.equal(sale.status, 201, JSON.stringify(sale));
  token = adminToken;
  assert.deepEqual((await money()).owners, before.owners);
  reportAfter = await report();
  assert.equal(String(reportAfter.bonusDeviceProfitUsd), '150');
  assert.equal(reportAfter.netProfitUsd, reportBefore.netProfitUsd);
  const siyoma = reportAfter.storeBreakdown.find((s: { storeId?: string; id?: string }) => (s.storeId ?? s.id) === 'store-siyoma');
  assert(siyoma, 'store-siyoma in storeBreakdown');
  assert.equal(String(siyoma.netProfitUsd), '0');
  assert.equal(String(siyoma.bonusDeviceProfitUsd), '150');
  pass('bonus phone sold for 1500 TJS: owners unchanged; $150 shown as bonus-phone profit, not in net or store profit');

  // 3. Removed operations: only the Bonuses page manages bonuses; no payout or reinvestment.
  assert.equal((await api('POST', '/bonuses/distribute-profit', { periodName: 'x', allocations: [] })).status, 404);
  assert.equal((await api('POST', '/owners/owner-admin/payout', { amountUsd: 1 })).status, 404);
  assert.equal((await api('POST', '/owners/owner-admin/reinvest', { amountUsd: 1 })).status, 404);
  const invest = await api('POST', '/owners/owner-admin/investment', { amountUsd: 50 });
  assert.equal(invest.status, 200, JSON.stringify(invest));
  const withdraw = await api('POST', '/owners/owner-admin/withdrawal', { amountUsd: 50 });
  assert.equal(withdraw.status, 200, JSON.stringify(withdraw));
  pass('bonus distribution, profit payout and reinvestment removed (404); investment and withdrawal still work');

  // 4. Quarterly close on the Bonuses page: totals shown, zeroed after confirmation, no money moves.
  const quarter = await api('GET', '/bonuses/quarter');
  assert.equal(quarter.status, 200, JSON.stringify(quarter));
  assert.equal(String(quarter.data.cashBonusesUsd), '250');
  assert.equal(String(quarter.data.bonusDeviceProfitUsd), '150');
  assert.equal(quarter.data.bonusDevicesSold, 1);
  before = await money();
  const close = await api('POST', '/bonuses/annul-pool', { periodName: 'III квартал 2026' });
  assert.equal(close.status, 200, JSON.stringify(close));
  assert.deepEqual(await money(), before);
  const after = (await api('GET', '/bonuses/quarter')).data;
  assert.equal(String(after.cashBonusesUsd), '0');
  assert.equal(String(after.bonusDeviceProfitUsd), '0');
  assert.equal(after.bonusDevicesSold, 0);
  const history = await api('GET', '/bonuses/quarter-history');
  assert.equal(history.status, 200);
  assert.equal(history.data[0].periodName, 'III квартал 2026');
  assert.equal(String((await report()).periodCashBonusesUsd), '250');
  assert.equal((await api('POST', '/bonuses/annul-pool', { periodName: 'Пусто' })).status, 400);
  pass('quarter close: $250 + $150 zeroed after confirmation, nothing credited; history kept; report still shows the bonus');

  // 5. Owner capital reconciliation still holds.
  const check = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-owner-balances.ts'], { env: process.env, encoding: 'utf8', timeout: 120000 });
  assert.equal(check.status, 0, check.stdout + check.stderr);
  pass('owner balance reconciliation passes');

  console.log(`\nALL ${passed} BONUS RULE CHECKS PASSED`);
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  if (disconnect) await disconnect();
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
}
