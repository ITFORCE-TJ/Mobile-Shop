import { describe, it, expect } from 'vitest';
import { CashCollectionService } from './cash-collection.service';

describe('CashCollectionService validation and safety', () => {
  it('rejects a negative or missing confirmed register balance before touching the database', async () => {
    await expect(
      CashCollectionService.collect({
        storeId: 'store-siyoma',
        expectedCashUsd: -50,
        actorUserId: 'user-admin',
      })
    ).rejects.toThrow('Подтверждённый остаток кассы не может быть отрицательной');

    await expect(
      CashCollectionService.collect({
        storeId: 'store-siyoma',
        expectedCashUsd: 'abc',
        actorUserId: 'user-admin',
      })
    ).rejects.toThrow();
  });

  it('rejects collection from non-existent store', async () => {
    await expect(
      CashCollectionService.collect({
        storeId: 'non-existent-store-id',
        expectedCashUsd: 100,
        actorUserId: 'user-admin',
      })
    ).rejects.toThrow();
  });
});
