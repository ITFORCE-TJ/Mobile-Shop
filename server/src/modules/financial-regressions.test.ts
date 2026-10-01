import '../common/decimal-test-setup';
import { D } from '../common/decimal';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const model = () => ({ findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
    create: vi.fn(), createMany: vi.fn(), delete: vi.fn() });
  return {
    supplier: model(), supplierInvoice: model(), supplierPayment: model(), supplierPaymentAllocation: model(),
    store: model(), ledgerEntry: model(), auditLog: model(), sale: model(), owner: model(), device: model(), deviceTimelineEvent: model(),
    financialAccount: model(), financialTransaction: model(), financialCategory: model(), bonusPoolEntry: model(),
    storeProfitShare: { ...model(), count: vi.fn() },
    $queryRaw: vi.fn(),
  };
});
vi.mock('../prisma/prisma.service', () => ({ prisma: { $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } }));
vi.mock('../common/actor', () => ({ resolveActor: async () => ({ id: 'admin', name: 'Admin', role: 'ADMIN' }) }));
vi.mock('./exchange-rate/exchange-rate.service', () => ({ requireTodayRate: async () => 10, getRateForDate: async () => 10 }));
import { SuppliersService } from './suppliers/suppliers.service';
import { RefundService } from './sales/refund.service';

beforeEach(() => {
  vi.resetAllMocks();
  db.supplier.findUnique.mockResolvedValue({ id: 'supplier', name: 'Supplier', totalDebtUsd: 200 });
  db.supplierInvoice.findMany.mockResolvedValue([{ id: 'invoice', invoiceNumber: '1', totalAmountUsd: 100, paidAmountUsd: 0 }]);
  db.supplierInvoice.findUnique.mockResolvedValue({ id: 'invoice', supplierId: 'supplier', totalAmountUsd: 100, paidAmountUsd: 50 });
  db.supplierInvoice.updateMany.mockResolvedValue({ count: 1 });
  db.supplier.updateMany.mockResolvedValue({ count: 1 });
  db.supplierPayment.create.mockResolvedValue({ id: 'payment' });
  // Finance ledger scaffolding used by postTransaction (see finance/financial-transaction.service.ts)
  // — the finance module's own tests cover its logic in detail; here it just needs
  // to not crash so these pre-existing regression tests keep exercising their own thing.
  db.financialAccount.findUnique.mockResolvedValue({ id: 'cash-account', balanceTjs: 100000, balanceUsd: 100000 });
  db.financialAccount.findFirst.mockResolvedValue({ id: 'main-account', balanceTjs: 100000, balanceUsd: 100000 });
  db.financialAccount.create.mockResolvedValue({ id: 'cash-account', balanceTjs: 0, balanceUsd: 0 });
  db.financialAccount.update.mockResolvedValue({});
  db.financialAccount.updateMany.mockResolvedValue({ count: 1 });
  db.financialCategory.findFirst.mockResolvedValue({ id: 'category-1' });
  db.financialTransaction.create.mockResolvedValue({ id: 'ftx-1' });
  db.$queryRaw.mockResolvedValue([{ issued: 1 }]);
  db.bonusPoolEntry.findMany.mockResolvedValue([]);
  // No per-store partner shares: the company-wide owner split applies.
  db.storeProfitShare.count.mockResolvedValue(0);
  db.owner.updateMany.mockResolvedValue({ count: 1 });
});

describe('supplier payment safeguards', () => {
  const input = { supplierId: 'supplier', amountUsd: 50, sourceAccount: 'STORE_CASH' as const, storeId: 'store-main', createdByUserId: 'admin' };
  it('rejects an invoice changed by a concurrent payment before allocating funds', async () => {
    db.supplierInvoice.updateMany.mockResolvedValue({ count: 0 });
    await expect(SuppliersService.pay(input)).rejects.toThrow('параллельно');
    expect(db.supplierPaymentAllocation.create).not.toHaveBeenCalled();
    expect(db.ledgerEntry.create).not.toHaveBeenCalled();
  });
  it('rejects supplier debt that cannot be allocated to invoices', async () => {
    await expect(SuppliersService.pay({ ...input, amountUsd: 150 })).rejects.toThrow('сверка');
    expect(db.ledgerEntry.create).not.toHaveBeenCalled();
  });
  it('rejects a nonexistent cash register', async () => {
    db.store.findUnique.mockResolvedValue(null);
    await expect(SuppliersService.pay({ ...input, sourceAccount: 'STORE_CASH', storeId: 'missing' })).rejects.toThrow('Касса');
    expect(db.ledgerEntry.create).not.toHaveBeenCalled();
  });
  it('does not overpay an invoice by even one cent', async () => {
    await expect(SuppliersService.payInvoice({ invoiceId: 'invoice', amountUsd: 50.01, sourceAccount: 'STORE_CASH', storeId: 'store-main', createdByUserId: 'admin' })).rejects.toThrow('остаток');
    expect(db.supplierPayment.create).not.toHaveBeenCalled();
  });
  it('preserves suppliers with financial history', async () => {
    db.supplier.findUnique.mockResolvedValue({ id: 'supplier', _count: { invoices: 0, payments: 1, devices: 0, bonuses: 0 } });
    await expect(SuppliersService.delete('supplier')).rejects.toThrow('историю');
    expect(db.supplier.delete).not.toHaveBeenCalled();
  });
});

describe('refund cash ledger', () => {
  it('retains the penalty once: receipt 1000 minus refund 900 leaves 100', async () => {
    db.sale.findUnique.mockResolvedValue({ id: 'sale', receiptNumber: 1, status: 'COMPLETED', totalTjs: 1000,
      debtAmountTjs: 0, storeId: 'store', saleItems: [{ deviceId: 'device' }] });
    db.auditLog.findMany.mockResolvedValue([{ action: 'SALE', financialDetails: { ownerProfitAllocations: [{ ownerId: 'owner', amountUsd: 20 }] } }]);
    db.owner.findMany.mockResolvedValue([{ id: 'owner', profitSharePercent: 100 }]);
    db.device.updateMany.mockResolvedValue({ count: 1 });
    db.store.updateMany.mockResolvedValue({ count: 1 });
    db.store.findUnique.mockResolvedValue({ name: 'Shop' });
    await RefundService.refund({ saleId: 'sale', reason: 'Возврат', refundAmountTjs: 900, penaltyFeeTjs: 100, paymentMethod: 'CASH', refundedByUserId: 'admin' });
    const cashMovement = db.ledgerEntry.create.mock.calls.reduce((sum, [entry]) => sum.plus(entry.data.amountTjs), D(0));
    expect(cashMovement.plus(1000)).toEqual(100);
    expect(db.owner.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: {
      totalAccruedProfitUsd: { increment: -10 }, availableProfitUsd: { increment: -10 },
    } }));
  });
});
