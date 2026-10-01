import { D, type MoneyInput } from '../../common/decimal';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { getRateForDate } from '../exchange-rate/exchange-rate.service';
import { calculateRecognizedProfit } from '../sales/profit';
import { roundMoney } from '../../common/money';

import { dateRangeForPeriod, type ReportPeriod } from '../../common/business-date';
export { dateRangeForPeriod, dateRangeForCustomDates, type ReportPeriod } from '../../common/business-date';

interface ReportsSummaryInput {
  period: ReportPeriod;
  month?: string; // 'YYYY-MM', required for SPECIFIC_MONTH
  storeId?: string; // retail store id, or 'all'/undefined for every store
}

const IN_STOCK_STATUSES = ['STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'] as const;

function dateWithinRange(iso: string | Date | null | undefined, range?: { gte: Date; lt: Date }): boolean {
  if (!range) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= range.gte.getTime() && t < range.lt.getTime();
}

type ProfitEvent = { storeId: string; revenueUsd: Prisma.Decimal; revenueTjs: Prisma.Decimal; profitUsd: Prisma.Decimal; rate: MoneyInput };

function detailNumber(details: unknown, key: string): number | undefined {
  const value = details && typeof details === 'object' && !Array.isArray(details) ? (details as Record<string, unknown>)[key] : undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Revenue and cost of goods for a set of dated sale/exchange/refund events (see computeReportsSummary). */
function sumProfitEvents(events: ProfitEvent[]) {
  let revenueUsd = D(0);
  let revenueTjs = D(0);
  let cogsUsd = D(0);
  let cogsTjs = D(0);
  for (const event of events) {
    const eventCogsUsd = event.revenueUsd.minus(event.profitUsd);
    revenueUsd = revenueUsd.plus(event.revenueUsd);
    revenueTjs = revenueTjs.plus(event.revenueTjs);
    cogsUsd = cogsUsd.plus(eventCogsUsd);
    cogsTjs = cogsTjs.plus(eventCogsUsd.mul(event.rate));
  }
  return { revenueUsd, revenueTjs, cogsUsd, cogsTjs };
}

function groupByStore<T extends { storeId: string }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.storeId);
    if (group) group.push(row);
    else groups.set(row.storeId, [row]);
  }
  return groups;
}

export async function computeReportsSummary(input: ReportsSummaryInput) {
  const dateRange = dateRangeForPeriod(input.period, input.month);
  const storeFilter = input.storeId && input.storeId !== 'all' ? input.storeId : undefined;

  // First wave: every query here is independent of the others, so they go to the DB
  // together instead of one round-trip at a time — each of these used to be a separate
  // sequential `await`, and that latency only compounds as the dataset (and DB round-trip
  // time) grows.
  const [
    rateRow,
    periodSalesAllStores,
    periodExpensesAllStores,
    allBonuses,
    refundedSalesAllStores,
    periodExchangeLogs,
    supplierDebtAgg,
    topSuppliersByDebt,
    mainWarehouseStore,
    retailStores,
  ] = await Promise.all([
    getRateForDate(new Date()),
    // Every sale made in the period counts in the period, even if it was refunded later —
    // the refund is reported in its own period as a negative (see refundedSalesAllStores),
    // so a closed month never changes retroactively and matches owner profit accruals.
    // The breakdown uses the same store scope, so unrelated stores are not needed.
    prisma.sale.findMany({
      where: {
        ...(storeFilter ? { storeId: storeFilter } : {}),
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      select: {
        id: true, storeId: true, status: true, totalTjs: true, totalUsd: true, exchangeRate: true,
        saleItems: { select: {
          brand: true, model: true, salePriceUsd: true, salePriceTjs: true,
          costBasisUsd: true, purchaseCostUsd: true,
        } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.expense.findMany({
      where: { cancelledAt: null, ...(dateRange ? { createdAt: dateRange } : {}), ...(storeFilter ? { storeId: storeFilter } : {}) },
      select: { storeId: true, category: true, status: true, amountTjs: true, amountUsd: true, exchangeRate: true },
    }),
    // Supplier bonuses aren't a high-growth table (one row per negotiated bonus, not per
    // transaction) so they're just fetched in full and filtered in memory, same as before.
    prisma.supplierBonus.findMany({ select: { bonusType: true, amountUsd: true, dateReceived: true, exchangeRate: true, status: true } }),
    // Refunds made in the period (whenever the sale itself happened) — reversed here as a
    // negative, with the retained penalty counted as profit. Same scope as sales.
    prisma.sale.findMany({
      where: {
        status: 'REFUNDED',
        ...(storeFilter ? { storeId: storeFilter } : {}),
        ...(dateRange ? { refundedAt: dateRange } : {}),
      },
      select: {
        id: true, storeId: true, totalTjs: true, totalUsd: true, exchangeRate: true, penaltyFeeUsd: true, penaltyFeeTjs: true,
        saleItems: { select: { costBasisUsd: true } },
      },
    }),
    // Exchanges processed in the period, whenever the exchanged sale itself happened.
    prisma.auditLog.findMany({
      where: { action: 'EXCHANGE', ...(dateRange ? { createdAt: dateRange } : {}) },
      select: { targetId: true, financialDetails: true },
    }),
    prisma.supplier.aggregate({ _sum: { totalDebtUsd: true } }),
    prisma.supplier.findMany({ where: { totalDebtUsd: { gt: 0 } }, orderBy: { totalDebtUsd: 'desc' }, take: 8,
      select: { id: true, name: true, totalPurchasedUsd: true, totalPaidUsd: true, totalDebtUsd: true } }),
    prisma.store.findFirst({ where: { isMainWarehouse: true }, select: { id: true, cashBalanceUsd: true } }),
    prisma.store.findMany({ where: { isMainWarehouse: false, ...(storeFilter ? { id: storeFilter } : {}) },
      select: { id: true, name: true, cashBalanceUsd: true } }),
  ]);
  // Today's (or the latest known) rate only values USD figures in TJS for display; every
  // money total below sums each record's own stored USD amount.
  const rate = rateRow ? D(rateRow) : D(0);
  const toUsd = (tjs: MoneyInput, ownRate?: MoneyInput | null) => {
    const r = D(ownRate || rate);
    return r.gt(0) ? D(tjs).div(r) : D(0);
  };
  // Bonus-device profit recorded on a sale or exchange. It is real profit for the period
  // (the device cost nothing), even though owners receive it later from the bonus pool.
  const bonusProfitOf = (logs: { action: string; financialDetails: unknown }[]) => logs
    .filter((log) => ['SALE', 'SALE_BELOW_COST', 'EXCHANGE'].includes(log.action))
    .reduce((sum, log) => sum.plus(detailNumber(log.financialDetails, 'bonusProfitUsd') ?? 0), D(0));

  // Second wave: each of these depends on an id from wave one (sale ids / store ids), so it
  // has to wait — but they are still independent of each other.
  const saleIds = periodSalesAllStores.map((s) => s.id);
  const exchangeSaleIds = [...new Set(periodExchangeLogs.map((log) => log.targetId).filter((id): id is string => Boolean(id)))];
  const logSaleIds = [...new Set([...saleIds, ...refundedSalesAllStores.map((s) => s.id), ...exchangeSaleIds])];
  const [profitLogs, exchangeSales, mainWarehouseStock, retailStock] = await Promise.all([
    logSaleIds.length
      ? prisma.auditLog.findMany({
          where: { targetId: { in: logSaleIds }, action: { in: ['SALE', 'SALE_BELOW_COST', 'EXCHANGE', 'REFUND'] } },
          select: { targetId: true, action: true, financialDetails: true },
        })
      : Promise.resolve([]),
    exchangeSaleIds.length
      ? prisma.sale.findMany({ where: { id: { in: exchangeSaleIds } }, select: { id: true, storeId: true } })
      : Promise.resolve([]),
    mainWarehouseStore
      ? prisma.device.findMany({ where: { storeId: mainWarehouseStore.id, status: 'MAIN_WAREHOUSE' }, select: { costBasisUsd: true, purchasePriceUsd: true } })
      : Promise.resolve([]),
    // Only the current in-stock devices at retail stores are needed for the per-store cards —
    // this is what actually bounds the query as devices pile up over the years, since every
    // SOLD device that ever existed would otherwise come along for the ride.
    prisma.device.findMany({
      where: { storeId: { in: retailStores.map((s) => s.id) }, status: { in: [...IN_STOCK_STATUSES] } },
      select: { storeId: true, costBasisUsd: true, purchasePriceUsd: true },
    }),
  ]);
  const profitsBySale = new Map<string, typeof profitLogs>();
  for (const log of profitLogs) {
    if (log.targetId) profitsBySale.set(log.targetId, [...(profitsBySale.get(log.targetId) ?? []), log]);
  }
  const originalSaleProfit = (saleId: string) => {
    const original = (profitsBySale.get(saleId) ?? []).find((log) => log.action === 'SALE' || log.action === 'SALE_BELOW_COST');
    return original ? { details: original.financialDetails, profitUsd: detailNumber(original.financialDetails, 'recognizedProfitUsd') } : undefined;
  };

  // Revenue and profit are built from three kinds of events, each reported in the period
  // it happened — the same moments owner profit is accrued, so monthly figures match the
  // Owners page (bonus-device profit included here reaches owners when the bonus pool is
  // distributed) and a closed month never changes when a sale is refunded later.
  const profitEvents: ProfitEvent[] = [];
  for (const sale of periodSalesAllStores) {
    const saleRate = sale.exchangeRate || rate;
    const original = originalSaleProfit(sale.id);
    if (original?.profitUsd === undefined) {
      // Legacy sale without an audited original: reported whole (exchanges included), as before.
      const cost = sale.saleItems.reduce((sum, item) => D(sum).plus(item.costBasisUsd), D(0));
      profitEvents.push({ storeId: sale.storeId, revenueUsd: D(sale.totalUsd), revenueTjs: D(sale.totalTjs), profitUsd: roundMoney(D(sale.totalUsd).minus(cost)), rate: saleRate });
    } else {
      profitEvents.push({
        storeId: sale.storeId,
        revenueUsd: D(detailNumber(original.details, 'amountUsd') ?? sale.totalUsd),
        revenueTjs: D(detailNumber(original.details, 'amountTjs') ?? sale.totalTjs),
        profitUsd: D(original.profitUsd).plus(detailNumber(original.details, 'bonusProfitUsd') ?? 0),
        rate: saleRate,
      });
    }
  }
  const exchangeStoreBySale = new Map(exchangeSales.map((sale) => [sale.id, sale.storeId]));
  let exchangesCount = 0;
  for (const log of periodExchangeLogs) {
    const storeId = log.targetId ? exchangeStoreBySale.get(log.targetId) : undefined;
    const profitUsd = detailNumber(log.financialDetails, 'exchangeProfitUsd');
    // A legacy sale is already reported whole above, exchanges included.
    if (!storeId || (storeFilter && storeId !== storeFilter) || profitUsd === undefined || originalSaleProfit(log.targetId!)?.profitUsd === undefined) continue;
    const newPriceUsd = detailNumber(log.financialDetails, 'newPriceUsd') ?? 0;
    const newPriceTjs = detailNumber(log.financialDetails, 'newPriceTjs') ?? 0;
    exchangesCount++;
    profitEvents.push({
      storeId,
      revenueUsd: D(newPriceUsd).minus(detailNumber(log.financialDetails, 'exchangeInValueUsd') ?? 0),
      revenueTjs: D(newPriceTjs).minus(detailNumber(log.financialDetails, 'exchangeInValueTjs') ?? 0),
      profitUsd: D(profitUsd).plus(detailNumber(log.financialDetails, 'bonusProfitUsd') ?? 0),
      rate: newPriceUsd ? D(newPriceTjs).div(newPriceUsd) : rate,
    });
  }
  let refundsRevenueUsd = D(0);
  for (const sale of refundedSalesAllStores) {
    const logs = profitsBySale.get(sale.id) ?? [];
    const cost = sale.saleItems.reduce((sum, item) => D(sum).plus(item.costBasisUsd), D(0));
    const hasOriginal = originalSaleProfit(sale.id)?.profitUsd !== undefined;
    const reversedProfitUsd = D(calculateRecognizedProfit(logs, D(sale.totalUsd).minus(cost))).plus(hasOriginal ? bonusProfitOf(logs) : 0);
    const refundLog = logs.find((log) => log.action === 'REFUND');
    const resoldTradeInAdjustmentUsd = detailNumber(refundLog?.financialDetails, 'resoldTradeInAdjustmentUsd') ?? 0;
    refundsRevenueUsd = refundsRevenueUsd.plus(sale.totalUsd);
    profitEvents.push({
      storeId: sale.storeId,
      revenueUsd: D(sale.totalUsd).negated(),
      revenueTjs: D(sale.totalTjs).negated(),
      profitUsd: D(reversedProfitUsd).negated().plus(resoldTradeInAdjustmentUsd),
      rate: sale.exchangeRate || rate,
    });
  }

  // Unit/receipt/model statistics count only sales that stayed sold: a refunded device goes
  // back to stock and is counted again when it is resold. (Money is handled by profitEvents.)
  const keptSalesAllStores = periodSalesAllStores.filter((s) => s.status !== 'REFUNDED');
  const periodSales = storeFilter ? keptSalesAllStores.filter((s) => s.storeId === storeFilter) : keptSalesAllStores;
  const periodExpenses = storeFilter ? periodExpensesAllStores.filter((e) => e.storeId === storeFilter) : periodExpensesAllStores;

  const totals = sumProfitEvents(profitEvents);
  const revenueUsd = totals.revenueUsd;
  const cogsUsd = totals.cogsUsd;
  let unitsSold = 0;
  const modelCounts: Record<string, { count: number; revenueUsd: MoneyInput; cogsUsd: MoneyInput; profitUsd: MoneyInput }> = {};
  let giftDeviceUnitsSold = 0;
  let giftDeviceProfitUsd = D(0);
  let giftDeviceProfitTjs = D(0);

  periodSales.forEach((sale) => {
    const saleRate = sale.exchangeRate || rate;
    sale.saleItems.forEach((item) => {
      unitsSold++;
      const itemCostUsd = item.costBasisUsd ?? item.purchaseCostUsd ?? 0;
      const itemPriceUsd = item.salePriceUsd || roundMoney(toUsd(item.salePriceTjs, saleRate));
      const itemProfitUsd = D((D(itemPriceUsd).minus(itemCostUsd)).toFixed(2));

      const modelKey = `${item.brand} ${item.model}`.trim();
      if (!modelCounts[modelKey]) modelCounts[modelKey] = { count: 0, revenueUsd: D(0), cogsUsd: D(0), profitUsd: D(0) };
      modelCounts[modelKey].count += 1;
      modelCounts[modelKey].revenueUsd = D(modelCounts[modelKey].revenueUsd).plus(itemPriceUsd);
      modelCounts[modelKey].cogsUsd = D(modelCounts[modelKey].cogsUsd).plus(itemCostUsd);
      modelCounts[modelKey].profitUsd = D(modelCounts[modelKey].profitUsd).plus(itemProfitUsd);

      if (D(itemCostUsd).isZero()) {
        giftDeviceUnitsSold += 1;
        giftDeviceProfitUsd = D(giftDeviceProfitUsd).plus(itemPriceUsd);
        giftDeviceProfitTjs = D(giftDeviceProfitTjs).plus(item.salePriceTjs || D(itemPriceUsd).mul(saleRate));
      }
    });
  });

  const grossProfitUsd = D((D(revenueUsd).minus(cogsUsd)).toFixed(2));
  const revenueTjs = roundMoney(totals.revenueTjs);
  const cogsTjs = roundMoney(totals.cogsTjs);
  const grossProfitTjs = D(revenueTjs).minus(cogsTjs);
  const grossMarginPercent = D(revenueUsd).gt(0) ? D((D((D(grossProfitUsd).div(revenueUsd))).mul(100)).toFixed(1)) : 0;

  const expensesTjs = periodExpenses.reduce((acc, e) => D(acc).plus((e.amountTjs || 0)), D(0));
  const expensesUsd = roundMoney(periodExpenses.reduce((acc, e) => D(acc).plus(e.amountUsd ?? toUsd(e.amountTjs || 0, e.exchangeRate)), D(0)));

  const periodCashBonuses = allBonuses.filter((b) => !storeFilter && b.bonusType === 'CASH_DISCOUNT' && b.amountUsd && dateWithinRange(b.dateReceived, dateRange));
  const periodCashBonusesUsd = periodCashBonuses.reduce((acc, b) => D(acc).plus((b.amountUsd || 0)), D(0));
  const periodCashBonusesTjs = periodCashBonuses.reduce((acc, b) => D(acc).plus(D((b.amountUsd || 0)).mul(b.exchangeRate)), D(0));

  const periodFreeDeviceBonusesReceived = allBonuses.filter((b) => b.bonusType === 'FREE_DEVICES' && dateWithinRange(b.dateReceived, dateRange)).length;
  const freeDeviceBonusesInStock = allBonuses.filter((b) => b.bonusType === 'FREE_DEVICES' && b.status !== 'SOLD').length;

  const refundedSales = storeFilter ? refundedSalesAllStores.filter((s) => s.storeId === storeFilter) : refundedSalesAllStores;
  const periodRefundPenaltiesUsd = refundedSales.reduce((acc, s) => D(acc).plus((s.penaltyFeeUsd || 0)), D(0));
  const periodRefundPenaltiesTjs = refundedSales.reduce((acc, s) => D(acc).plus((s.penaltyFeeTjs || 0)), D(0));
  const refundPenaltiesByStore = new Map<string, { usd: MoneyInput; tjs: MoneyInput }>();
  for (const s of refundedSalesAllStores) {
    if (!s.storeId) continue;
    const prev = refundPenaltiesByStore.get(s.storeId) || { usd: D(0), tjs: D(0) };
    refundPenaltiesByStore.set(s.storeId, { usd: D(prev.usd).plus((s.penaltyFeeUsd || 0)), tjs: D(prev.tjs).plus((s.penaltyFeeTjs || 0)) });
  }

  // Exchange-rate result of refunds: registers hold USD, so TJS handed back at a later rate
  // costs a different number of dollars than the sale booked (see RefundService).
  const refundFx = (sale: { id: string }) => {
    const refundLog = (profitsBySale.get(sale.id) ?? []).find((log) => log.action === 'REFUND');
    const usd = D(detailNumber(refundLog?.financialDetails, 'fxGainUsd') ?? 0);
    return { usd, tjs: usd.mul(detailNumber(refundLog?.financialDetails, 'exchangeRate') ?? rate) };
  };
  const periodRefundFxUsd = refundedSales.reduce((acc, s) => acc.plus(refundFx(s).usd), D(0));
  const periodRefundFxTjs = refundedSales.reduce((acc, s) => acc.plus(refundFx(s).tjs), D(0));
  const refundFxByStore = new Map<string, { usd: ReturnType<typeof D>; tjs: ReturnType<typeof D> }>();
  for (const s of refundedSalesAllStores) {
    const prev = refundFxByStore.get(s.storeId) || { usd: D(0), tjs: D(0) };
    const fx = refundFx(s);
    refundFxByStore.set(s.storeId, { usd: prev.usd.plus(fx.usd), tjs: prev.tjs.plus(fx.tjs) });
  }

  const netProfitUsd = roundMoney(D(grossProfitUsd).minus(expensesUsd).plus(periodCashBonusesUsd).plus(periodRefundPenaltiesUsd).plus(periodRefundFxUsd));
  const netProfitTjs = roundMoney(D(grossProfitTjs).minus(expensesTjs).plus(periodCashBonusesTjs).plus(periodRefundPenaltiesTjs).plus(periodRefundFxTjs));

  const totalSupplierDebtUsd = D(supplierDebtAgg._sum.totalDebtUsd ?? 0);
  const totalSupplierDebtTjs = roundMoney(D(totalSupplierDebtUsd).mul(rate));

  const mainWarehouseStockCostUsd = D(mainWarehouseStock.reduce((sum, d) => D(sum).plus((d.costBasisUsd ?? d.purchasePriceUsd ?? 0)), D(0)).toFixed(2));
  const mainWarehouseStockCostTjs = roundMoney(D(mainWarehouseStockCostUsd).mul(rate));
  // Registers are kept in USD; the TJS figure only values them at today's rate for display.
  const mainWarehouseCashUsd = D(mainWarehouseStore?.cashBalanceUsd ?? 0);
  const mainWarehouseCashTjs = roundMoney(mainWarehouseCashUsd.mul(rate));

  const salesByStore = groupByStore(keptSalesAllStores);
  const profitEventsByStore = groupByStore(profitEvents);
  const stockByStore = groupByStore(retailStock);
  // Expenses with no store, or booked to the main warehouse (e.g. payroll), belong to no
  // retail store — they're reported on the main-warehouse card instead.
  const expensesByStore = new Map<string, typeof periodExpenses>();
  const unassignedExpenses: typeof periodExpenses = [];
  for (const e of periodExpenses) {
    if (!e.storeId || e.storeId === mainWarehouseStore?.id) { unassignedExpenses.push(e); continue; }
    expensesByStore.set(e.storeId, [...(expensesByStore.get(e.storeId) ?? []), e]);
  }
  const summarizeExpenses = (rows: typeof periodExpenses) => {
    const byCategory = new Map<string, { category: string; amountUsd: MoneyInput; amountTjs: MoneyInput }>();
    let usd = D(0);
    let tjs = D(0);
    let unpaidTjs = D(0);
    for (const e of rows) {
      const eUsd = e.amountUsd ?? toUsd(e.amountTjs || 0, e.exchangeRate);
      usd = D(usd).plus(eUsd);
      tjs = D(tjs).plus(e.amountTjs || 0);
      if (e.status === 'UNPAID') unpaidTjs = D(unpaidTjs).plus(e.amountTjs || 0);
      const prev = byCategory.get(e.category) ?? { category: e.category, amountUsd: D(0), amountTjs: D(0) };
      byCategory.set(e.category, { category: e.category, amountUsd: D(prev.amountUsd).plus(eUsd), amountTjs: D(prev.amountTjs).plus((e.amountTjs || 0)) });
    }
    return {
      expensesUsd: D(usd.toFixed(2)),
      expensesTjs: roundMoney(tjs),
      unpaidExpensesTjs: roundMoney(unpaidTjs),
      expensesByCategory: [...byCategory.values()]
        .map((c) => ({ ...c, amountUsd: D(D(c.amountUsd).toFixed(2)), amountTjs: roundMoney(c.amountTjs) }))
        .sort((a, b) => D(b.amountUsd).comparedTo(a.amountUsd)),
    };
  };
  const storeBreakdown = retailStores
    .map((store) => {
      const storeSales = (salesByStore.get(store.id) ?? []);
      const storeTotals = sumProfitEvents(profitEventsByStore.get(store.id) ?? []);
      const storeRevenueUsd = storeTotals.revenueUsd;
      const storeRevenueTjs = storeTotals.revenueTjs;
      const storeCogsUsd = storeTotals.cogsUsd;
      const storeCogsTjs = storeTotals.cogsTjs;
      const storeProfitUsd = storeRevenueUsd.minus(storeCogsUsd);
      const storeProfitTjs = storeRevenueTjs.minus(storeCogsTjs);
      let storeUnits = 0;
      const storeModels = new Map<string, { name: string; count: number; revenueUsd: MoneyInput; profitUsd: MoneyInput }>();
      storeSales.forEach((sale) => {
        const saleRate = sale.exchangeRate || rate;
        storeUnits += sale.saleItems.length;
        for (const item of sale.saleItems) {
          const name = `${item.brand} ${item.model}`.trim();
          const itemPriceUsd = item.salePriceUsd || roundMoney(toUsd(item.salePriceTjs, saleRate));
          const itemCostUsd = item.costBasisUsd ?? item.purchaseCostUsd ?? 0;
          const prev = storeModels.get(name) ?? { name, count: 0, revenueUsd: D(0), profitUsd: D(0) };
          storeModels.set(name, { name, count: prev.count + 1, revenueUsd: D(prev.revenueUsd).plus(itemPriceUsd), profitUsd: D(D(prev.profitUsd).plus(itemPriceUsd)).minus(itemCostUsd) });
        }
      });
      const storeExpenses = summarizeExpenses(expensesByStore.get(store.id) ?? []);
      const stock = (stockByStore.get(store.id) ?? []);
      const stockCostUsd = stock.reduce((sum, d) => D(sum).plus((d.costBasisUsd ?? d.purchasePriceUsd ?? 0)), D(0));
      // Same "с учетом возвратов" treatment as the overall totals: a refund reverses the
      // sale's margin in the refund's own period; the withheld penalty is retained profit.
      const storePenalty = refundPenaltiesByStore.get(store.id) || { usd: D(0), tjs: D(0) };
      const storeFx = refundFxByStore.get(store.id) || { usd: D(0), tjs: D(0) };
      return {
        storeId: store.id,
        storeName: store.name,
        revenueUsd: D(storeRevenueUsd.toFixed(2)),
        revenueTjs: roundMoney(storeRevenueTjs),
        cogsUsd: D(storeCogsUsd.toFixed(2)),
        cogsTjs: roundMoney(storeCogsTjs),
        profitUsd: roundMoney(D(storeProfitUsd).plus(storePenalty.usd).plus(storeFx.usd)),
        profitTjs: roundMoney(D(storeProfitTjs).plus(storePenalty.tjs).plus(storeFx.tjs)),
        refundPenaltiesUsd: roundMoney(storePenalty.usd),
        refundFxUsd: roundMoney(storeFx.usd),
        ...storeExpenses,
        netProfitUsd: roundMoney(D(storeProfitUsd).plus(storePenalty.usd).plus(storeFx.usd).minus(storeExpenses.expensesUsd)),
        netProfitTjs: roundMoney(D(storeProfitTjs).plus(storePenalty.tjs).plus(storeFx.tjs).minus(storeExpenses.expensesTjs)),
        topModels: [...storeModels.values()]
          .map((m) => ({ ...m, revenueUsd: D(D(m.revenueUsd).toFixed(2)), profitUsd: D(D(m.profitUsd).toFixed(2)) }))
          .sort((a, b) => b.count - a.count || D(b.profitUsd).comparedTo(a.profitUsd))
          .slice(0, 5),
        unitsSold: storeUnits,
        salesCount: storeSales.length,
        refundsCount: refundedSalesAllStores.filter((sale) => sale.storeId === store.id).length,
        cashUsd: D(store.cashBalanceUsd ?? 0),
        cashTjs: roundMoney(D(store.cashBalanceUsd ?? 0).mul(rate)),
        stockCount: stock.length,
        stockCostUsd: D(stockCostUsd.toFixed(2)),
        stockCostTjs: roundMoney(D(stockCostUsd).mul(rate)),
      };
    })
    .sort((a, b) => D(b.revenueUsd).comparedTo(a.revenueUsd));

  const sortedModelList = Object.entries(modelCounts)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => D(b.profitUsd).comparedTo(a.profitUsd) || D(b.revenueUsd).comparedTo(a.revenueUsd));

  return {
    unitsSold,
    // Lets the frontend show "X чеков" per store/overall straight from this summary,
    // instead of fetching the full sales list (only actually needed for the Excel export).
    salesCount: periodSales.length,
    // Refunds/exchanges processed in the period (revenue/profit above already include them).
    refundsCount: refundedSalesAllStores.length,
    refundsRevenueUsd: roundMoney(refundsRevenueUsd),
    exchangesCount,
    revenueUsd: D(revenueUsd.toFixed(2)),
    revenueTjs,
    cogsUsd: D(cogsUsd.toFixed(2)),
    cogsTjs,
    grossProfitUsd: D(grossProfitUsd.toFixed(2)),
    grossProfitTjs,
    grossMarginPercent,
    // "Прибыль (с учетом возвратов)" — the single recognized-profit figure the summary card,
    // the per-store cards (storeBreakdown.profitUsd/Tjs below) and netProfitUsd/Tjs all build
    // on, so they can no longer disagree the way the old client-side per-item calc did.
    profitUsd: roundMoney(D(grossProfitUsd).plus(periodRefundPenaltiesUsd).plus(periodRefundFxUsd)),
    profitTjs: roundMoney(D(grossProfitTjs).plus(periodRefundPenaltiesTjs).plus(periodRefundFxTjs)),
    expensesTjs,
    expensesUsd,
    periodRefundPenaltiesUsd: roundMoney(periodRefundPenaltiesUsd),
    periodRefundPenaltiesTjs: roundMoney(periodRefundPenaltiesTjs),
    periodRefundFxUsd: roundMoney(periodRefundFxUsd),
    periodRefundFxTjs: roundMoney(periodRefundFxTjs),
    netProfitUsd,
    netProfitTjs,
    periodCashBonusesUsd: roundMoney(periodCashBonusesUsd),
    periodCashBonusesTjs: roundMoney(periodCashBonusesTjs),
    giftDeviceUnitsSold,
    giftDeviceProfitUsd: D(giftDeviceProfitUsd.toFixed(2)),
    giftDeviceProfitTjs: roundMoney(giftDeviceProfitTjs),
    periodFreeDeviceBonusesReceived,
    freeDeviceBonusesInStock,
    totalSupplierDebtUsd: D(totalSupplierDebtUsd.toFixed(2)),
    totalSupplierDebtTjs,
    mainWarehouseStockCount: mainWarehouseStock.length,
    mainWarehouseStockCostUsd,
    mainWarehouseStockCostTjs,
    mainWarehouseCashUsd,
    mainWarehouseCashTjs,
    // Expenses not tied to any retail store (general business + main-warehouse bookings).
    mainWarehouseExpenses: summarizeExpenses(unassignedExpenses),
    topSuppliersByDebt: topSuppliersByDebt.map((s) => ({
      id: s.id,
      name: s.name,
      totalPurchasedUsd: s.totalPurchasedUsd,
      totalPaidUsd: s.totalPaidUsd,
      totalDebtUsd: s.totalDebtUsd,
    })),
    storeBreakdown,
    modelCounts: sortedModelList,
  };
}
