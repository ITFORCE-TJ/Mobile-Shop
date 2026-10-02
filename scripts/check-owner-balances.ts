import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';

// Read-only reconciliation of partner profit balances. Every profit movement keeps
//   available = accrued - paid - reinvested
// and paid/reinvested/capital must match the owner transaction history. A mismatch
// usually means balances were redistributed by shares ("rebalance") at some point.
const prisma = new PrismaClient();
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const fmt = (v: Prisma.Decimal) => `$${v.toFixed(2)}`;

async function main() {
  const [owners, sums] = await Promise.all([
    prisma.owner.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.ownerTransaction.groupBy({ by: ['ownerId', 'type'], _sum: { amountUsd: true } }),
  ]);
  const history = (ownerId: string, type: string) =>
    D(sums.find((s) => s.ownerId === ownerId && s.type === type)?._sum.amountUsd ?? 0);

  let problems = 0;
  for (const owner of owners) {
    const accrued = D(owner.totalAccruedProfitUsd);
    const paid = D(owner.totalPaidProfitUsd);
    const reinvested = D(owner.totalReinvestedUsd);
    const available = D(owner.availableProfitUsd);
    const capital = D(owner.capitalBalanceUsd);
    const checks: [string, Prisma.Decimal, Prisma.Decimal][] = [
      ['Доступно = начислено − выплачено − реинвестировано', available, accrued.minus(paid).minus(reinvested)],
      ['Выплачено = сумма выплат в истории', paid, history(owner.id, 'PROFIT_PAYOUT')],
      ['Реинвестировано = сумма реинвестиций в истории', reinvested, history(owner.id, 'REINVEST')],
      ['Капитал = вложения + реинвест − изъятия', capital,
        history(owner.id, 'INVESTMENT').plus(history(owner.id, 'REINVEST')).minus(history(owner.id, 'WITHDRAWAL'))],
    ];
    console.log(`\n${owner.name} (${D(owner.profitSharePercent).toString()}%)`);
    for (const [label, actual, expected] of checks) {
      const diff = actual.minus(expected);
      const ok = diff.abs().lte(0.01);
      if (!ok) problems++;
      console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}: ${fmt(actual)}${ok ? '' : ` (ожидалось ${fmt(expected)}, разница ${fmt(diff)})`}`);
    }
  }
  problems += await reconcileCapital(owners);
  console.log(problems ? `\nНайдено расхождений: ${problems}` : '\nРасхождений нет');
}

/**
 * Capital reconciliation (everything in USD): what the owners hold — capital plus profit not yet
 * paid out — must equal what the business holds: all cash registers plus stock at cost, minus
 * what it owes suppliers. Items that legitimately sit outside that equation are listed
 * separately (card takings never reach a register, old supplier cash bonuses that were accrued
 * to owners without cash, bonus-phone cash that belongs to the company and not to the owners,
 * unpaid expenses, manual register corrections); whatever
 * is left is a real discrepancy to investigate.
 */
async function reconcileCapital(owners: { capitalBalanceUsd: Prisma.Decimal; availableProfitUsd: Prisma.Decimal }[]) {
  const sum = (values: Prisma.Decimal.Value[]) => values.reduce<Prisma.Decimal>((acc, v) => acc.plus(v), D(0));
  const [stores, stock, supplierDebt, pool, unpaid, cashBonuses, keptSales, adjustments, customerDebt, rate] = await Promise.all([
    prisma.store.findMany({ select: { cashBalanceUsd: true } }),
    prisma.device.aggregate({ _sum: { costBasisUsd: true }, where: { status: { not: 'SOLD' } } }),
    prisma.supplier.aggregate({ _sum: { totalDebtUsd: true } }),
    // Bonus-phone profit is nobody's income: pending or zeroed at a quarterly close, its cash stays
    // in the registers (a refunded sale gave it back to the customer).
    prisma.bonusPoolEntry.aggregate({ _sum: { profitUsd: true }, where: { status: { in: ['PENDING', 'ANNULLED'] }, sale: { status: { not: 'REFUNDED' } } } }),
    prisma.expense.findMany({ where: { status: 'UNPAID', cancelledAt: null }, select: { amountUsd: true, amountTjs: true, exchangeRate: true } }),
    prisma.supplierBonus.findMany({ where: { bonusType: 'CASH_DISCOUNT' }, select: { amountUsd: true, ownerProfitAllocations: true } }),
    prisma.sale.findMany({ where: { status: { not: 'REFUNDED' } }, select: { totalUsd: true, totalTjs: true, cardAmountTjs: true } }),
    prisma.financialTransaction.findMany({ where: { type: 'ADJUSTMENT', status: 'POSTED', sourceType: 'STORE_ADJUSTMENT' }, select: { direction: true, amountUsd: true } }),
    prisma.customer.aggregate({ _sum: { totalDebtTjs: true } }),
    prisma.exchangeRate.findFirst({ orderBy: { date: 'desc' }, select: { rate: true } }),
  ]);

  const capital = sum(owners.map((o) => o.capitalBalanceUsd));
  const profit = sum(owners.map((o) => o.availableProfitUsd));
  const registers = sum(stores.map((s) => s.cashBalanceUsd));
  const stockCost = D(stock._sum.costBasisUsd ?? 0);
  const debt = D(supplierDebt._sum.totalDebtUsd ?? 0);
  const ownersSide = capital.plus(profit);
  const businessSide = registers.plus(stockCost).minus(debt);

  const cardTakings = sum(keptSales.map((s) => D(s.totalTjs).gt(0) ? D(s.totalUsd).mul(s.cardAmountTjs ?? 0).div(s.totalTjs) : D(0)));
  const customerReceivable = rate?.rate ? D(customerDebt._sum.totalDebtTjs ?? 0).div(rate.rate) : D(0);
  const unpaidUsd = sum(unpaid.map((e) => e.amountUsd ?? (e.exchangeRate ? D(e.amountTjs).div(e.exchangeRate) : 0)));
  const manual = sum(adjustments.map((a) => (a.direction === 'IN' ? D(a.amountUsd) : D(a.amountUsd).negated())));
  const explained: [string, Prisma.Decimal][] = [
    ['Оплаты картой (деньги вне касс)', cardTakings],
    ['Долг покупателей', customerReceivable],
    // Only bonuses booked before bonuses stopped being owner income were accrued without cash.
    ['Старые денежные бонусы, начисленные владельцам (прибыль без денег)', sum(cashBonuses.filter((b) => Array.isArray(b.ownerProfitAllocations) && b.ownerProfitAllocations.length > 0).map((b) => b.amountUsd ?? 0))],
    ['Деньги от бонусных телефонов (у компании, не у владельцев)', D(pool._sum.profitUsd ?? 0).negated()],
    ['Неоплаченные расходы (прибыль уже уменьшена, деньги ещё в кассе)', unpaidUsd.negated()],
    ['Ручные корректировки касс', manual.negated()],
  ];
  // Owners' side = business side + explained items; the remainder is unexplained.
  const residual = ownersSide.minus(businessSide).minus(sum(explained.map(([, v]) => v)));
  const ok = residual.abs().lte(1);

  console.log('\nСверка капитала (USD)');
  console.log(`  Капитал ${fmt(capital)} + нераспределённая прибыль ${fmt(profit)} = ${fmt(ownersSide)}`);
  console.log(`  Кассы ${fmt(registers)} + склад по себестоимости ${fmt(stockCost)} − долг поставщикам ${fmt(debt)} = ${fmt(businessSide)}`);
  console.log(`  Разница ${fmt(ownersSide.minus(businessSide))}, из неё объяснено:`);
  for (const [label, value] of explained) if (!value.isZero()) console.log(`    ${label}: ${fmt(value)}`);
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} Необъяснённый остаток: ${fmt(residual)}${ok ? '' : ' — проверьте операции вне учёта (корректировки, старые данные до перевода касс в USD, бонусные устройства с себестоимостью)'}`);
  return ok ? 0 : 1;
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
