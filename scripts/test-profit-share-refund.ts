import { D, moneyJson } from '../server/src/common/decimal';
import 'dotenv/config';
import assert from './lib/decimal-assert';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

// This regression suite always creates its own schema on a local database.
const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Use a local test database');
const schema = `refund_share_test_${Date.now()}_${process.pid}`;
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.href;
process.env.SEED_TEST_DATA = 'true';
const db = new PrismaClient();
let disconnectService: (() => Promise<void>) | undefined;

await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
try {
  for (const args of [
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    ['--import', 'dotenv/config', '--import', 'tsx', 'prisma/seed.ts'],
  ]) {
    const result = spawnSync(process.execPath, args, { env: process.env, encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  const { prisma } = await import('../server/src/prisma/prisma.service');
  disconnectService = () => prisma.$disconnect();
  const { SalesService } = await import('../server/src/modules/sales/sales.service');
  const { RefundService } = await import('../server/src/modules/sales/refund.service');
  const { ExchangesService } = await import('../server/src/modules/exchanges/exchanges.service');
  const { OwnersService } = await import('../server/src/modules/owners/owners.service');
  const { setTodayRate } = await import('../server/src/modules/exchange-rate/exchange-rate.service');
  await setTodayRate(10, 'user-admin');

  const shares = (a: number) => OwnersService.updateProfitShares([
    { ownerId: 'owner-admin', sharePercent: a },
    { ownerId: 'owner-partner', sharePercent: 100 - a },
  ], 'user-admin');
  const balances = async () => Promise.all(['owner-admin', 'owner-partner'].map(async (id) => {
    const owner = await prisma.owner.findUniqueOrThrow({ where: { id } });
    return { accrued: owner.totalAccruedProfitUsd, available: owner.availableProfitUsd };
  }));
  let deviceNumber = 0;
  const device = () => prisma.device.create({ data: {
    imei: `990000000000${String(++deviceNumber).padStart(3, '0')}`,
    brand: 'Test', model: 'Refund regression', storage: '128GB', color: 'Black',
    status: 'STORE_STOCK', storeId: 'store-siyoma', purchasePriceUsd: D(100), costBasisUsd: D(100),
  } });
  const makeSale = async () => {
    const item = await device();
    const sale = await SalesService.executeSale({ storeId: 'store-siyoma', userId: 'user-admin',
      items: [{ deviceId: item.id, salePriceTjs: D(2000) }], paymentMethod: 'CASH' });
    return { sale, item };
  };
  const refund = (saleId: string, total = 2000, penalty = 0) => RefundService.refund({
    saleId, reason: 'Regression test', refundAmountTjs: D(total).minus(penalty), penaltyFeeTjs: penalty,
    paymentMethod: 'CASH', refundedByUserId: 'user-admin',
  });

  await shares(60);
  const first = await makeSale();
  assert.deepEqual(await balances(), [{ accrued: 60, available: 60 }, { accrued: 40, available: 40 }]);
  await shares(50);
  await refund(first.sale.id);
  assert.deepEqual(await balances(), [{ accrued: 0, available: 0 }, { accrued: 0, available: 0 }]);
  await assert.rejects(refund(first.sale.id), /уже был возвращён/);
  console.log('PASS: 60/40 sale -> 50/50 shares -> full refund restores both balances; duplicate rejected');

  await shares(60);
  const exchanged = await makeSale();
  await shares(50);
  const replacement = await device();
  await ExchangesService.process({ saleId: exchanged.sale.id,
    returnedImei: exchanged.item.imei, returnedBrand: 'Test', returnedModel: 'Refund regression',
    exchangeInValueTjs: D(2000), replacementDeviceId: replacement.id, newPriceTjs: D(2500),
    processedByUserId: 'user-admin', paymentMethod: 'CASH' });
  assert.deepEqual(await balances(), [{ accrued: 135, available: 135 }, { accrued: 115, available: 115 }]);
  await shares(20);
  await refund(exchanged.sale.id, 2500);
  assert.deepEqual(await balances(), [{ accrued: 0, available: 0 }, { accrued: 0, available: 0 }]);
  assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: exchanged.item.id } })).costBasisUsd, 100);
  console.log('PASS: original sale and exchange allocations reversed after two share changes; traded-in device cost restored');

  // Traded-in device resold before the original sale is refunded: its resale profit was
  // booked against the $150 trade-in value, so the refund must add the $50 difference.
  await shares(50);
  const resoldCase = await makeSale();
  const replacement2 = await device();
  await ExchangesService.process({ saleId: resoldCase.sale.id,
    returnedImei: resoldCase.item.imei, returnedBrand: 'Test', returnedModel: 'Refund regression',
    exchangeInValueTjs: D(1500), replacementDeviceId: replacement2.id, newPriceTjs: D(2500),
    processedByUserId: 'user-admin', paymentMethod: 'CASH' });
  await SalesService.executeSale({ storeId: 'store-siyoma', userId: 'user-admin',
    items: [{ deviceId: resoldCase.item.id, salePriceTjs: D(1800) }], paymentMethod: 'CASH' });
  await refund(resoldCase.sale.id, 3000);
  assert.deepEqual(await balances(), [{ accrued: 40, available: 40 }, { accrued: 40, available: 40 }]);
  console.log('PASS: refund after the traded-in device was resold books its resale against original cost');

  await shares(60);
  const penalized = await makeSale();
  await shares(50);
  await refund(penalized.sale.id, 2000, 100);
  assert.deepEqual(await balances(), [{ accrued: 45, available: 45 }, { accrued: 45, available: 45 }]);
  console.log('PASS: only the new penalty is allocated at current 50/50 shares');

  // Reports put a refund in the month it happened: last month's figures stay as they were,
  // and this month shows the reversal — matching when owner profit actually moved.
  const reports = await import('../server/src/modules/reports/reports.service');
  const lastMonthDate = new Date();
  lastMonthDate.setUTCDate(15);
  lastMonthDate.setUTCMonth(lastMonthDate.getUTCMonth() - 1);
  const lastMonth = lastMonthDate.toISOString().slice(0, 7);
  const monthProfit = async (month?: string) => {
    const summary = await reports.computeReportsSummary(month ? { period: 'SPECIFIC_MONTH', month } : { period: 'MONTH' });
    return { revenueUsd: summary.revenueUsd, profitUsd: summary.profitUsd };
  };
  const oldSale = await makeSale();
  await prisma.sale.update({ where: { id: oldSale.sale.id }, data: { createdAt: lastMonthDate } });
  await prisma.auditLog.updateMany({ where: { targetId: oldSale.sale.id }, data: { createdAt: lastMonthDate } });
  const lastMonthBefore = await monthProfit(lastMonth);
  const thisMonthBefore = await monthProfit();
  await refund(oldSale.sale.id);
  assert.deepEqual(await monthProfit(lastMonth), lastMonthBefore);
  const thisMonthAfter = await monthProfit();
  assert.equal(D(thisMonthAfter.revenueUsd).minus(thisMonthBefore.revenueUsd), -200);
  assert.equal(D(thisMonthAfter.profitUsd).minus(thisMonthBefore.profitUsd), -100);
  console.log('PASS: refund of last month\'s sale is reported this month; last month unchanged');

  // Owner balance change caused by fn — later scenarios don't depend on earlier totals.
  const change = async (fn: () => Promise<unknown>) => {
    const before = await balances();
    await fn();
    const after = await balances();
    return after.map((a, i) => ({ accrued: D(a.accrued).minus(before[i].accrued), available: D(a.available).minus(before[i].available) }));
  };
  const none = [{ accrued: 0, available: 0 }, { accrued: 0, available: 0 }];
  const bonusDevice = (costBasisUsd: number) => prisma.device.create({ data: {
    imei: `990000000000${String(++deviceNumber).padStart(3, '0')}`,
    brand: 'Test', model: 'Bonus regression', storage: '128GB', color: 'Black', isBonus: true,
    bonusCampaign: 'Regression', status: 'STORE_STOCK', storeId: 'store-siyoma',
    purchasePriceUsd: D(costBasisUsd), costBasisUsd: D(costBasisUsd),
  } });
  const sell = async (deviceId: string, salePriceTjs: number) => SalesService.executeSale({ storeId: 'store-siyoma',
    userId: 'user-admin', items: [{ deviceId, salePriceTjs: D(salePriceTjs) }], paymentMethod: 'CASH' });
  const pendingPoolUsd = async () => (await prisma.bonusPoolEntry.findMany({ where: { status: 'PENDING' } }))
    .reduce((sum, e) => sum.plus(e.profitUsd), D(0));
  const { BonusesService } = await import('../server/src/modules/bonuses/bonuses.service');
  const distributePool = async () => {
    const pool = await pendingPoolUsd();
    if (pool.lte(0)) return;
    const half = pool.div(2).toDecimalPlaces(2);
    await BonusesService.distributeBonusProfit({ periodName: 'Regression', userId: 'user-admin',
      allocations: [{ ownerId: 'owner-admin', amountUsd: half }, { ownerId: 'owner-partner', amountUsd: pool.minus(half) }] });
  };
  await shares(50);

  // A below-cost sale books its loss to the owners, exactly like an exchange already does,
  // so owner balances match the report's negative profit; the refund undoes it.
  const lossItem = await device();
  let lossSaleId = '';
  assert.deepEqual(await change(async () => { lossSaleId = (await sell(lossItem.id, 900)).id; }),
    [{ accrued: -5, available: -5 }, { accrued: -5, available: -5 }]);
  assert.deepEqual(await change(() => refund(lossSaleId, 900)), [{ accrued: 5, available: 5 }, { accrued: 5, available: 5 }]);
  console.log('PASS: below-cost sale books the $10 loss to owners; refund reverses it');

  // A bonus-flagged device that cost money is a regular sale: its cost is never skipped.
  const paidBonus = await bonusDevice(100);
  const poolBefore = await pendingPoolUsd();
  assert.deepEqual(await change(() => sell(paidBonus.id, 1500)), [{ accrued: 25, available: 25 }, { accrued: 25, available: 25 }]);
  assert.equal(await pendingPoolUsd(), poolBefore);
  console.log('PASS: bonus-flagged device with $100 cost books $50 profit, nothing to the bonus pool');

  // Free bonus device: sale -> pool distributed -> refund takes the distributed bonus back.
  await distributePool();
  const freeBonus = await bonusDevice(0);
  const freeSale = await sell(freeBonus.id, 1900);
  assert.equal(await pendingPoolUsd(), 190);
  assert.deepEqual(await change(distributePool), [{ accrued: 95, available: 95 }, { accrued: 95, available: 95 }]);
  assert.deepEqual(await change(() => refund(freeSale.id, 1900)), [{ accrued: -95, available: -95 }, { accrued: -95, available: -95 }]);
  console.log('PASS: refund of a sold free bonus device reverses the already distributed $190');

  // Exchanged free bonus device comes back at its trade-in value, so its resale is a regular
  // sale; the pool keeps only the original $190: 190 - 150 credit + 160 resale = $200 total.
  const swapBonus = await bonusDevice(0);
  const swapSale = await sell(swapBonus.id, 1900);
  const swapReplacement = await device();
  await ExchangesService.process({ saleId: swapSale.id, returnedImei: swapBonus.imei, returnedBrand: 'Test',
    returnedModel: 'Bonus regression', exchangeInValueTjs: D(1500), replacementDeviceId: swapReplacement.id,
    newPriceTjs: D(2000), processedByUserId: 'user-admin', paymentMethod: 'CASH' });
  const poolAfterSwap = await pendingPoolUsd();
  assert.deepEqual(await change(() => sell(swapBonus.id, 1600)), [{ accrued: 5, available: 5 }, { accrued: 5, available: 5 }]);
  assert.equal(await pendingPoolUsd(), poolAfterSwap);
  console.log('PASS: exchanged free bonus device is resold as a regular $150-cost sale, pool not counted twice');

  // A free bonus device handed out as the replacement goes to the pool, not straight to owners.
  const baseItem = await device();
  const baseSale = await sell(baseItem.id, 2000);
  const bonusReplacement = await bonusDevice(0);
  const poolBeforeBonusSwap = await pendingPoolUsd();
  assert.deepEqual(await change(() => ExchangesService.process({ saleId: baseSale.id, returnedImei: baseItem.imei,
    returnedBrand: 'Test', returnedModel: 'Refund regression', exchangeInValueTjs: D(2000),
    replacementDeviceId: bonusReplacement.id, newPriceTjs: D(2200), processedByUserId: 'user-admin', paymentMethod: 'CASH' })), none);
  assert.equal(D(await pendingPoolUsd()).minus(poolBeforeBonusSwap), 220);
  console.log('PASS: free bonus replacement in an exchange goes to the bonus pool');

  // Trade-in credit above what the customer paid for that item is rejected.
  const capItem = await device();
  const capSale = await sell(capItem.id, 1000);
  await assert.rejects(ExchangesService.process({ saleId: capSale.id, returnedImei: capItem.imei, returnedBrand: 'Test',
    returnedModel: 'Refund regression', exchangeInValueTjs: D(3000), replacementDeviceId: (await device()).id,
    newPriceTjs: D(500), processedByUserId: 'user-admin', paymentMethod: 'CASH' }), /не может превышать/);
  console.log('PASS: trade-in credit above the item price (3000 > 1000 TJS) is rejected');

  // Item USD amounts add up to the receipt total: 3 x 100 TJS at 10.95 = $27.40, not $27.39.
  await setTodayRate(10.95, 'user-admin');
  const centItems = await Promise.all([device(), device(), device()]);
  const centSale = await SalesService.executeSale({ storeId: 'store-siyoma', userId: 'user-admin',
    items: centItems.map((d) => ({ deviceId: d.id, salePriceTjs: D(100) })), paymentMethod: 'CASH' });
  assert.equal(centSale.saleItems.reduce((sum, i) => sum.plus(i.salePriceUsd), D(0)), centSale.totalUsd);
  await setTodayRate(10, 'user-admin');
  console.log('PASS: item USD prices sum exactly to the receipt total');

  // Partial bonus distribution records the undistributed remainder instead of dropping it.
  await sell((await bonusDevice(0)).id, 1000);
  const remainderPool = await pendingPoolUsd();
  await BonusesService.distributeBonusProfit({ periodName: 'Partial', userId: 'user-admin',
    allocations: [{ ownerId: 'owner-admin', amountUsd: D(remainderPool).minus(40) }] });
  const annulment = await prisma.bonusDistributionLog.findFirst({ where: { type: 'ANNULMENT' }, orderBy: { createdAt: 'desc' } });
  assert.equal(annulment?.totalAmountUsd, 40);
  console.log('PASS: partial bonus distribution logs the $40 remainder as annulled');

  // A write never silently reuses an older day's rate.
  await prisma.exchangeRate.deleteMany({});
  await prisma.exchangeRate.create({ data: { date: '2000-01-01', rate: D(9), createdByUserId: 'user-admin' } });
  await assert.rejects(sell((await device()).id, 2000), /курс/i);
  await setTodayRate(10, 'user-admin');
  console.log('PASS: sale without today\'s exchange rate is rejected instead of using an old rate');

  // Registers are kept in USD: a 2000 TJS cash sale at 10 adds exactly $200.
  const siyomaCash = async () => D((await prisma.store.findUniqueOrThrow({ where: { id: 'store-siyoma' } })).cashBalanceUsd);
  const siyomaAccount = async () => D((await prisma.financialAccount.findUniqueOrThrow({ where: { storeId: 'store-siyoma' } })).balanceUsd);
  const cashBeforeUsdSale = await siyomaCash();
  const usdSale = await makeSale();
  assert.equal((await siyomaCash()).minus(cashBeforeUsdSale), 200);
  assert.equal(await siyomaAccount(), await siyomaCash());
  console.log('PASS: 2000 TJS cash sale at 10 adds exactly $200 to the USD register and its ledger account');

  // Refund at a later rate: 2000 TJS at 11 costs $181.82 of the register; the $18.18 difference
  // to the $200 booked is an exchange-rate gain for the owners (50/50), reported in the period.
  const reportsModule = await import('../server/src/modules/reports/reports.service');
  const fxBefore = D((await reportsModule.computeReportsSummary({ period: 'MONTH' })).periodRefundFxUsd);
  await setTodayRate(11, 'user-admin');
  const cashBeforeFxRefund = await siyomaCash();
  assert.deepEqual(await change(() => refund(usdSale.sale.id)), [{ accrued: -40.91, available: -40.91 }, { accrued: -40.91, available: -40.91 }]);
  assert.equal((await siyomaCash()).minus(cashBeforeFxRefund), -181.82);
  assert.equal(await siyomaAccount(), await siyomaCash());
  assert.equal(D((await reportsModule.computeReportsSummary({ period: 'MONTH' })).periodRefundFxUsd).minus(fxBefore), 18.18);
  await setTodayRate(10, 'user-admin');
  console.log('PASS: refund at 11 pays out $181.82; $18.18 FX gain booked to owners and the report');

  // Expenses leave the register in USD at the day's rate: 105 TJS at 10 = $10.50.
  const { createExpenseStandalone } = await import('../server/src/modules/expenses/expenses.service');
  const cashBeforeExpense = await siyomaCash();
  await createExpenseStandalone({ category: 'Аренда', amountTjs: D(105), storeId: 'store-siyoma', createdByUserId: 'user-admin' });
  assert.equal((await siyomaCash()).minus(cashBeforeExpense), -10.5);
  assert.equal(await siyomaAccount(), await siyomaCash());
  console.log('PASS: 105 TJS expense takes exactly $10.50 out of the USD register');

  // An advance counts in the payroll month it was given for, not the day it was handed out.
  const { getPayrollSummary } = await import('../server/src/modules/expenses/payroll.service');
  const { getBusinessDateKey } = await import('../server/src/common/business-date');
  const thisPayrollMonth = getBusinessDateKey().slice(0, 7);
  const advanceFor = '2000-01';
  await createExpenseStandalone({ category: 'EMPLOYEE_ADVANCE', amountTjs: D(300), storeId: 'store-siyoma', employeeId: 'user-ahmad',
    isEmployeeAdvance: true, payrollMonth: advanceFor, createdByUserId: 'user-admin' });
  assert.equal((await getPayrollSummary('user-ahmad', advanceFor)).paidAdvancesTjs, 300);
  assert.equal((await getPayrollSummary('user-ahmad', thisPayrollMonth)).paidAdvancesTjs, 0);
  console.log('PASS: advance paid today for 2000-01 is deducted from 2000-01 payroll, not this month');

  const legacy = await makeSale();
  await prisma.auditLog.updateMany({ where: { targetId: legacy.sale.id, action: 'SALE' },
    data: { financialDetails: moneyJson({ recognizedProfitUsd: D(100) }) } });
  const before = await balances();
  const cash = (await prisma.store.findUniqueOrThrow({ where: { id: 'store-siyoma' } })).cashBalanceUsd;
  await assert.rejects(refund(legacy.sale.id), /исходное распределение/);
  assert.deepEqual(await balances(), before);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: 'store-siyoma' } })).cashBalanceUsd, cash);
  assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: legacy.item.id } })).status, 'SOLD');
  assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: legacy.sale.id } })).status, 'COMPLETED');
  console.log('PASS: missing historical allocation leaves sale, stock, cash and owner balances unchanged');
} finally {
  await disconnectService?.();
  await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect();
  console.log('Temporary regression schema removed');
}
