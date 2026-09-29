import type { Express } from 'express';
import { authenticateJwt, isStoreScopedRole, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { ExchangesService } from './exchanges.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerExchangeRoutes(app: Express) {
  app.post('/api/exchanges', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = req.body ?? {};
      if (!body.saleId || !body.returnedImei || !body.replacementDeviceId || body.newPriceTjs === null || body.exchangeInValueTjs === null) {
        res.status(400).json({ message: 'saleId, returnedImei, replacementDeviceId, exchangeInValueTjs и newPriceTjs обязательны' });
        return;
      }

      // A SELLER may only process an exchange against a sale from their own store —
      // otherwise they could move another store's replacement stock via a trade-in.
      if (isStoreScopedRole(req.user!.role)) {
        const sourceSale = await prisma.sale.findUnique({ where: { id: body.saleId } });
        if (!sourceSale || sourceSale.storeId !== req.user!.storeId) {
          res.status(403).json({ message: 'Этот чек принадлежит другому магазину' });
          return;
        }
      }

      const sale = await ExchangesService.process({ ...body, processedByUserId: req.user!.userId });
      RealtimeSyncGateway.broadcast('EXCHANGE_PROCESSED', { saleId: sale.id }, { storeIds: [sale.storeId] });
      res.json(sale);
    } catch (error) {
      next(error);
    }
  });
}
