import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { requirePositiveMoney } from '../../common/money';
import { dateRangeForPeriod } from '../../common/business-date';
import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { createExpense } from './expenses.service';

function payrollRange(month: string) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Укажите расчётный месяц YYYY-MM');
  return dateRangeForPeriod('SPECIFIC_MONTH', month)!;
}

async function readSummary(tx: TransactionClient, employeeId: string, month: string) {
  const range = payrollRange(month);
  const employee = await tx.user.findUnique({ where: { id: employeeId } });
  if (!employee) throw new Error('Сотрудник не найден');
  const [totals] = await tx.$queryRaw<Array<{ salary: ReturnType<typeof D>; advances: ReturnType<typeof D> }>>`
    SELECT
      COALESCE(SUM(CASE WHEN e.category = 'SALARY' AND NOT e."isEmployeeAdvance"
        AND (p.month = ${month} OR (p.expense_id IS NULL AND e."createdAt" >= ${range.gte} AND e."createdAt" < ${range.lt}))
        THEN e."amountTjs" ELSE 0 END), 0) AS salary,
      COALESCE(SUM(CASE WHEN (e.category = 'EMPLOYEE_ADVANCE' OR e."isEmployeeAdvance")
        AND (e."payrollMonth" = ${month}
          OR (e."payrollMonth" IS NULL AND e."createdAt" >= ${range.gte} AND e."createdAt" < ${range.lt}))
        THEN e."amountTjs" ELSE 0 END), 0) AS advances
    FROM expenses e LEFT JOIN payroll_payouts p ON p.expense_id = e.id
    WHERE e."employeeId" = ${employeeId} AND e.status = 'PAID' AND e."cancelledAt" IS NULL`;
  return { employee, month, paidSalaryTjs: D(totals.salary), paidAdvancesTjs: D(totals.advances) };
}

export async function getPayrollSummary(employeeId: string, month: string) {
  return prisma.$transaction(async tx => {
    const { employee: _employee, ...summary } = await readSummary(tx, employeeId, month);
    return summary;
  });
}

/** The entered gross is the cumulative entitlement for the selected month, not another payment. */
export async function paySalary(input: { employeeId: string; month: string; grossTjs: MoneyInput; note?: string; actorId: string }) {
  const gross = requirePositiveMoney(input.grossTjs, 'Общая начисленная зарплата за месяц');
  payrollRange(input.month);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.employeeId} FOR UPDATE`;
    const summary = await readSummary(tx, input.employeeId, input.month);
    if (!summary.employee.storeId) throw new Error('Для выплаты сотруднику должен быть назначен магазин');
    const amount = gross.minus(summary.paidSalaryTjs).minus(summary.paidAdvancesTjs);
    if (amount.lte(0)) throw Object.assign(new Error('Начисленная сумма за месяц уже полностью выплачена с учётом зарплаты и авансов'), { statusCode: 409 });
    const expense = await createExpense(tx, {
      category: 'SALARY', amountTjs: amount, storeId: summary.employee.storeId,
      employeeId: input.employeeId, paidFromCashRegister: true, createdByUserId: input.actorId,
      description: `Зарплата за ${input.month}: начислено ${gross}; ранее выплачено ${summary.paidSalaryTjs}; оплаченные авансы ${summary.paidAdvancesTjs}; доплата ${amount}. ${input.note?.trim() || ''}`,
    });
    await tx.$executeRaw`INSERT INTO payroll_payouts (expense_id, employee_id, month, gross_tjs, previous_salary_tjs, paid_advances_tjs)
      VALUES (${expense.id}, ${input.employeeId}, ${input.month}, ${gross}, ${summary.paidSalaryTjs}, ${summary.paidAdvancesTjs})`;
    await tx.auditLog.create({ data: { userId: input.actorId, action: 'PAYROLL_PAYOUT', targetId: expense.id,
      details: `Расчёт зарплаты ${summary.employee.name} за ${input.month}`,
      financialDetails: moneyJson({ employeeId: input.employeeId, month: input.month, grossTjs: gross,
        previousSalaryTjs: summary.paidSalaryTjs, paidAdvancesTjs: summary.paidAdvancesTjs, paidNowTjs: amount }) } });
    return expense;
  }, { maxWait: 10000, timeout: 25000 });
}
