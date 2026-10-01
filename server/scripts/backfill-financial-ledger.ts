import { D } from '../src/common/decimal';
import { prisma } from '../src/prisma/prisma.service';
import { roundMoney } from '../src/common/money';

const SYSTEM_CATEGORIES: { name: string; direction: 'IN' | 'OUT' | 'NEUTRAL' }[] = [
  { name: 'Продажа', direction: 'IN' },
  { name: 'Взнос владельца', direction: 'IN' },
  { name: 'Прочий доход', direction: 'IN' },
  { name: 'Возврат покупателю', direction: 'OUT' },
  { name: 'Оплата поставщику', direction: 'OUT' },
  { name: 'Изъятие капитала владельцем', direction: 'OUT' },
  { name: 'Выплата прибыли владельцу', direction: 'OUT' },
  { name: 'Прочий расход', direction: 'OUT' },
];

// LedgerType -> (FinancialTransactionType, direction). `null` entries never moved a
// real balance in the old system either (inventory-only, profit-only, or a feature
// that was never implemented) — they're skipped rather than guessed at.
const TYPE_MAP: Record<string, { type: string; direction: 'IN' | 'OUT' } | null> = {
  SALE: { type: 'INCOME', direction: 'IN' },
  CASH_SALE: { type: 'INCOME', direction: 'IN' },
  CARD_SALE: { type: 'INCOME', direction: 'IN' },
  PURCHASE: null,
  EXPENSE: { type: 'EXPENSE', direction: 'OUT' },
  SALARY: { type: 'EXPENSE', direction: 'OUT' },
  SUPPLIER_PAYMENT: { type: 'SUPPLIER_PAYMENT', direction: 'OUT' },
  OWNER_INVESTMENT: { type: 'OWNER_DEPOSIT', direction: 'IN' },
  OWNER_CAPITAL_WITHDRAWAL: { type: 'OWNER_WITHDRAWAL', direction: 'OUT' },
  OWNER_PROFIT_PAYOUT: { type: 'OWNER_WITHDRAWAL', direction: 'OUT' },
  OWNER_REINVESTMENT: null,
  EXCHANGE_SETTLEMENT: null, // sign-dependent — handled specially below
  SUPPLIER_BONUS: null,
  TRANSFER: null,
  REFUND: { type: 'REFUND', direction: 'OUT' },
  CUSTOMER_PAYMENT: null,
};

const CATEGORY_BY_TYPE: Record<string, string> = {
  SALE: 'Продажа',
  CASH_SALE: 'Продажа',
  CARD_SALE: 'Продажа',
  EXPENSE: 'Прочий расход',
  SALARY: 'Прочий расход',
  SUPPLIER_PAYMENT: 'Оплата поставщику',
  OWNER_INVESTMENT: 'Взнос владельца',
  OWNER_CAPITAL_WITHDRAWAL: 'Изъятие капитала владельцем',
  OWNER_PROFIT_PAYOUT: 'Выплата прибыли владельцу',
  REFUND: 'Возврат покупателю',
};

async function main() {
  const alreadyRan = await prisma.financialTransaction.findFirst();
  if (alreadyRan) {
    console.log('financial_transactions is not empty — backfill already ran, exiting.');
    return;
  }

  const stores = await prisma.store.findMany();
  const accountByStoreId = new Map<string, string>();
  for (const store of stores) {
    const account = await prisma.financialAccount.upsert({
      where: { storeId: store.id },
      update: {},
      create: {
        name: `Касса ${store.name}`,
        type: 'CASH',
        storeId: store.id,
        balanceUsd: store.cashBalanceUsd,
        openingBalanceUsd: store.cashBalanceUsd,
      },
    });
    accountByStoreId.set(store.id, account.id);
  }

  const existingMain = await prisma.financialAccount.findFirst({ where: { type: 'MAIN' } });
  const mainAccount = existingMain ?? (await prisma.financialAccount.create({ data: { name: 'Главный счёт', type: 'MAIN' } }));
  console.log(`Seeded ${stores.length} store cash accounts + 1 main account.`);

  const categoryIdByName = new Map<string, string>();
  for (const cat of SYSTEM_CATEGORIES) {
    const existing = await prisma.financialCategory.findFirst({ where: { name: cat.name } });
    const row = existing ?? (await prisma.financialCategory.create({ data: { name: cat.name, direction: cat.direction, isSystem: true } }));
    categoryIdByName.set(cat.name, row.id);
  }
  console.log(`Seeded ${categoryIdByName.size} categories.`);

  const entries = await prisma.ledgerEntry.findMany({ orderBy: { createdAt: 'asc' } });
  let imported = 0;
  let skipped = 0;
  const sequenceCounters: Record<string, number> = {};

  const nextNumber = async (prefix: string, date: Date) => {
    const key = `${prefix}-${date.getFullYear()}`;
    sequenceCounters[key] = (sequenceCounters[key] ?? (await getPersistedCounter(key))) + 1;
    await prisma.documentSequence.upsert({
      where: { key },
      update: { nextValue: sequenceCounters[key] + 1 },
      create: { key, nextValue: sequenceCounters[key] + 1 },
    });
    return `${prefix}-${date.getFullYear()}-${String(sequenceCounters[key]).padStart(6, '0')}`;
  };
  async function getPersistedCounter(key: string) {
    const row = await prisma.documentSequence.findUnique({ where: { key } });
    return row ? row.nextValue - 1 : 0;
  }

  for (const entry of entries) {
    let mapped = TYPE_MAP[entry.type];
    let categoryName = CATEGORY_BY_TYPE[entry.type];

    if (entry.type === 'EXCHANGE_SETTLEMENT') {
      const diff = entry.amountTjs ?? 0;
      mapped = D(diff).gte(0) ? { type: 'INCOME', direction: 'IN' } : { type: 'REFUND', direction: 'OUT' };
      categoryName = D(diff).gte(0) ? 'Продажа' : 'Возврат покупателю';
    }

    if (!mapped) {
      skipped++;
      continue;
    }

    const isSupplierPayment = entry.type === 'SUPPLIER_PAYMENT';
    const accountId = entry.storeId && accountByStoreId.has(entry.storeId) ? accountByStoreId.get(entry.storeId)! : mainAccount.id;
    const balanceCurrency: 'TJS' | 'USD' = isSupplierPayment && !entry.storeId ? 'USD' : 'TJS';
    const rate = entry.exchangeRate ?? 1;
    const amountUsdAbs = D(entry.amountUsd ?? (entry.amountTjs ? roundMoney(D(entry.amountTjs).div(rate)) : 0)).abs();
    const amountTjsAbs = D(entry.amountTjs ?? roundMoney(D(amountUsdAbs).mul(rate))).abs();

    let counterpartyType: 'SUPPLIER' | 'OWNER' | undefined;
    let counterpartyName: string | undefined;
    if (isSupplierPayment && entry.referenceId) {
      const payment = await prisma.supplierPayment.findUnique({ where: { id: entry.referenceId }, include: { supplier: true } });
      if (payment) {
        counterpartyType = 'SUPPLIER';
        counterpartyName = payment.supplier.name;
      }
    }

    const prefix = mapped.type === 'INCOME' ? 'CR' : mapped.type === 'EXPENSE' ? 'CE' : mapped.type === 'SUPPLIER_PAYMENT' ? 'SP' : mapped.type === 'OWNER_DEPOSIT' ? 'OD' : mapped.type === 'OWNER_WITHDRAWAL' ? 'OW' : 'RF';
    const transactionNumber = await nextNumber(prefix, entry.createdAt);

    await prisma.financialTransaction.create({
      data: {
        transactionNumber,
        type: mapped.type as any,
        direction: mapped.direction,
        status: 'POSTED',
        transactionDate: entry.createdAt,
        accountId,
        balanceCurrency,
        amount: balanceCurrency === 'TJS' ? amountTjsAbs : amountUsdAbs,
        currency: balanceCurrency,
        exchangeRate: entry.exchangeRate,
        amountTjs: amountTjsAbs,
        amountUsd: amountUsdAbs,
        categoryId: categoryName ? categoryIdByName.get(categoryName) : undefined,
        counterpartyType,
        counterpartyName,
        shopId: entry.storeId,
        sourceType: entry.type,
        sourceId: entry.referenceId,
        description: entry.description,
        comment: 'Migrated from legacy ledger',
        createdByUserId: 'system',
        createdAt: entry.createdAt,
      },
    });
    imported++;
  }

  console.log(`Imported ${imported} historical transactions, skipped ${skipped} (no real cash movement in the old system).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
