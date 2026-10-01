import { moneyJson } from '../../common/decimal';
import '../../common/decimal-test-setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';

const db = vi.hoisted(() => ({
  sale: { findMany: vi.fn() }, expense: { findMany: vi.fn() }, supplierBonus: { findMany: vi.fn() },
  supplier: { aggregate: vi.fn(), findMany: vi.fn() }, store: { findFirst: vi.fn(), findMany: vi.fn() },
  auditLog: { findMany: vi.fn() }, device: { findMany: vi.fn() },
}));
vi.mock('../../prisma/prisma.service', () => ({ prisma: db }));
vi.mock('../exchange-rate/exchange-rate.service', () => ({ getRateForDate: async () => 10 }));
import { computeReportsSummary } from './reports.service';

const date = new Date('2026-09-15T09:00:00Z');
const stores = Array.from({ length: 20 }, (_, i) => ({ id: `store-${i}`, name: `Store ${i}`, cashBalanceUsd: 100 + i }));
const sales = Array.from({ length: 2000 }, (_, i) => ({
  id: `sale-${i}`, storeId: stores[i % 20].id, totalTjs: 3001.2, totalUsd: 300.12, exchangeRate: 10,
  createdAt: date, refundedAt: date, status: i % 13 === 0 ? 'REFUNDED' : 'COMPLETED', penaltyFeeUsd: 1.23, penaltyFeeTjs: 12.3,
  customerName: `Customer ${i}`, receiptNumber: i + 1, paymentMethod: 'CASH', cashAmountTjs: 3001.2, cardAmountTjs: 0,
  saleItems: [{ deviceId: `device-${i}`, imei: String(350000000000000 + i), storage: '128GB', color: 'Black', brand: 'Phone', model: `M${i % 7}`, salePriceUsd: 300.12, salePriceTjs: 3001.2, costBasisUsd: i % 9 ? 200.01 : 0, purchaseCostUsd: 200.01 }],
}));
const expenses = Array.from({ length: 2000 }, (_, i) => ({ id: `expense-${i}`, storeId: stores[i % 20].id, createdAt: date, amountTjs: 12.34, amountUsd: 1.23, exchangeRate: 10, comment: `Expense ${i}`, category: 'OTHER', createdByUserId: 'user' }));
const logs = sales.map((sale, i) => ({ targetId: sale.id, action: 'SALE', financialDetails: { recognizedProfitUsd: i % 9 ? 100.11 : 300.12 } }));
let workload: { table: string; rows: number; bytes: number }[];

function project(row: any, select: any): any {
  if (!select) return row;
  return Object.fromEntries(Object.entries(select).map(([key, spec]) => [key,
    typeof spec === 'object' && spec && Array.isArray(row[key]) ? row[key].map((item: any) => project(item, (spec as any).select)) : row[key],
  ]));
}
function result(table: string, rows: any[], select?: any) {
  const values = rows.map((row) => project(row, select));
  workload.push({ table, rows: rows.length, bytes: Buffer.byteLength(JSON.stringify(values)) });
  return values;
}

beforeEach(() => {
  vi.clearAllMocks(); workload = [];
  db.sale.findMany.mockImplementation(async ({ where, select }) => result('sales', sales.filter((sale) =>
    (!where.storeId || sale.storeId === where.storeId) && (!where.id || where.id.in.includes(sale.id)) &&
    (where.status !== 'REFUNDED' || sale.status === 'REFUNDED')), select));
  db.expense.findMany.mockImplementation(async ({ where, select }) => result('expenses', expenses.filter((expense) => !where?.storeId || expense.storeId === where.storeId), select));
  db.auditLog.findMany.mockImplementation(async ({ where, select }) => {
    const ids = where.targetId ? new Set(where.targetId.in) : undefined;
    const actions: string[] = where.action.in ?? [where.action];
    return result('profitLogs', logs.filter((log) => (!ids || ids.has(log.targetId)) && actions.includes(log.action)), select);
  });
  db.supplierBonus.findMany.mockResolvedValue([{ bonusType: 'CASH_DISCOUNT', amountUsd: 25.5, exchangeRate: 10, dateReceived: date }, { bonusType: 'FREE_DEVICES', dateReceived: date, status: 'IN_STOCK' }]);
  db.supplier.aggregate.mockResolvedValue({ _sum: { totalDebtUsd: 123.45 } });
  db.supplier.findMany.mockResolvedValue([{ id: 'supplier', name: 'Supplier', totalPurchasedUsd: 200, totalPaidUsd: 76.55, totalDebtUsd: 123.45 }]);
  db.store.findFirst.mockResolvedValue({ id: 'warehouse', cashBalanceUsd: 34.57 });
  db.store.findMany.mockImplementation(async ({ where }) => stores.filter((store) => !where.id || store.id === where.id));
  db.device.findMany.mockImplementation(async ({ where }) => where.storeId === 'warehouse'
    ? [{ costBasisUsd: 0, purchasePriceUsd: 200 }, { costBasisUsd: 100.01, purchasePriceUsd: 90 }]
    : stores.filter((store) => where.storeId.in.includes(store.id)).map((store) => ({ storeId: store.id, costBasisUsd: 99.99, purchasePriceUsd: 80 })));
});

describe('financial report query optimization preserves all totals', () => {
  it.each(['all', 'store-0', 'store-1'])('preserves the complete report for %s', async (storeId) => {
    const summary = await computeReportsSummary({ period: 'SPECIFIC_MONTH', month: '2026-09', storeId });
    expect(db.expense.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ cancelledAt: null }) }));
    expect(moneyJson(summary)).toMatchSnapshot();
    if (process.env.REPORT_BENCHMARK_LABEL) {
      mkdirSync('output/performance', { recursive: true });
      writeFileSync(`output/performance/reports-${process.env.REPORT_BENCHMARK_LABEL}-${storeId}.json`, JSON.stringify({ storeId, workload,
        rows: workload.reduce((sum, row) => sum + row.rows, 0), bytes: workload.reduce((sum, row) => sum + row.bytes, 0) }, null, 2));
    }
  });
});
