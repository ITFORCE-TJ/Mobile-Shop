import type { Prisma } from '@prisma/client';
import { moneyJson, type MoneyInput } from '../../common/decimal';
import type { TransactionClient } from '../../prisma/prisma.service';
import { onCommit } from '../../common/after-commit';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export interface AdminNotificationInput {
  /** Stable machine name of the business event, e.g. 'STORE_RECEIPT', 'CASH_COLLECTION'. */
  actionType: string;
  title: string;
  message: string;
  /** One notification per business event: e.g. `STORE_RECEIPT:<receiptId>`. */
  dedupeKey: string;
  store?: { id: string; name: string } | null;
  actor?: { id: string; name: string } | null;
  amountTjs?: MoneyInput | null;
  amountUsd?: MoneyInput | null;
  /** Human document reference: receipt / transaction number. */
  documentRef?: string | null;
  /** Record the notification opens (deep link). */
  targetType?: string;
  targetId?: string;
  targetRoute?: string;
  details?: unknown;
}

/**
 * Records an ADMIN notification for a completed business event, inside the same database
 * transaction as the event (so both commit or neither does). A retry of the same event finds
 * the existing row by its dedupe key. The realtime push goes to admins only, after commit.
 */
export async function notifyAdmins(tx: TransactionClient, input: AdminNotificationInput) {
  const existing = await tx.notification.findUnique({ where: { dedupeKey: input.dedupeKey } });
  if (existing) return existing;
  const notification = await tx.notification.create({
    data: {
      title: input.title,
      message: input.message,
      targetRole: 'ADMIN',
      targetType: input.targetType ?? input.actionType,
      targetId: input.targetId,
      targetRoute: input.targetRoute,
      actionType: input.actionType,
      storeId: input.store?.id,
      storeName: input.store?.name,
      actorUserId: input.actor?.id,
      actorName: input.actor?.name,
      amountTjs: input.amountTjs ?? undefined,
      amountUsd: input.amountUsd ?? undefined,
      documentRef: input.documentRef ?? undefined,
      details: input.details === undefined ? undefined : (moneyJson(input.details) as Prisma.InputJsonValue),
      dedupeKey: input.dedupeKey,
    },
  });
  onCommit(() => RealtimeSyncGateway.broadcast('NOTIFICATION_CREATED', { id: notification.id }, { roles: ['ADMIN'] }));
  return notification;
}
