import { D } from '../../common/decimal';
import type { Express } from 'express';
import type { Prisma } from '@prisma/client';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { SuppliersService } from './suppliers.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { dateRangeForPeriod, type ReportPeriod } from '../reports/reports.service';

const VALID_PERIODS: ReportPeriod[] = ['TODAY', 'MONTH', 'SPECIFIC_MONTH', 'ALL'];

export function registerSupplierRoutes(app: Express) {
  // Suppliers/invoices/bonuses are ADMIN+PARTNER-only, matching Sidebar's declared
  // access for the Suppliers/Bonuses pages — a SELLER has no legitimate need to read
  // supplier debt/payment data and must not be able to via a direct API call.
  app.get('/api/suppliers', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (_req, res, next) => {
    try {
      res.json(await prisma.supplier.findMany({ orderBy: { name: 'asc' } }));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/supplier-invoices', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      // A caller looking up one specific invoice (scanning a device to find its приход)
      // needs to reach any point in history — so it runs its own targeted search instead
      // of being bounded by `limit`/`period`. Everyone else gets an explicit opt-in cap
      // (existing callers that pass nothing keep today's full-history behavior).
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
      const limit = req.query.limit !== undefined ? Math.min(Math.max(Number(req.query.limit) || 0, 1), 2000) : undefined;
      // One supplier's own invoice history (Suppliers page detail view) — naturally
      // bounded to that supplier's own invoice count, not the whole business's.
      const supplierId = typeof req.query.supplierId === 'string' ? req.query.supplierId : undefined;

      let where: Prisma.SupplierInvoiceWhereInput | undefined;
      if (search) {
        where = { invoiceNumber: { contains: search, mode: 'insensitive' } };
      } else if (supplierId) {
        where = { supplierId };
      } else {
        const period = VALID_PERIODS.includes(req.query.period as ReportPeriod) ? (req.query.period as ReportPeriod) : 'ALL';
        const month = typeof req.query.month === 'string' ? req.query.month : undefined;
        const dateRange = dateRangeForPeriod(period, month);
        where = dateRange ? { date: dateRange } : undefined;
      }

      const invoices = await prisma.supplierInvoice.findMany({
        where,
        // Only the supplier name is ever read (mapSupplierInvoice) — the full row isn't needed.
        include: { groups: true, supplier: { select: { name: true } } },
        orderBy: { date: 'desc' },
        ...(search ? { take: 20 } : limit ? { take: limit } : {}),
      });
      const withComputed = invoices.map((inv) => ({
        ...inv,
        remainingAmountUsd: D(inv.totalAmountUsd).minus(inv.paidAmountUsd),
        status: D(inv.paidAmountUsd).gte(inv.totalAmountUsd) ? 'PAID' : D(inv.paidAmountUsd).gt(0) ? 'PARTIALLY_PAID' : 'UNPAID',
      }));
      res.json(withComputed);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/supplier-bonuses', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      // Bonus campaigns are infrequent (nowhere near sale/device volume), so a generous
      // opt-in cap is enough here — no search/period infrastructure needed.
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const limit = req.query.limit !== undefined ? Math.min(Math.max(Number(req.query.limit) || 0, 1), 2000) : undefined;
      res.json(await prisma.supplierBonus.findMany({
        // Only the supplier name is ever read (mapSupplierBonus) — the full row isn't needed.
        include: { freeDevices: true, supplier: { select: { name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        ...(limit ? { take: limit } : {}),
      }));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/suppliers', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const supplier = await SuppliersService.create(req.body ?? {}, req.user!.userId);
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {});
      res.status(201).json(supplier);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/suppliers/:id/payments', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { amountUsd, sourceAccount, sourceAccountId, storeId, note } = req.body ?? {};
      if (!amountUsd) {
        res.status(400).json({ message: 'Сумма оплаты (amountUsd) обязательна' });
        return;
      }
      const centralStore = await prisma.store.findFirst({
        where: { isMainWarehouse: true, active: true },
        orderBy: { cashBalanceTjs: 'desc' },
      }) ?? await prisma.store.findFirst({ where: { active: true } });
      const resolvedStoreId = storeId || sourceAccountId || centralStore?.id;
      if (!resolvedStoreId) {
        res.status(400).json({ message: 'Центральная касса не найдена' });
        return;
      }
      const resolvedSourceAccount = sourceAccount || 'STORE_CASH';
      const result = await SuppliersService.pay({
        supplierId: req.params.id,
        amountUsd: D(amountUsd),
        sourceAccount: resolvedSourceAccount,
        storeId: resolvedStoreId,
        note,
        createdByUserId: req.user!.userId,
      });
      RealtimeSyncGateway.broadcast('SUPPLIER_PAYMENT', { supplierId: req.params.id });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/supplier-invoices/:id/payments', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { amountUsd, sourceAccount, sourceAccountId, storeId } = req.body ?? {};
      if (!amountUsd) {
        res.status(400).json({ message: 'Сумма оплаты (amountUsd) обязательна' });
        return;
      }
      const centralStore = await prisma.store.findFirst({
        where: { isMainWarehouse: true, active: true },
        orderBy: { cashBalanceTjs: 'desc' },
      }) ?? await prisma.store.findFirst({ where: { active: true } });
      const resolvedStoreId = storeId || sourceAccountId || centralStore?.id;
      if (!resolvedStoreId) {
        res.status(400).json({ message: 'Центральная касса не найдена' });
        return;
      }
      const resolvedSourceAccount = sourceAccount || 'STORE_CASH';
      const result = await SuppliersService.payInvoice({
        invoiceId: req.params.id,
        amountUsd: D(amountUsd),
        sourceAccount: resolvedSourceAccount,
        storeId: resolvedStoreId,
        createdByUserId: req.user!.userId,
      });
      RealtimeSyncGateway.broadcast('SUPPLIER_PAYMENT', { invoiceId: req.params.id });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/supplier-bonuses', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const bonus = await SuppliersService.createBonus({ ...(req.body ?? {}), createdByUserId: req.user!.userId });
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {});
      res.status(201).json(bonus);
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/supplier-bonuses/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const bonus = await SuppliersService.updateBonus(req.params.id, { ...(req.body ?? {}), actorUserId: req.user!.userId });
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {});
      res.json(bonus);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/supplier-bonuses/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await SuppliersService.deleteBonus(req.params.id, req.user!.userId);
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {});
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/suppliers/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const supplier = await SuppliersService.update(req.params.id, req.body ?? {}, req.user!.userId);
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {});
      res.json(supplier);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/suppliers/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await SuppliersService.delete(req.params.id, req.user!.userId);
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {});
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/supplier-invoices/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const invoice = await SuppliersService.updateInvoice(req.params.id, req.body ?? {}, req.user!.userId);
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {});
      res.json(invoice);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/supplier-invoices/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await SuppliersService.deleteInvoice(req.params.id, req.user!.userId);
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {});
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}
