import { prisma } from '../../prisma/prisma.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { resolveActor } from '../../common/actor';
import crypto from 'node:crypto';

function nextTransferNumber(): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `TR-${stamp}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function destinationStatusForStore(isMainWarehouse: boolean): 'MAIN_WAREHOUSE' | 'STORE_STOCK' {
  return isMainWarehouse ? 'MAIN_WAREHOUSE' : 'STORE_STOCK';
}

// A retail store's available stock includes devices returned via Trade-In (they never left
// the store, just changed status) — matching TransferPage's own "available to pick" filter.
// The main warehouse only ever holds devices with MAIN_WAREHOUSE status.
function sourceStatusesForStore(isMainWarehouse: boolean): ('MAIN_WAREHOUSE' | 'STORE_STOCK' | 'IN_STOCK_AFTER_EXCHANGE')[] {
  return isMainWarehouse ? ['MAIN_WAREHOUSE'] : ['STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'];
}

export class TransfersService {
  /**
   * Requests a transfer: devices are frozen as TRANSFER_PENDING (still physically at the
   * source store) and the request sits at PENDING_APPROVAL until an ADMIN/PARTNER approves
   * it. This is what lets a SELLER pull stock from the main warehouse into their own store
   * without being able to move it themselves — an admin confirms it remotely afterwards.
   */
  public static async create(input: { fromStoreId: string; toStoreId: string; deviceIds: string[]; requestedByUserId: string }) {
    if (!input.deviceIds || input.deviceIds.length === 0) {
      throw new Error('Выберите устройства для перемещения');
    }

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.requestedByUserId);
      const fromStore = await tx.store.findUnique({ where: { id: input.fromStoreId } });
      const toStore = await tx.store.findUnique({ where: { id: input.toStoreId } });
      if (!fromStore || !toStore) {
        throw new Error('Магазин отправления или назначения не найден в базе данных');
      }
      if (input.fromStoreId === input.toStoreId) {
        throw new Error('Магазин отправления и назначения не могут совпадать');
      }

      const sourceStatuses = sourceStatusesForStore(fromStore.isMainWarehouse);
      const devices = await tx.device.findMany({
        where: { id: { in: input.deviceIds }, storeId: input.fromStoreId, status: { in: sourceStatuses } },
      });
      if (devices.length !== input.deviceIds.length) {
        throw new Error('Одно или несколько устройств недоступны для перемещения (уже перемещаются, проданы или в ремонте)');
      }

      const transferNumber = nextTransferNumber();
      const transfer = await tx.transferRequest.create({
        data: {
          transferNumber,
          fromStoreId: input.fromStoreId,
          toStoreId: input.toStoreId,
          status: 'PENDING_APPROVAL',
          requestedByUserId: input.requestedByUserId,
          items: { create: devices.map((d) => ({ deviceId: d.id, imei: d.imei, brand: d.brand, model: d.model })) },
        },
        include: { items: true },
      });

      const holdResult = await tx.device.updateMany({
        where: { id: { in: input.deviceIds }, storeId: input.fromStoreId, status: { in: sourceStatuses } },
        data: { status: 'TRANSFER_PENDING' },
      });
      if (holdResult.count !== input.deviceIds.length) {
        throw new Error('Одно или несколько устройств стали недоступны во время перемещения');
      }

      await tx.deviceTimelineEvent.createMany({
        data: devices.map((device) => ({
          deviceId: device.id,
          type: 'TRANSFER_REQUESTED',
          description: `Запрошено перемещение ${transferNumber} в ${toStore.name}`,
          userName: actor.name,
        })),
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'TRANSFER_REQUEST',
          details: `Запрошено перемещение ${transferNumber} (${devices.length} шт.) из ${fromStore.name} в ${toStore.name}`,
          targetId: transfer.id,
        },
      });

      // Both ADMIN and PARTNER can approve (see requireRoles on the /approve route), and
      // notifications only match a single exact targetRole — so one is created per role,
      // otherwise a PARTNER-run store would never see pending requests.
      const notificationMessage = `${actor.name} запрашивает перемещение ${devices.length} устройств(о) из ${fromStore.name} в ${toStore.name}`;
      const notifications = await Promise.all(
        (['ADMIN', 'PARTNER'] as const).map((targetRole) =>
          tx.notification.create({
            data: {
              title: 'Новый запрос на перемещение',
              message: notificationMessage,
              targetType: 'TRANSFER_REQUEST',
              targetId: transfer.id,
              targetRole,
            },
          })
        )
      );

      RealtimeSyncGateway.broadcast('TRANSFER_UPDATED', { transferId: transfer.id }, { storeIds: [input.fromStoreId, input.toStoreId] });
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {}, { storeIds: [input.fromStoreId, input.toStoreId] });
      notifications.forEach((notification) => RealtimeSyncGateway.broadcast('NOTIFICATION_CREATED', notification));

      return transfer;
    }, { maxWait: 10000, timeout: 25000 });
  }

  /** ADMIN/PARTNER-only immediate move that bypasses the approval step. */
  public static async createDirect(input: { fromStoreId: string; toStoreId: string; deviceIds: string[]; requestedByUserId: string }) {
    if (!input.deviceIds || input.deviceIds.length === 0) {
      throw new Error('Выберите устройства для перемещения');
    }

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.requestedByUserId);
      const fromStore = await tx.store.findUnique({ where: { id: input.fromStoreId } });
      const toStore = await tx.store.findUnique({ where: { id: input.toStoreId } });
      if (!fromStore || !toStore) {
        throw new Error('Магазин отправления или назначения не найден в базе данных');
      }
      if (input.fromStoreId === input.toStoreId) {
        throw new Error('Магазин отправления и назначения не могут совпадать');
      }
      const sourceStatuses = sourceStatusesForStore(fromStore.isMainWarehouse);
      const destStatus = destinationStatusForStore(toStore.isMainWarehouse);

      const devices = await tx.device.findMany({
        where: { id: { in: input.deviceIds }, storeId: input.fromStoreId, status: { in: sourceStatuses } },
      });
      if (devices.length !== input.deviceIds.length) {
        throw new Error('Одно или несколько устройств недоступны для перемещения');
      }

      const transferNumber = nextTransferNumber();
      const transfer = await tx.transferRequest.create({
        data: {
          transferNumber,
          fromStoreId: input.fromStoreId,
          toStoreId: input.toStoreId,
          status: 'APPROVED',
          requestedByUserId: input.requestedByUserId,
          approvedByUserId: input.requestedByUserId,
          approvedAt: new Date(),
          items: { create: devices.map((d) => ({ deviceId: d.id, imei: d.imei, brand: d.brand, model: d.model })) },
        },
      });

      const moveResult = await tx.device.updateMany({
        where: { id: { in: input.deviceIds }, storeId: input.fromStoreId, status: { in: sourceStatuses } },
        data: { storeId: input.toStoreId, status: destStatus },
      });
      if (moveResult.count !== input.deviceIds.length) {
        throw new Error('Одно или несколько устройств стали недоступны во время перемещения');
      }

      await tx.deviceTimelineEvent.createMany({
        data: devices.map((device) => ({
          deviceId: device.id,
          type: 'TRANSFER',
          description: `Прямое перемещение ${transferNumber}`,
          userName: actor.name,
        })),
      });

      await tx.ledgerEntry.create({
        data: { type: 'TRANSFER', description: `Прямое перемещение ${transferNumber}: ${devices.length} устройств`, userName: actor.name },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'TRANSFER',
          details: `Выполнено прямое перемещение ${transferNumber}: ${devices.length} устройств`,
          targetId: transfer.id,
        },
      });

      RealtimeSyncGateway.broadcast('TRANSFER_UPDATED', { transferId: transfer.id }, { storeIds: [input.fromStoreId, input.toStoreId] });
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {}, { storeIds: [input.fromStoreId, input.toStoreId] });

      return transfer;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async approve(transferId: string, approvedByUserId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, approvedByUserId);
      // .name (ledger description) and .isMainWarehouse (destination status) are the only
      // fields actually read below — narrowed from `true` to avoid pulling cashBalanceUsd
      // and the rest of the store row along for the ride.
      const transfer = await tx.transferRequest.findUnique({
        where: { id: transferId },
        include: { items: true, fromStore: { select: { name: true, isMainWarehouse: true } }, toStore: { select: { name: true, isMainWarehouse: true } } },
      });
      if (!transfer) throw new Error('Запрос на перемещение не найден');
      if (transfer.status !== 'PENDING_APPROVAL') throw new Error('Этот запрос уже обработан');

      const deviceIds = transfer.items.map((i) => i.deviceId);
      const destStatus = destinationStatusForStore(transfer.toStore.isMainWarehouse);

      const moveResult = await tx.device.updateMany({
        where: { id: { in: deviceIds }, status: 'TRANSFER_PENDING' },
        data: { storeId: transfer.toStoreId, status: destStatus },
      });
      if (moveResult.count !== deviceIds.length) {
        throw new Error('Состояние устройств изменилось, подтверждение невозможно');
      }

      const updated = await tx.transferRequest.update({
        where: { id: transferId },
        data: { status: 'APPROVED', approvedByUserId, approvedAt: new Date() },
      });

      await tx.deviceTimelineEvent.createMany({
        data: transfer.items.map((item) => ({
          deviceId: item.deviceId,
          type: 'TRANSFER_APPROVED',
          description: `Перемещение ${transfer.transferNumber} подтверждено`,
          userName: actor.name,
        })),
      });

      await tx.ledgerEntry.create({
        data: {
          type: 'TRANSFER',
          description: `Перемещение ${transfer.transferNumber}: ${deviceIds.length} устройств из ${transfer.fromStore.name} в ${transfer.toStore.name}`,
          userName: actor.name,
        },
      });

      await tx.notification.updateMany({
        where: { targetId: transferId, targetType: 'TRANSFER_REQUEST' },
        data: { resolved: true, read: true, resolvedAt: new Date(), readAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'TRANSFER_APPROVAL',
          details: `Подтверждено перемещение ${transfer.transferNumber} (${deviceIds.length} устройств)`,
          targetId: transferId,
        },
      });

      RealtimeSyncGateway.broadcast('TRANSFER_UPDATED', { transferId }, { storeIds: [transfer.fromStoreId, transfer.toStoreId] });
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {}, { storeIds: [transfer.fromStoreId, transfer.toStoreId] });

      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async reject(transferId: string, rejectedByUserId: string, reason: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, rejectedByUserId);
      // Only .isMainWarehouse is read below — narrowed from `true`.
      const transfer = await tx.transferRequest.findUnique({ where: { id: transferId }, include: { items: true, fromStore: { select: { isMainWarehouse: true } } } });
      if (!transfer) throw new Error('Запрос на перемещение не найден');
      if (transfer.status !== 'PENDING_APPROVAL') throw new Error('Этот запрос уже обработан');

      const deviceIds = transfer.items.map((i) => i.deviceId);
      // Reverts to the generic in-stock status for that store type — a device that was
      // IN_STOCK_AFTER_EXCHANGE before the request comes back as STORE_STOCK, which is fine:
      // both statuses are treated identically everywhere else (sale/transfer eligibility).
      const revertStatus = destinationStatusForStore(transfer.fromStore.isMainWarehouse);

      // Revert both status AND location — this closes the latent inconsistency in the
      // original mock logic where rejection reverted status but left location stale.
      const revertResult = await tx.device.updateMany({
        where: { id: { in: deviceIds }, status: 'TRANSFER_PENDING' },
        data: { storeId: transfer.fromStoreId, status: revertStatus },
      });
      if (revertResult.count !== deviceIds.length) {
        throw new Error('Состояние устройств изменилось, отклонение невозможно');
      }

      const updated = await tx.transferRequest.update({
        where: { id: transferId },
        data: { status: 'REJECTED', approvedByUserId: rejectedByUserId, approvedAt: new Date(), rejectedReason: reason },
      });

      await tx.deviceTimelineEvent.createMany({
        data: transfer.items.map((item) => ({
          deviceId: item.deviceId,
          type: 'TRANSFER_REJECTED',
          description: `Перемещение ${transfer.transferNumber} отклонено: ${reason}`,
          userName: actor.name,
        })),
      });

      await tx.notification.updateMany({
        where: { targetId: transferId, targetType: 'TRANSFER_REQUEST' },
        data: { resolved: true, read: true, resolvedAt: new Date(), readAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'TRANSFER_REJECT',
          details: `Отклонено перемещение ${transfer.transferNumber}. Причина: ${reason}`,
          targetId: transferId,
        },
      });

      RealtimeSyncGateway.broadcast('TRANSFER_UPDATED', { transferId }, { storeIds: [transfer.fromStoreId, transfer.toStoreId] });
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {}, { storeIds: [transfer.fromStoreId, transfer.toStoreId] });

      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }
}
