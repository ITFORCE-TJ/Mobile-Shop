import '../../common/decimal-test-setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const model = () => ({ findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() });
  return { cashHandover: model(), financialTransaction: model(), store: model(), auditLog: model(), $queryRaw: vi.fn() };
});
vi.mock('../../prisma/prisma.service', () => ({ prisma: { $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } }));
vi.mock('../../common/actor', () => ({ resolveActor: async () => ({ id: 'admin', name: 'Admin', role: 'ADMIN' }) }));

import { CashCollectionService } from './cash-collection.service';

describe('cash collection cancel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.cashHandover.findUnique.mockResolvedValue({ id: 'h1', storeId: 'store', amountTjs: 5000, amountUsd: 500, financialTransactionId: 'ftx', store: { name: 'Shop' } });
    // Both concurrent requests read the transaction before either commits.
    db.financialTransaction.findUnique.mockResolvedValue({ id: 'ftx', status: 'POSTED', transactionNumber: 'TR-1' });
  });

  it('moves no cash when another request already cancelled the same collection', async () => {
    // The collection itself is claimed: the second request finds it already cancelled.
    db.cashHandover.updateMany.mockResolvedValue({ count: 0 });
    await expect(CashCollectionService.cancel('h1', 'admin')).rejects.toThrow('уже была отменена');
    expect(db.cashHandover.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'h1', cancelledAt: null } }));
    expect(db.store.update).not.toHaveBeenCalled();
    expect(db.store.updateMany).not.toHaveBeenCalled();
  });
});
