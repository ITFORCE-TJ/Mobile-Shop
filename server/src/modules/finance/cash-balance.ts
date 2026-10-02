import { D, type MoneyInput } from '../../common/decimal';
import type { TransactionClient } from '../../prisma/prisma.service';

interface LedgerRow {
  accountId: string;
  destinationAccountId?: string | null;
  direction: string;
  balanceCurrency: string;
  amountTjs: MoneyInput;
  amountUsd: MoneyInput;
}

/**
 * A register's cash in both currencies, rebuilt from the ledger rows that moved it. Registers
 * are kept in USD; every row also froze the TJS amount and the rate of its own day, so the TJS
 * figure is the sum of those historical amounts — never today's rate applied to the USD total.
 * Cancelled rows still count: their reversal is a separate row that undoes them.
 */
export function cashBalanceFromLedger(accountId: string, rows: LedgerRow[]): { tjs: string; usd: string } {
  let tjs = D(0);
  let usd = D(0);
  for (const r of rows) {
    if (r.balanceCurrency !== 'USD') continue;
    let sign = 0;
    if (r.accountId === accountId) sign = r.direction === 'IN' ? 1 : -1;
    else if (r.destinationAccountId === accountId) sign = 1;
    if (!sign) continue;
    tjs = tjs.plus(D(r.amountTjs).mul(sign));
    usd = usd.plus(D(r.amountUsd).mul(sign));
  }
  return { tjs: tjs.toString(), usd: usd.toString() };
}

/** Ledger rows that moved a cash account, from or into it. */
export async function loadCashLedger(tx: TransactionClient, accountId: string) {
  return tx.financialTransaction.findMany({
    where: { balanceCurrency: 'USD', OR: [{ accountId }, { destinationAccountId: accountId }] },
    select: { accountId: true, destinationAccountId: true, direction: true, balanceCurrency: true, amountTjs: true, amountUsd: true },
  });
}

/**
 * A store register's balance in both currencies as the ledger explains it: its account's rows
 * plus, for registers converted to USD by the migration (no rows for that opening balance),
 * the original TJS/USD that migration recorded in its audit entry.
 */
export async function registerLedgerBalance(db: Pick<TransactionClient, 'financialAccount' | 'financialTransaction' | 'auditLog'>, storeId: string) {
  const account = await db.financialAccount.findUnique({ where: { storeId } });
  const ledger = account ? cashBalanceFromLedger(account.id, await loadCashLedger(db as TransactionClient, account.id)) : { tjs: '0', usd: '0' };
  const migration = await db.auditLog.findFirst({ where: { action: 'CASH_REGISTER_USD_MIGRATION', targetId: storeId }, orderBy: { createdAt: 'asc' } });
  const carried = (migration?.financialDetails ?? {}) as { cashBalanceTjs?: number; cashBalanceUsd?: number };
  return { tjs: D(ledger.tjs).plus(carried.cashBalanceTjs ?? 0), usd: D(ledger.usd).plus(carried.cashBalanceUsd ?? 0) };
}
