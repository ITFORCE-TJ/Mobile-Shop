import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';

// READ-ONLY reconciliation of cash collections and the Bonus Account. Finds the effects of the
// earlier bonus-split implementation (double Bonus Account credits, cancellations that left
// registers and ledger apart, inconsistent TJS/USD reversals) and anything routed to the wrong
// account. It never writes: every query below is a read. Works before and after the
// 20261002150000 migration (only pre-existing columns are read).
//
//   npx tsx scripts/reconcile-bonus-collections.ts            (uses DATABASE_URL)
const prisma = new PrismaClient();
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const usd = (v: Prisma.Decimal.Value) => `$${D(v).toFixed(2)}`;
let problems = 0;
const problem = (text: string) => { problems++; console.log(`  FAIL ${text}`); };
const ok = (text: string) => console.log(`  OK   ${text}`);

type Row = { id: string; accountId: string; destinationAccountId: string | null; direction: string; balanceCurrency: string; amountTjs: Prisma.Decimal; amountUsd: Prisma.Decimal };
function ledgerOf(accountId: string, rows: Row[]) {
  let tjs = D(0); let u = D(0);
  for (const r of rows) {
    if (r.balanceCurrency !== 'USD') continue;
    const sign = r.accountId === accountId ? (r.direction === 'IN' ? 1 : -1) : r.destinationAccountId === accountId ? 1 : 0;
    tjs = tjs.plus(D(r.amountTjs).mul(sign)); u = u.plus(D(r.amountUsd).mul(sign));
  }
  return { tjs, usd: u };
}
const rowsFor = (accountId: string) => prisma.financialTransaction.findMany({
  where: { balanceCurrency: 'USD', OR: [{ accountId }, { destinationAccountId: accountId }] },
  select: { id: true, accountId: true, destinationAccountId: true, direction: true, balanceCurrency: true, amountTjs: true, amountUsd: true },
});

async function main() {
  console.log(`База: ${new URL(process.env.DATABASE_URL || '').host} (только чтение)\n`);

  // 1. Bonus Account identity and balance vs ledger.
  console.log('1. Бонусный счёт');
  const bonusAccounts = await prisma.financialAccount.findMany({
    where: { name: 'Бонусный счёт', storeId: null },
    select: { id: true, name: true, balanceUsd: true, balanceTjs: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  if (bonusAccounts.length === 0) ok('Бонусного счёта ещё нет');
  if (bonusAccounts.length > 1) problem(`найдено ${bonusAccounts.length} счетов «Бонусный счёт» (дубликаты): ${bonusAccounts.map((a) => a.id).join(', ')}`);
  for (const a of bonusAccounts) {
    const l = ledgerOf(a.id, await rowsFor(a.id));
    const diffUsd = D(a.balanceUsd).minus(l.usd);
    const diffTjs = D(a.balanceTjs).minus(l.tjs);
    if (!diffUsd.isZero()) problem(`счёт ${a.id}: баланс ${usd(a.balanceUsd)}, по журналу ${usd(l.usd)} — зачислено вне журнала ${usd(diffUsd)} (двойное зачисление)`);
    else ok(`счёт ${a.id}: баланс ${usd(a.balanceUsd)} = журнал`);
    if (!diffTjs.isZero()) problem(`счёт ${a.id}: TJS ${D(a.balanceTjs).toFixed(2)}, по журналу ${l.tjs.toFixed(2)} (разница ${diffTjs.toFixed(2)})`);
  }
  const bonusIds = new Set(bonusAccounts.map((a) => a.id));

  // 2. Collections made by the earlier split version.
  console.log('\n2. Инкассации с бонусной частью, проведённые прежней версией');
  const handovers = await prisma.cashHandover.findMany({
    select: { id: true, storeId: true, amountUsd: true, amountTjs: true, financialTransactionId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const audits = await prisma.auditLog.findMany({ where: { action: 'CASH_COLLECTION', targetId: { in: handovers.map((h) => h.id) } }, select: { targetId: true, financialDetails: true } });
  const fin = new Map(audits.map((a) => [a.targetId, (a.financialDetails ?? {}) as Record<string, unknown>]));
  let legacySplit = 0;
  for (const h of handovers) {
    const f = fin.get(h.id) ?? {};
    const bonus = D((f.bonusUsd as number) ?? 0);
    if (bonus.lte(0) || f.regularTxId !== undefined) continue; // new version records regularTxId
    legacySplit++;
    const primary = await prisma.financialTransaction.findUnique({ where: { id: h.financialTransactionId } });
    const bonusTx = typeof f.bonusTxId === 'string' ? await prisma.financialTransaction.findUnique({ where: { id: f.bonusTxId } }) : null;
    const bonusReversal = bonusTx ? await prisma.financialTransaction.findFirst({ where: { reversedTransactionId: bonusTx.id } }) : null;
    problem(`инкассация ${h.id} (${h.createdAt.toISOString().slice(0, 10)}): ${usd(h.amountUsd)}, бонус ${usd(bonus)} — на Бонусный счёт зачислено дважды (+${usd(bonus)} вне журнала)` +
      `${primary?.status === 'CANCELLED' ? `; ОТМЕНЕНА прежней версией: бонусная проводка ${bonusTx?.status ?? '?'} без сторно${bonusReversal ? '' : ' (касса магазина и её счёт разошлись на ' + usd(bonus) + ')'}` : ''}`);
  }
  if (!legacySplit) ok('таких инкассаций нет');

  // 3. Every register agrees with its ledger account and the account with its rows.
  console.log('\n3. Кассы магазинов: касса = счёт = журнал');
  const stores = await prisma.store.findMany({ select: { id: true, name: true, cashBalanceUsd: true } });
  for (const s of stores) {
    const acc = await prisma.financialAccount.findUnique({ where: { storeId: s.id }, select: { id: true, balanceUsd: true } });
    if (!acc) continue;
    const l = ledgerOf(acc.id, await rowsFor(acc.id));
    const regVsAcc = D(s.cashBalanceUsd).minus(acc.balanceUsd);
    if (!regVsAcc.isZero()) problem(`«${s.name}»: касса ${usd(s.cashBalanceUsd)}, счёт ${usd(acc.balanceUsd)} — расхождение ${usd(regVsAcc)}`);
    // Registers moved to USD by migration carry their opening balance outside rows: report, don't fail.
    const accVsLedger = D(acc.balanceUsd).minus(l.usd);
    if (!accVsLedger.isZero()) console.log(`  INFO «${s.name}»: счёт ${usd(acc.balanceUsd)}, журнал ${usd(l.usd)} (разница ${usd(accVsLedger)}: начальный остаток при переводе касс в USD или движение вне журнала)`);
    if (regVsAcc.isZero()) ok(`«${s.name}»: касса = счёт (${usd(s.cashBalanceUsd)})`);
  }

  // 4. Collection postings: right destination, reversals mirror originals in both currencies.
  console.log('\n4. Проводки инкассаций');
  const main = await prisma.store.findFirst({ where: { isMainWarehouse: true }, select: { id: true } });
  const mainAcc = main ? await prisma.financialAccount.findUnique({ where: { storeId: main.id }, select: { id: true } }) : null;
  const postings = await prisma.financialTransaction.findMany({ where: { sourceType: { in: ['CASH_COLLECTION', 'CASH_COLLECTION_BONUS', 'CASH_COLLECTION_REVERSAL'] } } });
  let wrong = 0;
  for (const p of postings) {
    if (p.reversedTransactionId) {
      const original = postings.find((o) => o.id === p.reversedTransactionId) ?? await prisma.financialTransaction.findUnique({ where: { id: p.reversedTransactionId } });
      if (original && (!D(original.amountUsd).eq(p.amountUsd) || !D(original.amountTjs).eq(p.amountTjs))) {
        wrong++;
        problem(`сторно ${p.transactionNumber}: ${D(p.amountTjs).toFixed(2)} TJS / ${usd(p.amountUsd)}, а исходная ${original.transactionNumber}: ${D(original.amountTjs).toFixed(2)} TJS / ${usd(original.amountUsd)}`);
      }
      continue;
    }
    if (p.sourceType === 'CASH_COLLECTION' && mainAcc && p.destinationAccountId !== mainAcc.id) { wrong++; problem(`${p.transactionNumber}: инкассация в счёт ${p.destinationAccountId}, а не в Центральную кассу`); }
    if (p.sourceType === 'CASH_COLLECTION_BONUS' && p.destinationAccountId && !bonusIds.has(p.destinationAccountId)) { wrong++; problem(`${p.transactionNumber}: бонусная инкассация в счёт ${p.destinationAccountId}, а не на Бонусный счёт`); }
    if (p.sourceType === 'CASH_COLLECTION_BONUS' && p.status === 'CANCELLED' && !postings.some((r) => r.reversedTransactionId === p.id)) {
      wrong++; problem(`${p.transactionNumber}: бонусная инкассация отменена без сторно (${usd(p.amountUsd)} остались в журнале на Бонусном счёте)`);
    }
  }
  if (!wrong) ok(`${postings.length} проводок, ошибок маршрутизации и сторно нет`);

  console.log(problems ? `\nНайдено проблем: ${problems}. Данные НЕ изменены. План исправления — в отчёте, только после согласования.` : '\nРасхождений нет. Данные не изменялись.');
  process.exitCode = problems ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 2; }).finally(() => prisma.$disconnect());
