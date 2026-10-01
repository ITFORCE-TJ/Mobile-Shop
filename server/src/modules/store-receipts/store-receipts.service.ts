import crypto from 'node:crypto';
import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { onCommit } from '../../common/after-commit';
import { notifyAdmins } from '../notifications/notification.service';
import { receiptNotificationText } from '../notifications/notification-text';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export interface StaffUser {
  userId: string;
  role: string;
  storeId?: string | null;
}

const MAX_ITEMS = 200;
const fail = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

/** IMEI as typed or scanned: trimmed, inner spaces dropped (scanners may group digits). */
export function normalizeImei(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, '') : '';
}

function nextReceiptNumber(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
  return `PR-${stamp}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

/** Only these device fields ever reach store staff — never cost, supplier or warehouse data. */
const SAFE_DEVICE = { id: true, imei: true, imei2: true, brand: true, model: true, ram: true, storage: true, color: true } as const;

function requireStaffStore(user: StaffUser): string {
  if (user.role !== 'SELLER' && user.role !== 'PARTNER') throw fail('Приход товара оформляет сотрудник магазина', 403);
  if (!user.storeId) throw fail('Пользователь не привязан ни к одному магазину', 403);
  return user.storeId;
}

/** Why a device cannot be received into `storeId` (null when it can). */
function rejectionReason(device: { imei: string; storeId: string; status: string }, warehouseId: string, storeId: string): string | null {
  if (device.storeId === warehouseId && device.status === 'MAIN_WAREHOUSE') return null;
  if (device.storeId === storeId && device.status !== 'SOLD') return `Телефон ${device.imei} уже числится в вашем магазине`;
  if (device.status === 'SOLD') return `Телефон ${device.imei} уже продан`;
  if (device.status === 'TRANSFER_PENDING') return `Телефон ${device.imei} находится в перемещении`;
  if (device.status === 'IN_REPAIR') return `Телефон ${device.imei} находится в ремонте`;
  return `Телефон ${device.imei} числится в другой точке, а не на главном складе`;
}

export class StoreReceiptsService {
  /** One scan: the phone must sit in the main warehouse. Returns only model details. */
  public static async lookup(user: StaffUser, rawImei: unknown) {
    const storeId = requireStaffStore(user);
    const imei = normalizeImei(rawImei);
    if (!imei) throw fail('Введите или отсканируйте IMEI', 400);
    const warehouse = await prisma.store.findFirst({ where: { isMainWarehouse: true }, select: { id: true } });
    if (!warehouse) throw fail('Главный склад не найден', 409);
    const device = await prisma.device.findFirst({ where: { OR: [{ imei }, { imei2: imei }] }, select: { ...SAFE_DEVICE, storeId: true, status: true } });
    if (!device) throw fail(`Телефон с IMEI ${imei} не найден. Новый товар оформляет администратор`, 404);
    const reason = rejectionReason(device, warehouse.id, storeId);
    if (reason) throw fail(reason, 409);
    const { storeId: _s, status: _st, ...safe } = device;
    return safe;
  }

  /**
   * Completes a receipt: every scanned phone moves from the main warehouse into the employee's
   * own store in one transaction and is on sale at once. Nothing is approved later — the
   * admin's acknowledgement is only a review mark. No money moves; purchase costs stay as they are.
   */
  public static async create(user: StaffUser, rawImeis: unknown) {
    const storeId = requireStaffStore(user);
    if (!Array.isArray(rawImeis) || rawImeis.length === 0) throw fail('Отсканируйте хотя бы один телефон', 400);
    if (rawImeis.length > MAX_ITEMS) throw fail(`В одном приходе не больше ${MAX_ITEMS} телефонов`, 400);
    const imeis = rawImeis.map(normalizeImei);
    if (imeis.some((i) => !i)) throw fail('Пустой IMEI в списке', 400);
    const duplicate = imeis.find((i, idx) => imeis.indexOf(i) !== idx);
    if (duplicate) throw fail(`IMEI ${duplicate} указан дважды`, 400);

    return prisma.$transaction(async (tx: TransactionClient) => {
      const actor = await resolveActor(tx, user.userId);
      const store = await tx.store.findUnique({ where: { id: storeId } });
      if (!store || !store.active || store.isMainWarehouse) throw fail('Магазин для прихода не найден', 409);
      const warehouse = await tx.store.findFirst({ where: { isMainWarehouse: true } });
      if (!warehouse) throw fail('Главный склад не найден', 409);

      // Lock the phones: a parallel receipt or sale of the same phone waits, then sees it moved.
      await tx.$queryRaw`SELECT id FROM devices WHERE imei = ANY(${imeis}) OR imei2 = ANY(${imeis}) ORDER BY id FOR UPDATE`;
      const devices = await tx.device.findMany({ where: { OR: [{ imei: { in: imeis } }, { imei2: { in: imeis } }] } });
      const byCode = new Map<string, (typeof devices)[number]>();
      for (const d of devices) { byCode.set(d.imei, d); if (d.imei2) byCode.set(d.imei2, d); }
      const missing = imeis.filter((i) => !byCode.has(i));
      if (missing.length) throw fail(`Не найдены в базе: ${missing.join(', ')}. Новый товар оформляет администратор`, 404);
      const chosen = imeis.map((i) => byCode.get(i)!);
      if (new Set(chosen.map((d) => d.id)).size !== chosen.length) throw fail('Один и тот же телефон отсканирован дважды (по двум IMEI)', 400);
      const reasons = chosen.map((d) => rejectionReason(d, warehouse.id, store.id)).filter((r): r is string => Boolean(r));
      if (reasons.length) throw fail(reasons.join('; '), 409);

      const moved = await tx.device.updateMany({
        where: { id: { in: chosen.map((d) => d.id) }, storeId: warehouse.id, status: 'MAIN_WAREHOUSE' },
        data: { storeId: store.id, status: 'STORE_STOCK' },
      });
      if (moved.count !== chosen.length) throw fail('Часть телефонов уже перемещена. Обновите список и повторите', 409);

      const receiptNumber = nextReceiptNumber();
      const receipt = await tx.storeReceipt.create({
        data: {
          receiptNumber,
          storeId: store.id,
          fromStoreId: warehouse.id,
          createdByUserId: actor.id,
          createdByName: actor.name,
          itemCount: chosen.length,
          items: {
            create: chosen.map((d) => ({ deviceId: d.id, imei: d.imei, brand: d.brand, model: d.model, ram: d.ram, storage: d.storage, color: d.color })),
          },
        },
        include: { items: true },
      });
      await tx.deviceTimelineEvent.createMany({
        data: chosen.map((d) => ({
          deviceId: d.id,
          type: 'RECEIPT',
          description: `Оприходован в «${store.name}» с главного склада (приход ${receiptNumber})`,
          userName: actor.name,
          storeName: store.name,
        })),
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'STORE_RECEIPT',
          targetId: receipt.id,
          details: `Приход ${receiptNumber}: «${store.name}» принял ${chosen.length} шт. с главного склада. IMEI: ${chosen.map((d) => d.imei).join(', ')}`,
        },
      });
      await notifyAdmins(tx, {
        actionType: 'STORE_RECEIPT',
        dedupeKey: `STORE_RECEIPT:${receipt.id}`,
        title: 'Приход товара в магазин',
        message: receiptNotificationText({ storeName: store.name, actorName: actor.name, actorRole: actor.role, count: chosen.length }),
        store: { id: store.id, name: store.name },
        actor,
        documentRef: receiptNumber,
        targetType: 'STORE_RECEIPT',
        targetId: receipt.id,
        targetRoute: `/receipts?receipt=${receipt.id}`,
        details: { imeis: chosen.map((d) => d.imei), devices: chosen.map((d) => ({ imei: d.imei, brand: d.brand, model: d.model, storage: d.storage, color: d.color })) },
      });
      onCommit(() => RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {}, { storeIds: [store.id, warehouse.id] }));
      return { ...receipt, storeName: store.name };
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async list(user: StaffUser, params: { storeId?: string; limit?: number }) {
    const scoped = user.role !== 'ADMIN';
    if (scoped && !user.storeId) return [];
    const where = scoped ? { storeId: user.storeId! } : params.storeId && params.storeId !== 'all' ? { storeId: params.storeId } : {};
    return prisma.storeReceipt.findMany({
      where,
      include: { items: true, store: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(params.limit ?? 50, 1), 200),
    });
  }

  public static async get(user: StaffUser, id: string) {
    const receipt = await prisma.storeReceipt.findUnique({ where: { id }, include: { items: true, store: { select: { name: true } } } });
    // Another store's receipt answers like a missing one, so store staff learn nothing about it.
    if (!receipt || (user.role !== 'ADMIN' && receipt.storeId !== user.storeId)) throw fail('Приход не найден', 404);
    return receipt;
  }

  /** ADMIN review mark. Changes nothing but the receipt's acknowledgement and its notification. */
  public static async acknowledge(adminUserId: string, id: string) {
    return prisma.$transaction(async (tx: TransactionClient) => {
      const actor = await resolveActor(tx, adminUserId);
      const updated = await tx.storeReceipt.updateMany({
        where: { id, acknowledgedAt: null },
        data: { acknowledgedAt: new Date(), acknowledgedByUserId: actor.id, acknowledgedByName: actor.name },
      });
      const receipt = await tx.storeReceipt.findUnique({ where: { id }, include: { items: true, store: { select: { name: true } } } });
      if (!receipt) throw fail('Приход не найден', 404);
      if (updated.count === 1) {
        await tx.notification.updateMany({
          where: { actionType: 'STORE_RECEIPT', targetId: id, read: false },
          data: { read: true, readAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            userId: actor.id, userName: actor.name, userRole: actor.role,
            action: 'STORE_RECEIPT_ACKNOWLEDGED',
            targetId: id,
            details: `Администратор ознакомился с приходом ${receipt.receiptNumber} (${receipt.store.name}, ${receipt.itemCount} шт.)`,
          },
        });
        onCommit(() => RealtimeSyncGateway.broadcast('NOTIFICATION_CREATED', { receiptId: id }, { roles: ['ADMIN'] }));
      }
      return receipt;
    }, { maxWait: 10000, timeout: 25000 });
  }
}
