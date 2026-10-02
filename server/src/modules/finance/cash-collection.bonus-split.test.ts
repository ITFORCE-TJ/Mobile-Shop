import '../../common/decimal-test-setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { D } from '../../common/decimal';

const db = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  });
  return {
    cashHandover: model(),
    financialTransaction: model(),
    financialAccount: model(),
    store: model(),
    auditLog: model(),
    bonusPoolEntry: model(),
    notification: model(),
    $queryRaw: vi.fn(),
  };
});

vi.mock('../../prisma/prisma.service', () => ({
  prisma: {
    $transaction: (fn: (tx: typeof db) => unknown) => fn(db),
    store: db.store,
    bonusPoolEntry: db.bonusPoolEntry,
    financialAccount: db.financialAccount,
    financialTransaction: db.financialTransaction,
    cashHandover: db.cashHandover,
    auditLog: db.auditLog,
    notification: db.notification,
  },
}));

vi.mock('../../common/actor', () => ({
  resolveActor: async () => ({ id: 'user-admin', name: 'Admin', role: 'ADMIN' }),
}));

vi.mock('./cash-balance', () => ({
  cashBalanceFromLedger: () => ({ tjs: '10000', usd: '1000' }),
  loadCashLedger: async () => [],
}));

vi.mock('../notifications/notification.service', () => ({
  notifyAdmins: vi.fn().mockResolvedValue(undefined),
}));

import { CashCollectionService } from './cash-collection.service';

describe('Cash Collection Automatic Bonus Split', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Store setup: retail store with $1000 cash balance
    const sourceStore = {
      id: 'store-siyoma',
      name: 'Магазин «Сиёма»',
      isMainWarehouse: false,
      active: true,
      cashBalanceUsd: '1000',
    };
    const centralStore = {
      id: 'main-warehouse',
      name: 'Главный склад',
      isMainWarehouse: true,
      active: true,
      cashBalanceUsd: '5000',
    };

    db.store.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'store-siyoma') return sourceStore;
      if (where.id === 'main-warehouse') return centralStore;
      return null;
    });

    db.store.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.isMainWarehouse) return centralStore;
      return null;
    });

    db.store.updateMany.mockResolvedValue({ count: 1 });
    db.store.update.mockResolvedValue({});

    // Financial accounts
    const sourceAcc = { id: 'acc-siyoma', name: 'Касса Магазин «Сиёма»', type: 'CASH', storeId: 'store-siyoma', balanceUsd: '1000', balanceTjs: '10000' };
    const centralAcc = { id: 'acc-central', name: 'Касса Главный склад', type: 'CASH', storeId: 'main-warehouse', balanceUsd: '5000', balanceTjs: '50000' };
    const bonusAcc = { id: 'acc-bonus', name: 'Бонусный счёт', type: 'OTHER', storeId: null, balanceUsd: '0', balanceTjs: '0' };

    db.financialAccount.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.storeId === 'store-siyoma' || where.id === 'acc-siyoma') return sourceAcc;
      if (where.storeId === 'main-warehouse' || where.id === 'acc-central') return centralAcc;
      if (where.id === 'acc-bonus') return bonusAcc;
      return null;
    });

    db.financialAccount.findUniqueOrThrow.mockImplementation(async ({ where }: any) => {
      if (where.id === 'acc-siyoma') return sourceAcc;
      if (where.id === 'acc-central') return centralAcc;
      if (where.id === 'acc-bonus') return bonusAcc;
      return sourceAcc;
    });

    db.financialAccount.findFirst.mockImplementation(async ({ where }: any) => {
      if (where?.name === 'Бонусный счёт') return bonusAcc;
      return null;
    });

    db.financialAccount.update.mockResolvedValue({});
    db.financialAccount.updateMany.mockResolvedValue({ count: 1 });

    // Mock pending bonus device entries for store-siyoma: 2 devices totaling $300 (3000 TJS)
    db.bonusPoolEntry.findMany.mockResolvedValue([
      { id: 'b1', profitUsd: 150, profitTjs: 1500 },
      { id: 'b2', profitUsd: 150, profitTjs: 1500 },
    ]);
    db.bonusPoolEntry.updateMany.mockResolvedValue({ count: 2 });

    db.auditLog.findFirst.mockResolvedValue(null);
    db.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    db.$queryRaw.mockResolvedValue([{ issued: 1 }]);

    db.financialTransaction.create.mockImplementation(async ({ data }: any) => ({
      id: `tx-${Math.random()}`,
      transactionNumber: 'TR-1001',
      ...data,
    }));

    db.cashHandover.create.mockImplementation(async ({ data }: any) => ({
      id: 'handover-1',
      createdAt: new Date(),
      ...data,
    }));
  });

  it('automatically splits collection: clears store to 0, sends regular cash to Central and bonus cash to Bonus Account', async () => {
    const result = await CashCollectionService.collect({
      storeId: 'store-siyoma',
      expectedCashUsd: '1000',
      comment: 'Вечерняя инкассация с бонусами',
      actorUserId: 'user-admin',
    });

    // 1. Store register must be completely cleared to 0
    expect(db.store.updateMany).toHaveBeenCalledWith({
      where: { id: 'store-siyoma', cashBalanceUsd: D(1000) },
      data: { cashBalanceUsd: 0 },
    });

    // 2. Central Cash must receive only the regular portion ($700)
    expect(db.store.update).toHaveBeenCalledWith({
      where: { id: 'main-warehouse' },
      data: { cashBalanceUsd: { increment: D(700) } },
    });

    // 3. Bonus Account must receive the bonus portion ($300)
    expect(db.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-bonus' },
      data: {
        balanceUsd: { increment: D(300) },
        balanceTjs: { increment: D(3000) },
      },
    });

    // 4. Bonus entries must be marked as collected with handover ID
    expect(db.bonusPoolEntry.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'PENDING',
        distributionNote: null,
        sale: { storeId: 'store-siyoma' },
      },
      data: expect.objectContaining({
        distributionId: 'handover-1',
        distributionNote: 'COLLECTED:handover-1',
      }),
    });

    // 5. Result DTO must reflect the split
    expect(result.amountUsd).toBe(1000);
    expect(result.regularAmountUsd).toBe(700);
    expect(result.bonusAmountUsd).toBe(300);
    expect(result.bonusCount).toBe(2);
  });

  it('correctly reverts split on cancellation: deducts regular from Central, bonus from Bonus Account, and restores store cash', async () => {
    // Setup handover and original transaction
    const handover = {
      id: 'handover-1',
      storeId: 'store-siyoma',
      amountUsd: '1000',
      amountTjs: '10000',
      exchangeRate: '10.0000',
      financialTransactionId: 'tx-orig',
      acceptedByName: 'Admin',
      createdAt: new Date(),
      store: { id: 'store-siyoma', name: 'Магазин «Сиёма»' },
    };

    db.cashHandover.findUnique.mockResolvedValue(handover);
    db.financialTransaction.findUnique.mockResolvedValue({
      id: 'tx-orig',
      transactionNumber: 'TR-1001',
      status: 'POSTED',
      comment: null,
      destinationAccount: { name: 'Центральная касса' },
    });
    db.financialTransaction.updateMany.mockResolvedValue({ count: 1 });

    db.auditLog.findFirst.mockResolvedValue({
      action: 'CASH_COLLECTION',
      targetId: 'handover-1',
      financialDetails: {
        amountUsd: 1000,
        amountTjs: 10000,
        regularUsd: 700,
        bonusUsd: 300,
        bonusTxId: 'tx-bonus-1',
      },
    });

    const cancelResult = await CashCollectionService.cancel('handover-1', 'user-admin');

    // 1. Central Cash should only be deducted by the regular portion ($700)
    expect(db.store.updateMany).toHaveBeenCalledWith({
      where: { id: 'main-warehouse', cashBalanceUsd: { gte: D(700) } },
      data: { cashBalanceUsd: { decrement: D(700) } },
    });

    // 2. Bonus Account should be deducted by the bonus portion ($300)
    expect(db.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-bonus' },
      data: { balanceUsd: { decrement: D(300) } },
    });

    // 3. Retail store must receive back the FULL amount ($1000)
    expect(db.store.update).toHaveBeenCalledWith({
      where: { id: 'store-siyoma' },
      data: { cashBalanceUsd: { increment: handover.amountUsd } },
    });

    // 4. Bonus entries must be reset to uncollected PENDING
    expect(db.bonusPoolEntry.updateMany).toHaveBeenCalledWith({
      where: { distributionNote: 'COLLECTED:handover-1' },
      data: {
        distributionId: null,
        distributionNote: null,
        distributedAt: null,
        distributedBy: null,
      },
    });

    expect(cancelResult.status).toBe('CANCELLED');
    expect(cancelResult.amountUsd).toBe(1000);
    expect(cancelResult.regularAmountUsd).toBe(700);
    expect(cancelResult.bonusAmountUsd).toBe(300);
  });
});
