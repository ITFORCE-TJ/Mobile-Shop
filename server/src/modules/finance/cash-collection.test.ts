import { describe, it, expect } from 'vitest';
import { CashCollectionService } from './cash-collection.service';

describe('CashCollectionService validation and safety', () => {
  it('rejects non-positive cash collection amounts', async () => {
    await expect(
      CashCollectionService.collect({
        storeId: 'store-siyoma',
        amountUsd: 0,
        actorUserId: 'user-admin',
      })
    ).rejects.toThrow('Сумма инкассации должна быть больше нуля');

    await expect(
      CashCollectionService.collect({
        storeId: 'store-siyoma',
        amountUsd: -50,
        actorUserId: 'user-admin',
      })
    ).rejects.toThrow('Сумма инкассации должна быть больше нуля');
  });

  it('rejects collection from non-existent store', async () => {
    await expect(
      CashCollectionService.collect({
        storeId: 'non-existent-store-id',
        amountUsd: 100,
        actorUserId: 'user-admin',
      })
    ).rejects.toThrow();
  });
});
