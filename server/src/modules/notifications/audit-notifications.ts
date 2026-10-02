import type { TransactionClient } from '../../prisma/prisma.service';
import { notifyAdmins, type AdminNotificationInput } from './notification.service';

interface AuditRow {
  id: string;
  action: string;
  details: string;
  userId?: string | null;
  userName?: string | null;
  financialDetails?: unknown;
  targetId?: string | null;
  receiptNumber?: number | null;
}

type Amounts = { tjs?: unknown; usd?: unknown };
interface Rule {
  title: string;
  route: string;
  /** Which record the notification opens; also how the store is found. */
  subject?: 'sale' | 'expense' | 'transfer' | 'repair' | 'store';
  when?: (row: AuditRow) => boolean;
  amounts?: (fd: Record<string, unknown>) => Amounts;
}

const fromFd: Rule['amounts'] = (fd) => ({ tjs: fd.amountTjs, usd: fd.amountUsd });

/**
 * Business events the admin is notified about, keyed by the audit action every one of them
 * already writes inside its own transaction. CASH_COLLECTION, STORE_RECEIPT and TRANSFER_REQUEST
 * are left out: they create richer notifications themselves.
 */
export const AUDIT_NOTIFICATION_RULES: Record<string, Rule> = {
  SALE: { title: 'Продажа', route: '/sales-history', subject: 'sale', amounts: fromFd },
  SALE_BELOW_COST: { title: 'Продажа ниже себестоимости', route: '/sales-history', subject: 'sale', amounts: fromFd },
  REFUND: { title: 'Возврат', route: '/sales-history', subject: 'sale', amounts: fromFd },
  EXCHANGE: { title: 'Обмен', route: '/sales-history', subject: 'sale', amounts: (fd) => ({ tjs: fd.differenceTjs }) },
  EXPENSE: { title: 'Новый расход', route: '/expenses', subject: 'expense', amounts: fromFd },
  EXPENSE_PAID: { title: 'Оплата расхода', route: '/expenses', subject: 'expense', amounts: fromFd },
  EXPENSE_EDIT: { title: 'Расход изменён', route: '/expenses', subject: 'expense', amounts: fromFd },
  EXPENSE_DELETE: { title: 'Расход отменён', route: '/expenses', subject: 'expense', amounts: fromFd },
  PAYROLL_PAYOUT: { title: 'Выплата зарплаты', route: '/employees', subject: 'expense', amounts: (fd) => ({ tjs: fd.paidNowTjs }) },
  SUPPLIER_PAYMENT: { title: 'Оплата поставщику', route: '/suppliers', amounts: fromFd },
  SUPPLIER_BONUS: { title: 'Бонус поставщика', route: '/bonuses', amounts: fromFd },
  BONUS_EDIT: { title: 'Бонус поставщика изменён', route: '/bonuses' },
  BONUS_DELETE: { title: 'Бонус поставщика удалён', route: '/bonuses' },
  BONUS_PROFIT_DISTRIBUTED: { title: 'Распределение бонусного пула', route: '/bonuses', amounts: fromFd },
  BONUS_POOL_ANNULLED: { title: 'Бонусный пул обнулён', route: '/bonuses', amounts: fromFd },
  PURCHASE: { title: 'Приход на главный склад', route: '/purchase', amounts: fromFd },
  TRANSFER: { title: 'Перемещение выполнено', route: '/transfer', subject: 'transfer' },
  TRANSFER_APPROVAL: { title: 'Перемещение подтверждено', route: '/transfer', subject: 'transfer' },
  TRANSFER_REJECT: { title: 'Перемещение отклонено', route: '/transfer', subject: 'transfer' },
  STORE_CASH_ADJUSTMENT: { title: 'Корректировка кассы', route: '/settings', subject: 'store' },
  OWNER_INVESTMENT: { title: 'Взнос капитала партнёра', route: '/owners', amounts: fromFd },
  OWNER_WITHDRAWAL: { title: 'Изъятие капитала партнёра', route: '/owners', amounts: fromFd },
  PROFIT_PAYOUT: { title: 'Выплата прибыли партнёру', route: '/owners', amounts: fromFd },
  REINVEST: { title: 'Капитализация прибыли партнёра', route: '/owners', amounts: fromFd },
  QUARTER_CLOSE: { title: 'Закрытие квартала', route: '/owners' },
  REPAIR_STATUS_CHANGE: {
    title: 'Выдача ремонта с расходом',
    route: '/repair',
    subject: 'repair',
    // Only issuing a repair moves money (the parts/work cost leaves the store register).
    when: (row) => row.details.includes('Расход:'),
  },
};

const money = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  RENT: 'Аренда помещения',
  SALARY: 'Зарплата сотрудников',
  EMPLOYEE_ADVANCE: 'Аванс сотрудника',
  UTILITIES: 'Коммуналка и интернет',
  MARKETING: 'Реклама и маркетинг',
  REPAIR_PARTS: 'Запчасти для ремонта',
  TAXES: 'Налоги и сборы',
  SUPPLIES: 'Расходные материалы',
  OTHER: 'Прочие расходы',
};

function translateExpenseCategoryText(text: string): string {
  if (!text) return text;
  return text.replace(/\[([A-Z_]+)\]/g, (match, code) => {
    return EXPENSE_CATEGORY_LABELS[code] ? `[${EXPENSE_CATEGORY_LABELS[code]}]` : match;
  });
}

/** The notification for one audited business event, or null when the admin is not notified. */
export function buildAuditNotification(row: AuditRow, ctx: { store?: { id: string; name: string } | null; actorName?: string | null }): AdminNotificationInput | null {
  const rule = AUDIT_NOTIFICATION_RULES[row.action];
  if (!rule || (rule.when && !rule.when(row))) return null;
  const fd = row.financialDetails && typeof row.financialDetails === 'object' ? (row.financialDetails as Record<string, unknown>) : {};
  const amounts = rule.amounts ? rule.amounts(fd) : {};
  const actorName = row.userName || ctx.actorName || null;
  return {
    actionType: row.action,
    title: rule.title,
    message: translateExpenseCategoryText(row.details),
    dedupeKey: `AUDIT:${row.id}`,
    store: ctx.store ?? null,
    actor: row.userId && actorName ? { id: row.userId, name: actorName } : null,
    amountTjs: money(amounts.tjs),
    amountUsd: money(amounts.usd),
    documentRef: row.receiptNumber ? `Чек #${row.receiptNumber}` : null,
    targetType: row.action,
    targetId: row.targetId ?? undefined,
    targetRoute: rule.route,
  };
}

async function storeOf(tx: TransactionClient, subject: Rule['subject'], targetId: string | null | undefined) {
  if (!subject || !targetId) return null;
  let storeId: string | null | undefined;
  if (subject === 'sale') storeId = (await tx.sale.findUnique({ where: { id: targetId }, select: { storeId: true } }))?.storeId;
  else if (subject === 'expense') storeId = (await tx.expense.findUnique({ where: { id: targetId }, select: { storeId: true } }))?.storeId;
  else if (subject === 'transfer') storeId = (await tx.transferRequest.findUnique({ where: { id: targetId }, select: { toStoreId: true } }))?.toStoreId;
  else if (subject === 'repair') storeId = (await tx.repairTicket.findUnique({ where: { id: targetId }, select: { storeId: true } }))?.storeId;
  else storeId = targetId;
  if (!storeId) return null;
  return tx.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } });
}

/** Creates the admin notification for an audit row written inside a business transaction. */
export async function notifyFromAudit(tx: TransactionClient, row: AuditRow) {
  const rule = AUDIT_NOTIFICATION_RULES[row.action];
  if (!rule || (rule.when && !rule.when(row))) return;
  const store = await storeOf(tx, rule.subject, row.targetId);
  const actorName = row.userName || (row.userId ? (await tx.user.findUnique({ where: { id: row.userId }, select: { name: true } }))?.name : null);
  const input = buildAuditNotification(row, { store, actorName });
  if (input) await notifyAdmins(tx, input);
}

/**
 * The transaction client with audit writes followed by their admin notification, in the same
 * transaction: a rolled-back operation leaves neither, a replayed request creates neither again.
 */
export function withAuditNotifications<T extends TransactionClient>(tx: T): T {
  const auditLog = new Proxy(tx.auditLog, {
    get(target, prop) {
      if (prop === 'create') {
        return async (args: Parameters<typeof target.create>[0]) => {
          const row = await target.create(args);
          await notifyFromAudit(tx, row);
          return row;
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return new Proxy(tx, {
    get(target, prop) {
      if (prop === 'auditLog') return auditLog;
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
