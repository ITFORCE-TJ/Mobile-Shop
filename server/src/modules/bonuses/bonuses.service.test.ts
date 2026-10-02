import '../../common/decimal-test-setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    delete: vi.fn(),
  });
  return {
    bonusPoolEntry: model(),
    bonusDistributionLog: model(),
    owner: model(),
    auditLog: model(),
    supplierBonus: model(),
    $queryRaw: vi.fn(),
  };
});

vi.mock('../../prisma/prisma.service', () => ({
  prisma: {
    ...db,
    $transaction: (fn: (tx: typeof db) => unknown) => fn(db),
  },
}));

vi.mock('../../common/actor', () => ({
  resolveActor: async () => ({ id: 'admin-1', name: 'Администратор', role: 'ADMIN' }),
}));

import { BonusesService } from './bonuses.service';

describe('BonusesService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getBonusPool', () => {
    it('calculates pending profit sum correctly across pending entries', async () => {
      db.bonusPoolEntry.findMany.mockResolvedValue([
        { id: 'entry-1', profitUsd: 200, profitTjs: 2000, status: 'PENDING' },
        { id: 'entry-2', profitUsd: 150, profitTjs: 1500, status: 'PENDING' },
      ]);
      db.bonusDistributionLog.findMany.mockResolvedValue([]);

      const result = await BonusesService.getBonusPool();

      expect(result.pendingCount).toBe(2);
      expect(Number(result.pendingProfitUsd)).toBe(350);
      expect(Number(result.pendingProfitTjs)).toBe(3500);
      expect(result.pendingEntries).toHaveLength(2);
    });
  });

  describe('bonuses are not owner income', () => {
    it('has no way to distribute the bonus pool to owners', () => {
      expect('distributeBonusProfit' in BonusesService).toBe(false);
    });
  });

  describe('quarterSummary', () => {
    it('counts the quarter since the last close: cash bonuses and sold bonus phones', async () => {
      const lastClose = new Date('2026-07-01T00:00:00Z');
      db.bonusDistributionLog.findFirst.mockResolvedValue({ createdAt: lastClose });
      db.supplierBonus.findMany
        .mockResolvedValueOnce([{ amountUsd: 200, exchangeRate: 10 }, { amountUsd: 50.5, exchangeRate: 11 }])
        .mockResolvedValueOnce([{ id: 'fd-1' }]);
      db.bonusPoolEntry.findMany.mockResolvedValue([{ profitUsd: 150, profitTjs: 1500 }]);

      const quarter = await BonusesService.quarterSummary();

      expect(db.supplierBonus.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { bonusType: 'CASH_DISCOUNT', createdAt: { gt: lastClose } } }));
      expect(quarter).toMatchObject({ since: lastClose.toISOString(), cashBonusesCount: 2, bonusDevicesReceived: 1, bonusDevicesSold: 1 });
      expect(Number(quarter.cashBonusesUsd)).toBe(250.5);
      expect(Number(quarter.cashBonusesTjs)).toBe(2555.5);
      expect(Number(quarter.bonusDeviceProfitUsd)).toBe(150);
    });
  });

  describe('annulBonusPool', () => {
    it('marks all pending entries as ANNULLED and records log', async () => {
      db.bonusPoolEntry.findMany.mockResolvedValue([
        { id: 'e1', profitUsd: 100, profitTjs: 1000, status: 'PENDING' },
        { id: 'e2', profitUsd: 150, profitTjs: 1500, status: 'PENDING' },
      ]);
      db.supplierBonus.findMany.mockResolvedValue([]);
      db.bonusDistributionLog.create.mockResolvedValue({ id: 'log-annul' });

      await BonusesService.annulBonusPool({
        periodName: 'Закрытие 3 квартала',
        note: 'Обнуление после квартального отчёта',
        userId: 'admin-1',
      });

      expect(db.bonusDistributionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'ANNULMENT',
            totalAmountUsd: 250,
          }),
        })
      );

      expect(db.bonusPoolEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PENDING' },
          data: expect.objectContaining({
            status: 'ANNULLED',
          }),
        })
      );
      // Zeroed, not credited to anyone.
      expect(db.owner.update).not.toHaveBeenCalled();
      expect(db.owner.updateMany).not.toHaveBeenCalled();
    });

    it('refuses to close an empty quarter', async () => {
      db.bonusPoolEntry.findMany.mockResolvedValue([]);
      db.supplierBonus.findMany.mockResolvedValue([]);

      await expect(BonusesService.annulBonusPool({ periodName: 'Пусто', userId: 'admin-1' }))
        .rejects.toThrow('За этот квартал бонусов нет');
      expect(db.bonusDistributionLog.create).not.toHaveBeenCalled();
    });
  });
});
