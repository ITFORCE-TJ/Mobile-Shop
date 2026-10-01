import { describe, expect, it } from 'vitest';
import { buildAuditNotification, AUDIT_NOTIFICATION_RULES } from './audit-notifications';

const row = (over: Record<string, unknown>) => ({
  id: 'audit-1', action: 'SALE', details: 'Чек #12: продажа 1 устройств на сумму 9500 TJS ($871.56)', userId: 'u1', userName: 'Ахмад',
  financialDetails: { amountTjs: 9500, amountUsd: 871.56, exchangeRate: 10.9 }, targetId: 'sale-1', receiptNumber: 12, ...over,
});
const store = { id: 'store-siyoma', name: 'Сиёма' };

describe('buildAuditNotification', () => {
  it('turns a sale audit into an admin notification with store, employee, money, document and link', () => {
    const n = buildAuditNotification(row({}), { store, actorName: 'Ахмад' })!;
    expect(n).toMatchObject({
      actionType: 'SALE', title: 'Продажа', message: 'Чек #12: продажа 1 устройств на сумму 9500 TJS ($871.56)',
      dedupeKey: 'AUDIT:audit-1', store, actor: { id: 'u1', name: 'Ахмад' }, amountTjs: 9500, amountUsd: 871.56,
      documentRef: 'Чек #12', targetId: 'sale-1', targetRoute: '/sales-history',
    });
  });

  it('flags below-cost sales separately', () => {
    expect(buildAuditNotification(row({ action: 'SALE_BELOW_COST' }), { store })!.title).toBe('Продажа ниже себестоимости');
  });

  it('takes the amount each event actually reports', () => {
    expect(buildAuditNotification(row({ action: 'PAYROLL_PAYOUT', financialDetails: { paidNowTjs: 3000 } }), {})!.amountTjs).toBe(3000);
    expect(buildAuditNotification(row({ action: 'EXCHANGE', financialDetails: { differenceTjs: -200 } }), {})!.amountTjs).toBe(-200);
    expect(buildAuditNotification(row({ action: 'QUARTER_CLOSE', financialDetails: { quarterName: 'Q3 2026' } }), {})!.amountUsd).toBeNull();
  });

  it('notifies a repair only when issuing it booked a cost from the store register', () => {
    expect(buildAuditNotification(row({ action: 'REPAIR_STATUS_CHANGE', details: 'Ремонт #3 (iPhone): статус "IN_PROGRESS".', financialDetails: null }), {})).toBeNull();
    expect(buildAuditNotification(row({ action: 'REPAIR_STATUS_CHANGE', details: 'Ремонт #3 (iPhone): статус "ISSUED". Расход: 150 TJS списан с кассы магазина.', financialDetails: null }), {})!.title).toBe('Выдача ремонта с расходом');
  });

  it('ignores events that are not business transactions or already notify on their own', () => {
    for (const action of ['LOGIN', 'USER_UPDATE', 'STORE_UPDATE', 'CASH_COLLECTION', 'STORE_RECEIPT', 'TRANSFER_REQUEST']) {
      expect(buildAuditNotification(row({ action }), {})).toBeNull();
    }
  });

  it('covers every money and stock event of the business', () => {
    for (const action of ['SALE', 'SALE_BELOW_COST', 'REFUND', 'EXCHANGE', 'EXPENSE', 'EXPENSE_PAID', 'EXPENSE_EDIT', 'EXPENSE_DELETE',
      'PAYROLL_PAYOUT', 'SUPPLIER_PAYMENT', 'SUPPLIER_BONUS', 'BONUS_EDIT', 'BONUS_DELETE', 'BONUS_PROFIT_DISTRIBUTED', 'BONUS_POOL_ANNULLED',
      'PURCHASE', 'TRANSFER', 'TRANSFER_APPROVAL', 'TRANSFER_REJECT', 'STORE_CASH_ADJUSTMENT', 'OWNER_INVESTMENT', 'OWNER_WITHDRAWAL',
      'PROFIT_PAYOUT', 'REINVEST', 'QUARTER_CLOSE', 'REPAIR_STATUS_CHANGE']) {
      expect(AUDIT_NOTIFICATION_RULES[action], action).toBeDefined();
    }
  });
});
