import { translateExpenseText } from './expenseCategories';

const actions: Record<string, string> = {
  LOGIN: 'Вход в систему', LOGOUT: 'Выход из системы', RATE_SET: 'Установлен курс доллара',
  USER_CREATE: 'Добавлен сотрудник', USER_UPDATE: 'Изменены данные сотрудника', USER_DELETE: 'Удалён сотрудник', USER_STATUS_CHANGE: 'Изменён статус сотрудника',
  SALE: 'Оформлена продажа', SALE_BELOW_COST: 'Продажа ниже себестоимости', REFUND: 'Возврат продажи', PURCHASE: 'Приход товара', EXCHANGE: 'Обмен устройства',
  TRANSFER: 'Перемещение товара', TRANSFER_REQUEST: 'Запрос на перемещение', TRANSFER_APPROVAL: 'Перемещение одобрено', TRANSFER_REJECT: 'Перемещение отклонено',
  REPAIR_INTAKE: 'Устройство принято в ремонт', REPAIR_STATUS_CHANGE: 'Изменён статус ремонта',
  EXPENSE: 'Добавлен расход', EXPENSE_EDIT: 'Изменён расход', EXPENSE_DELETE: 'Удалён расход', EXPENSE_PAID: 'Оплачен расход', PAYROLL_PAYOUT: 'Выплачена зарплата',
  OWNER_INVESTMENT: 'Внесение капитала', OWNER_WITHDRAWAL: 'Изъятие капитала', OWNER_LINK_USER: 'Привязка партнёра к сотруднику', INITIALIZE_OWNERS: 'Созданы партнёры',
  PROFIT_PAYOUT: 'Выплата прибыли', PROFIT_SHARE_CHANGE: 'Изменены доли прибыли', QUARTER_CLOSE: 'Закрыт квартал', REINVEST: 'Реинвестирование прибыли',
  STORE_CREATE: 'Создан магазин', STORE_UPDATE: 'Изменён магазин', STORE_DELETE: 'Удалён магазин', STORE_MERGE: 'Объединены магазины', STORE_CASH_ADJUSTMENT: 'Корректировка кассы',
  SUPPLIER_PAYMENT: 'Оплата поставщику', SUPPLIER_BONUS: 'Получен бонус поставщика', BONUS_EDIT: 'Изменён бонус', BONUS_DELETE: 'Удалён бонус', CASH_LEDGER_RECONCILIATION: 'Сверка кассы и финансового счёта',
};
const roles: Record<string, string> = { ADMIN: 'Администратор', PARTNER: 'Партнёр', SELLER: 'Продавец', SYSTEM: 'Система' };
export const auditActionLabel = (value: string) => actions[value] || (/^[A-Z_]+$/.test(value) ? 'Другое действие' : value);
export const auditRoleLabel = (value?: string) => roles[value || 'SYSTEM'] || 'Сотрудник';
export const auditDetailsLabel = (value: string) => {
  const withRoles = value.replace(/\b(ADMIN|PARTNER|SELLER|SYSTEM|USD|TJS)\b/g, token => roles[token] || (token === 'USD' ? 'долл. США' : 'сомони'));
  return translateExpenseText(withRoles);
};
export const auditDateLabel = (value: string) => new Date(value).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

