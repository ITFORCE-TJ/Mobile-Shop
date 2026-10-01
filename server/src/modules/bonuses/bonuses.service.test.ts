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

  describe('distributeBonusProfit', () => {
    it('requires periodName and non-empty allocations', async () => {
      await expect(
        BonusesService.distributeBonusProfit({
          periodName: '',
          allocations: [{ ownerId: 'o1', amountUsd: 100 }],
          userId: 'admin-1',
        })
      ).rejects.toThrow('Укажите название отчётного периода');

      await expect(
        BonusesService.distributeBonusProfit({
          periodName: '3 квартал 2026',
          allocations: [],
          userId: 'admin-1',
        })
      ).rejects.toThrow('Укажите хотя бы одного партнёра');
    });

    it('rejects if distribution amount exceeds total pending pool', async () => {
      db.bonusPoolEntry.findMany.mockResolvedValue([
        { id: 'entry-1', profitUsd: 100, status: 'PENDING' },
      ]);

      await expect(
        BonusesService.distributeBonusProfit({
          periodName: '3 квартал 2026',
          allocations: [{ ownerId: 'o1', amountUsd: 150 }],
          userId: 'admin-1',
        })
      ).rejects.toThrow('превышает остаток бонусного пула');
    });

    it('distributes bonus profit to owners and updates entries to DISTRIBUTED', async () => {
      db.bonusPoolEntry.findMany.mockResolvedValue([
        { id: 'e1', profitUsd: 100, status: 'PENDING' },
        { id: 'e2', profitUsd: 100, status: 'PENDING' },
      ]);
      db.owner.findMany.mockResolvedValue([
        { id: 'o1', name: 'Партнёр 1', availableProfitUsd: 50 },
        { id: 'o2', name: 'Партнёр 2', availableProfitUsd: 50 },
      ]);
      db.bonusDistributionLog.create.mockResolvedValue({ id: 'log-1' });
      db.bonusPoolEntry.updateMany.mockResolvedValue({ count: 2 });

      await BonusesService.distributeBonusProfit({
        periodName: '3 квартал 2026',
        allocations: [
          { ownerId: 'o1', amountUsd: 120 },
          { ownerId: 'o2', amountUsd: 80 },
        ],
        note: 'Квартальное распределение',
        userId: 'admin-1',
      });

      // Verify owner available profit updated
      expect(db.owner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'o1' },
          data: {
            totalAccruedProfitUsd: { increment: 120 },
            availableProfitUsd: { increment: 120 },
          },
        })
      );
      expect(db.owner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'o2' },
          data: {
            totalAccruedProfitUsd: { increment: 80 },
            availableProfitUsd: { increment: 80 },
          },
        })
      );

      // Verify entries updated to DISTRIBUTED
      expect(db.bonusPoolEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['e1', 'e2'] }, status: 'PENDING' },
          data: expect.objectContaining({
            status: 'DISTRIBUTED',
            distributionId: 'log-1',
          }),
        })
      );
    });
  });

  describe('annulBonusPool', () => {
    it('marks all pending entries as ANNULLED and records log', async () => {
      db.bonusPoolEntry.findMany.mockResolvedValue([
        { id: 'e1', profitUsd: 100, status: 'PENDING' },
        { id: 'e2', profitUsd: 150, status: 'PENDING' },
      ]);
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
    });
  });
});
