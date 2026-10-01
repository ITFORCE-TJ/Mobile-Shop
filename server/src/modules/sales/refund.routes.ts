import { D } from '../../common/decimal';
import type { Express } from 'express';
import type { Prisma } from '@prisma/client';
import { authenticateJwt, requireRoles, enforceStoreScope, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { RefundService } from './refund.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { calculateRecognizedProfit } from './profit';
import { dateRangeForPeriod, dateRangeForCustomDates, type ReportPeriod } from '../reports/reports.service';

const VALID_PERIODS: ReportPeriod[] = ['TODAY', 'MONTH', 'SPECIFIC_MONTH', 'ALL'];

export function registerRefundRoutes(app: Express) {
  app.get('/api/sales', authenticateJwt, enforceStoreScope, async (req: AuthenticatedRequest, res, next) => {
    try {
      const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
      // A caller looking up one specific sale (refund/exchange/repair-intake scanning a
      // receipt or IMEI) needs to reach any point in history, not just the default/period
      // window — so it runs its own targeted, indexed lookup instead of being bounded by
      // `limit` or `period`. receiptNumber and Device.imei are both unique-indexed; the IMEI
      // branch goes through saleItems.deviceId (indexed) rather than needing a new index.
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
      // sellerId powers a single employee's full sales history (Employees page) — naturally
      // bounded to that one person's lifetime sales, not the whole business's.
      const sellerId = typeof req.query.sellerId === 'string' ? req.query.sellerId : undefined;
      // Explicit opt-in cap for the app's background/startup load — existing callers that
      // don't pass it (e.g. the Reports export preview's period=ALL) keep today's behavior.
      const limit = req.query.limit !== undefined ? Math.min(Math.max(Number(req.query.limit) || 0, 1), 2000) : undefined;

      let where: Prisma.SaleWhereInput;
      if (search) {
        // receiptNumber is a Postgres Int32 — an IMEI (14-15 digits) parses as a valid
        // number but overflows it, so cap what's treated as a candidate receipt number
        // to what the column can actually hold (also rules out IMEIs by length in practice).
        const parsedReceipt = /^\d+$/.test(search) ? Number(search) : NaN;
        const receiptNumber = Number.isSafeInteger(parsedReceipt) && parsedReceipt <= 2147483647 ? parsedReceipt : undefined;
        where = {
          ...(storeId ? { storeId } : {}),
          OR: [
            ...(receiptNumber !== undefined ? [{ receiptNumber }] : []),
            { saleItems: { some: { OR: [{ imei: search }, { imei2: search }] } } },
          ],
        };
      } else {
        // period/month let the Reports export preview ask for exactly the range it's showing,
        // instead of the client filtering the entire sales history it used to fetch in full.
        const period = VALID_PERIODS.includes(req.query.period as ReportPeriod) ? (req.query.period as ReportPeriod) : 'ALL';
        const month = typeof req.query.month === 'string' ? req.query.month : undefined;
        const startDate = typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate) ? req.query.startDate : undefined;
        const endDate = typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate) ? req.query.endDate : undefined;
        const dateRange = startDate
          ? dateRangeForCustomDates(startDate, endDate)
          : dateRangeForPeriod(period, month);
        where = {
          ...(storeId ? { storeId } : {}),
          ...(sellerId ? { userId: sellerId } : {}),
          ...(dateRange ? { createdAt: dateRange } : {}),
        };
      }

      const sales = await prisma.sale.findMany({
        where,
        // `user: true` used to pull the seller's full row — password hash and PIN
        // included — into every sales-history response. Only the display fields are
        // actually used (receipt "sold by"), so select those explicitly instead.
        include: {
          saleItems: { include: { device: { select: { ram: true } } } },
          exchangeEvents: true,
          store: true,
          user: { select: { id: true, name: true, role: true } }
        },
        orderBy: { createdAt: 'desc' },
        ...(search ? { take: 20 } : limit ? { take: limit } : {}),
      });
      const saleIds = sales.map((sale) => sale.id);
      const profitLogs = saleIds.length
        ? await prisma.auditLog.findMany({
            where: { targetId: { in: saleIds }, action: { in: ['SALE', 'SALE_BELOW_COST', 'EXCHANGE'] } },
            select: { targetId: true, action: true, financialDetails: true },
          })
        : [];
      const profits = new Map<string, typeof profitLogs>();
      for (const log of profitLogs) if (log.targetId) profits.set(log.targetId, [...(profits.get(log.targetId) ?? []), log]);
      res.json(sales.map((sale) => {
        const fallbackCost = sale.saleItems.reduce((sum, item) => D(sum).plus(item.costBasisUsd), D(0));
        return {
          ...sale,
          saleItems: sale.saleItems.map((item: any) => ({
            ...item,
            ram: item.device?.ram || item.ram || undefined,
          })),
          recognizedProfitUsd: calculateRecognizedProfit(profits.get(sale.id) ?? [], D(sale.totalUsd).minus(fallbackCost))
        };
      }));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/sales/:id/refund', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { reason, refundAmountTjs, penaltyFeeTjs, paymentMethod } = req.body ?? {};
      if (!reason || refundAmountTjs == null || !paymentMethod) {
        res.status(400).json({ message: 'reason, refundAmountTjs и paymentMethod обязательны' });
        return;
      }

      const sale = await RefundService.refund({
        saleId: req.params.id,
        reason,
        // Validated (with a readable message) by RefundService — wrapping in D() here
        // turned a missing optional penalty into a raw DecimalError.
        refundAmountTjs,
        penaltyFeeTjs: penaltyFeeTjs ?? undefined,
        paymentMethod,
        refundedByUserId: req.user!.userId,
      });

      RealtimeSyncGateway.broadcast('REFUND_PROCESSED', { saleId: sale.id }, { storeIds: [sale.storeId] });
      res.json(sale);
    } catch (error) {
      next(error);
    }
  });
}
