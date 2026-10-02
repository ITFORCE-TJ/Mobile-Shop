// Cash collection with the bonus split, against disposable schemas on the real database.
// Business rules under test:
//  - every sale (cash, card/transfer, split) raises its store's single register;
//  - a collection empties the register to exactly 0 TJS / $0 and splits it: bonus-derived money
//    (profit of sold free bonus phones) to the Bonus Account, everything else to Central Cash;
//    credits equal the debit in each currency, each movement posted once;
//  - a cash supplier bonus is credited to the Bonus Account once, never through a collection;
//  - a cancellation reverses each movement with its original TJS and USD amounts.
// Expected figures are computed here independently of the services.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { PrismaClient, Prisma } from '@prisma/client';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const baseUrl = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(baseUrl.hostname), 'Disposable local database required');
let passed = 0;
const pass = (name: string) => { passed++; console.log(`PASS ${name}`); };

/** Runs a scenario in its own freshly migrated and seeded schema, then drops it. */
async function withSchema(label: string, fn: (ctx: Ctx) => Promise<void>, prepare?: (db: PrismaClient) => Promise<void>) {
  const schema = `audit_fixes_split_${label}_${Date.now()}_${process.pid}`;
  const url = new URL(baseUrl.href);
  url.searchParams.set('schema', schema);
  const env = { ...process.env, DATABASE_URL: url.href, SEED_TEST_DATA: 'true' };
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  // The app reads DATABASE_URL once at import; each scenario runs the app in a child process.
  try {
    for (const args of [['node_modules/prisma/build/index.js', 'migrate', 'deploy'], ['--import', 'tsx', 'prisma/seed.ts']]) {
      const r = spawnSync(process.execPath, args, { env, encoding: 'utf8', timeout: 120000 });
      assert.equal(r.status, 0, r.stdout + r.stderr);
    }
    if (prepare) await prepare(db);
    const proc = spawn(process.execPath, ['--import', 'tsx', 'scripts/serve-api-fixture.ts'], { env: { ...env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const port: number = await new Promise((resolve, reject) => {
      let out = '';
      proc.stdout.on('data', (b) => { out += b; const m = out.match(/LISTENING (\d+)/); if (m) resolve(Number(m[1])); });
      proc.stderr.on('data', (b) => { out += b; if (process.env.SPLIT_TEST_LOG) process.stderr.write(b); });
      proc.on('exit', (code) => reject(new Error(`API fixture exited ${code}: ${out}`)));
    });
    try {
      await fn(makeCtx(db, `http://127.0.0.1:${port}/api`));
      // Owners' capital still reconciles with registers + Bonus Account + stock after all of it.
      const check = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-owner-balances.ts'], { env, encoding: 'utf8', timeout: 120000 });
      assert.equal(check.status, 0, check.stdout + check.stderr);
      assert.match(check.stdout, /Расхождений нет/, check.stdout);
      pass(`${label}: owner capital reconciliation passes (registers + Bonus Account)`);
    } finally {
      proc.kill();
    }
  } finally {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
  }
}

type Ctx = ReturnType<typeof makeCtx>;
function makeCtx(db: PrismaClient, base: string) {
  let admin = '';
  const call = async (method: string, path: string, body?: unknown, key: string = crypto.randomUUID(), token = admin) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Idempotency-Key': key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const login = async () => { admin = (await call('POST', '/auth/login', { login: 'admin', password: 'admin123' }, undefined, '')).data.token; };
  const setRate = async (rate: number) => assert.equal((await call('POST', '/exchange-rate/today', { rate })).status, 200);
  let n = 0;
  const store = async (id: string) => db.store.create({ data: { id, name: `Магазин ${id}` } });
  // A phone bought on credit: its cost is owed to the supplier, so the books stay balanced.
  const device = async (storeId: string, cost: number, isBonus = false) => {
    if (cost > 0) await db.supplier.update({ where: { id: 'sup-dubai' }, data: { totalDebtUsd: { increment: cost } } });
    return db.device.create({ data: {
      imei: `35${String(Date.now()).slice(-6)}${String(++n).padStart(7, '0')}`, brand: 'Test', model: isBonus ? 'Bonus' : 'Regular', storage: '128GB', color: 'Black',
      isBonus, bonusCampaign: isBonus ? 'Акция' : null, status: 'STORE_STOCK', storeId, purchasePriceUsd: cost, costBasisUsd: cost } });
  };
  const sell = async (storeId: string, tjs: number, opts: { cost?: number; bonus?: boolean; method?: 'CASH' | 'CARD' | 'SPLIT'; cash?: number; card?: number } = {}) => {
    const d = await device(storeId, opts.cost ?? (opts.bonus ? 0 : 10), opts.bonus);
    const method = opts.method ?? 'CASH';
    const r = await call('POST', '/sales', { storeId, items: [{ deviceId: d.id, salePriceTjs: tjs }], paymentMethod: method,
      ...(method === 'SPLIT' ? { cashAmountTjs: opts.cash, cardAmountTjs: opts.card } : {}) });
    assert.equal(r.status, 201, JSON.stringify(r));
    return r.data;
  };
  /** An account's balance rebuilt from its ledger rows (independent of the services). */
  const ledger = async (accountId: string) => {
    const rows = await db.financialTransaction.findMany({ where: { balanceCurrency: 'USD', OR: [{ accountId }, { destinationAccountId: accountId }] } });
    let tjs = D(0); let usd = D(0);
    for (const r of rows) {
      const sign = r.accountId === accountId ? (r.direction === 'IN' ? 1 : -1) : 1;
      tjs = tjs.plus(D(r.amountTjs).mul(sign)); usd = usd.plus(D(r.amountUsd).mul(sign));
    }
    return { tjs, usd };
  };
  const bonusAccounts = () => db.financialAccount.findMany({ where: { OR: [{ systemKey: 'BONUS_ACCOUNT' }, { name: 'Бонусный счёт' }] } });
  /** One register: the store's USD field, its ledger account (cached USD), and the ledger in both currencies. */
  const reg = async (storeId: string) => {
    const s = await db.store.findUniqueOrThrow({ where: { id: storeId } });
    const acc = await db.financialAccount.findUnique({ where: { storeId } });
    const l = acc ? await ledger(acc.id) : { tjs: D(0), usd: D(0) };
    return { usd: D(s.cashBalanceUsd), account: D(acc?.balanceUsd ?? 0), ledgerUsd: l.usd, ledgerTjs: l.tjs };
  };
  const bonus = async () => {
    const accs = await bonusAccounts();
    assert(accs.length <= 1, `exactly one Bonus Account, found ${accs.length}`);
    if (!accs.length) return { usd: D(0), ledgerUsd: D(0), ledgerTjs: D(0), id: null as string | null };
    const l = await ledger(accs[0].id);
    return { usd: D(accs[0].balanceUsd), ledgerUsd: l.usd, ledgerTjs: l.tjs, id: accs[0].id };
  };
  /** Every register and the Bonus Account agree with their own ledger: nothing moved outside it. */
  const assertReconciled = async (storeIds: string[]) => {
    for (const id of [...storeIds, 'main-warehouse']) {
      const r = await reg(id);
      assert.equal(r.usd.toString(), r.account.toString(), `${id}: register = ledger account (USD)`);
      assert.equal(r.account.toString(), r.ledgerUsd.toString(), `${id}: account = sum of its ledger rows`);
    }
    const b = await bonus();
    assert.equal(b.usd.toString(), b.ledgerUsd.toString(), 'Bonus Account cached balance = sum of its ledger rows (no off-ledger credit)');
  };
  const collect = (storeId: string, expectedCashUsd: Prisma.Decimal.Value, key?: string) =>
    call('POST', '/cash-collections', { storeId, expectedCashUsd: D(expectedCashUsd).toString() }, key);
  return { db, call, login, setRate, store, device, sell, reg, bonus, ledger, bonusAccounts, assertReconciled, collect };
}

/** Collects a store and checks the split and conservation in both currencies. */
async function collectAndCheck(c: Ctx, storeId: string, expected: { regularUsd: string; regularTjs: string; bonusUsd: string; bonusTjs: string }) {
  const [s0, m0, b0] = [await c.reg(storeId), await c.reg('main-warehouse'), await c.bonus()];
  const r = await c.collect(storeId, s0.usd);
  assert.equal(r.status, 201, JSON.stringify(r));
  const [s1, m1, b1] = [await c.reg(storeId), await c.reg('main-warehouse'), await c.bonus()];
  assert.equal(s1.usd.toString(), '0', 'register USD = 0');
  assert.equal(s1.ledgerTjs.toString(), '0', 'register TJS = 0');
  assert.equal(m1.usd.minus(m0.usd).toString(), expected.regularUsd, 'Central Cash +regular USD');
  assert.equal(m1.ledgerTjs.minus(m0.ledgerTjs).toString(), expected.regularTjs, 'Central Cash +regular TJS');
  assert.equal(b1.usd.minus(b0.usd).toString(), expected.bonusUsd, 'Bonus Account +bonus USD (once)');
  assert.equal(b1.ledgerTjs.minus(b0.ledgerTjs).toString(), expected.bonusTjs, 'Bonus Account +bonus TJS');
  // Conservation: what left the store is exactly what arrived, in each currency.
  assert.equal(s0.usd.minus(s1.usd).toString(), m1.usd.minus(m0.usd).plus(b1.usd.minus(b0.usd)).toString(), 'USD conserved');
  assert.equal(s0.ledgerTjs.minus(s1.ledgerTjs).toString(), m1.ledgerTjs.minus(m0.ledgerTjs).plus(b1.ledgerTjs.minus(b0.ledgerTjs)).toString(), 'TJS conserved');
  const rows = await c.db.financialTransaction.findMany({ where: { sourceType: { in: ['CASH_COLLECTION', 'CASH_COLLECTION_BONUS'] }, sourceId: r.data.id } });
  const expectedRows = (D(expected.regularUsd).isZero() && D(expected.regularTjs).isZero() ? 0 : 1) + (D(expected.bonusUsd).isZero() && D(expected.bonusTjs).isZero() ? 0 : 1);
  assert.equal(rows.length, expectedRows, `one ledger transfer per destination (${expectedRows})`);
  return r.data;
}

// ===================== scenario set 1: first use, concurrency, payment methods =====================
await withSchema('main', async (c) => {
  await c.login();
  await c.setRate(10);
  for (const id of ['store-a', 'store-b', 'store-c', 'store-d']) await c.store(id);

  // A read-only GET never creates a financial account.
  const accountsBefore = await c.db.financialAccount.count();
  const balances = await c.call('GET', '/cash-collections/balances');
  assert.equal(balances.status, 200, JSON.stringify(balances));
  assert.equal(await c.db.financialAccount.count(), accountsBefore);
  assert.equal((await c.bonusAccounts()).length, 0);
  pass('GET /cash-collections/balances creates no financial account');

  // Setup: A = $200 regular + $150 bonus, B = $100 all bonus, C = $100 all regular.
  await c.sell('store-a', 2000, { cost: 100 });
  await c.sell('store-a', 1500, { bonus: true });
  await c.sell('store-b', 1000, { bonus: true });
  await c.sell('store-c', 1000, { cost: 50 });
  assert.equal((await c.reg('store-a')).usd.toString(), '350');

  // G: first-ever use of the Bonus Account from three requests at once creates exactly one.
  const [ra, rb, rbonus] = await Promise.all([
    c.collect('store-a', 350), c.collect('store-b', 100),
    c.call('POST', '/supplier-bonuses', { supplierId: 'sup-dubai', campaignTitle: 'Квартал', bonusType: 'CASH_DISCOUNT', amountUsd: 250 }),
  ]);
  assert.deepEqual([ra.status, rb.status, rbonus.status], [201, 201, 201], JSON.stringify([ra.data, rb.data, rbonus.data]));
  const accs = await c.db.financialAccount.findMany({ where: { systemKey: 'BONUS_ACCOUNT' } });
  assert.equal(accs.length, 1, 'one Bonus Account with the stable key');
  assert.equal((await c.bonusAccounts()).length, 1, 'no second account by name');
  const b = await c.bonus();
  assert.equal(b.usd.toString(), '500', 'Bonus Account = 150 (A) + 100 (B) + 250 (cash bonus), each once');
  assert.equal(b.ledgerTjs.toString(), '5000', 'Bonus Account TJS = 1500 + 1000 + 2500');
  await c.assertReconciled(['store-a', 'store-b', 'store-c', 'store-d']);
  pass('concurrent first use creates one Bonus Account; credits arrive exactly once');

  // A: checked in detail on a second round (same split).
  await c.sell('store-a', 2000, { cost: 100 });
  await c.sell('store-a', 1500, { bonus: true });
  const docA = await collectAndCheck(c, 'store-a', { regularUsd: '200', regularTjs: '2000', bonusUsd: '150', bonusTjs: '1500' });
  assert.equal(String(docA.regularAmountUsd), '200');
  assert.equal(String(docA.bonusAmountUsd), '150');
  pass('A: $350 register → Central Cash +$200 / 2000 TJS, Bonus Account +$150 / 1500 TJS, register 0');

  // B: entirely bonus.
  await c.sell('store-b', 1000, { bonus: true });
  await collectAndCheck(c, 'store-b', { regularUsd: '0', regularTjs: '0', bonusUsd: '100', bonusTjs: '1000' });
  pass('B: $100 all bonus → Bonus Account +$100 once, Central Cash +$0, register 0');

  // C: entirely regular.
  await collectAndCheck(c, 'store-c', { regularUsd: '100', regularTjs: '1000', bonusUsd: '0', bonusTjs: '0' });
  pass('C: $100 all regular → Central Cash +$100, Bonus Account +$0');

  // A bonus-flagged phone that has a recorded cost is a regular sale: its revenue is not bonus money.
  await c.sell('store-c', 1500, { bonus: true, cost: 100 });
  await collectAndCheck(c, 'store-c', { regularUsd: '150', regularTjs: '1500', bonusUsd: '0', bonusTjs: '0' });
  pass('a bonus-flagged phone with a $100 cost goes to Central Cash in full, not to the Bonus Account');

  // D: every payment method raises the store register by the whole receipt.
  const steps: [string, Parameters<Ctx['sell']>[2], number, string][] = [
    ['CASH', { method: 'CASH' }, 1000, '100'],
    ['CARD', { method: 'CARD' }, 1100, '110'],
    ['SPLIT', { method: 'SPLIT', cash: 600, card: 600 }, 1200, '120'],
    ['CARD bonus phone', { method: 'CARD', bonus: true }, 500, '50'],
  ];
  for (const [label, opts, tjs, usd] of steps) {
    const before = await c.reg('store-d');
    const sale = await c.sell('store-d', tjs, opts);
    const after = await c.reg('store-d');
    assert.equal(after.usd.minus(before.usd).toString(), usd, `${label}: register +$${usd}`);
    assert.equal(after.ledgerTjs.minus(before.ledgerTjs).toString(), String(tjs), `${label}: register +${tjs} TJS`);
    assert.equal((await c.db.sale.findUniqueOrThrow({ where: { id: sale.id } })).paymentMethod, opts!.method);
  }
  await collectAndCheck(c, 'store-d', { regularUsd: '330', regularTjs: '3300', bonusUsd: '50', bonusTjs: '500' });
  await c.assertReconciled(['store-a', 'store-b', 'store-c', 'store-d']);
  pass('D: CASH/CARD/SPLIT all raise the register in full; collection splits by bonus origin, not payment method');

  // E: cancellation reverses each movement with its original amounts; a later collection works.
  const before = { s: await c.reg('store-a'), m: await c.reg('main-warehouse'), b: await c.bonus() };
  const cancel = await c.call('POST', `/cash-collections/${docA.id}/cancel`, {});
  assert.equal(cancel.status, 200, JSON.stringify(cancel));
  const after = { s: await c.reg('store-a'), m: await c.reg('main-warehouse'), b: await c.bonus() };
  assert.equal(after.s.usd.minus(before.s.usd).toString(), '350');
  assert.equal(after.s.ledgerTjs.minus(before.s.ledgerTjs).toString(), '3500');
  assert.equal(before.m.usd.minus(after.m.usd).toString(), '200');
  assert.equal(before.m.ledgerTjs.minus(after.m.ledgerTjs).toString(), '2000');
  assert.equal(before.b.usd.minus(after.b.usd).toString(), '150');
  assert.equal(before.b.ledgerTjs.minus(after.b.ledgerTjs).toString(), '1500');
  await c.assertReconciled(['store-a', 'store-b', 'store-c', 'store-d']);
  const originals = await c.db.financialTransaction.findMany({ where: { sourceId: docA.id, reversedTransactionId: null } });
  assert.equal(originals.length, 2);
  for (const o of originals) {
    assert.equal(o.status, 'CANCELLED');
    const rev = await c.db.financialTransaction.findUniqueOrThrow({ where: { reversedTransactionId: o.id } });
    assert.equal(String(rev.amountUsd), String(o.amountUsd), 'reversal USD = original USD');
    assert.equal(String(rev.amountTjs), String(o.amountTjs), 'reversal TJS = original TJS');
  }
  assert.equal(await c.db.auditLog.count({ where: { action: 'CASH_COLLECTION_CANCEL' } }), 1);
  const again = await c.call('POST', `/cash-collections/${docA.id}/cancel`, {});
  assert.equal(again.status, 400, JSON.stringify(again));
  await collectAndCheck(c, 'store-a', { regularUsd: '200', regularTjs: '2000', bonusUsd: '150', bonusTjs: '1500' });
  pass('E: cancel restores $350 / 3500 TJS, takes $200 / 2000 TJS from Central and $150 / 1500 TJS from Bonus; reversals mirror originals; second cancel refused; recollection splits again');

  // G: concurrent cancellations of one collection reverse it once.
  const docC2 = await (async () => { await c.sell('store-c', 1000, { cost: 50 }); return collectAndCheck(c, 'store-c', { regularUsd: '100', regularTjs: '1000', bonusUsd: '0', bonusTjs: '0' }); })();
  const two = await Promise.all([1, 2].map(() => c.call('POST', `/cash-collections/${docC2.id}/cancel`, {})));
  assert.deepEqual(two.map((r) => r.status).sort(), [200, 400], JSON.stringify(two));
  assert.equal((await c.reg('store-c')).usd.toString(), '100');
  await c.assertReconciled(['store-a', 'store-b', 'store-c', 'store-d']);
  pass('G: two simultaneous cancellations move the money back once');

  // A bonus phone refunded after its money was collected: the register paid the customer back,
  // so the Bonus Account's $150 for it is offset against the store's next bonus money — the phone
  // is never counted both as bonus and as regular.
  const bonusSale = await c.sell('store-a', 1500, { bonus: true });
  await collectAndCheck(c, 'store-a', { regularUsd: '0', regularTjs: '0', bonusUsd: '150', bonusTjs: '1500' });
  await c.sell('store-a', 2000, { cost: 100 });
  const refund = await c.call('POST', `/sales/${bonusSale.id}/refund`, { reason: 'Брак', refundAmountTjs: 1500, penaltyFeeTjs: 0, paymentMethod: 'CASH' });
  assert.equal(refund.status, 200, JSON.stringify(refund));
  await collectAndCheck(c, 'store-a', { regularUsd: '50', regularTjs: '500', bonusUsd: '0', bonusTjs: '0' });
  await c.sell('store-a', 1500, { bonus: true });
  await collectAndCheck(c, 'store-a', { regularUsd: '150', regularTjs: '1500', bonusUsd: '0', bonusTjs: '0' });
  await c.sell('store-a', 1500, { bonus: true });
  await collectAndCheck(c, 'store-a', { regularUsd: '0', regularTjs: '0', bonusUsd: '150', bonusTjs: '1500' });
  await c.assertReconciled(['store-a', 'store-b', 'store-c', 'store-d']);
  pass('refund after collection: the collected $150 is offset against the next bonus money, never counted twice');
});

// ===================== scenario set 2: rates, retries, insufficient funds, legacy account =====================
await withSchema('rates', async (c) => {
  await c.login();
  await c.store('store-r');

  // F: bonus and regular sales at three rates; the collection happens at a fourth.
  await c.setRate(10);
  await c.sell('store-r', 1000, { cost: 10 });          // $100 regular
  await c.sell('store-r', 500, { bonus: true });        // $50 bonus
  await c.setRate(11);
  await c.sell('store-r', 1100, { bonus: true });       // $100 bonus
  await c.setRate(12);
  await c.sell('store-r', 1800, { cost: 10, method: 'CARD' }); // $150 regular
  await c.setRate(13);
  const doc = await collectAndCheck(c, 'store-r', { regularUsd: '250', regularTjs: '2800', bonusUsd: '150', bonusTjs: '1600' });
  pass('F: each part keeps its historical TJS and USD (2800 TJS / $250 + 1600 TJS / $150); today\'s rate 13 is never applied');

  // The existing pre-key account was adopted, not duplicated.
  const accs = await c.bonusAccounts();
  assert.equal(accs.length, 1);
  assert.equal(accs[0].id, 'legacy-bonus-account');
  assert.equal(accs[0].systemKey, 'BONUS_ACCOUNT');
  pass('an existing "Бонусный счёт" without a key is adopted under the lock, not duplicated or deleted');

  // G: a retried request with the same key returns the same document and moves nothing again.
  await c.sell('store-r', 1300, { bonus: true });       // $100 at 13
  const key = crypto.randomUUID();
  const first = await c.collect('store-r', 100, key);
  const snap = { s: await c.reg('store-r'), m: await c.reg('main-warehouse'), b: await c.bonus() };
  const replay = await c.collect('store-r', 100, key);
  assert.equal(first.status, 201); assert.equal(replay.status, 201);
  assert.equal(replay.data.id, first.data.id);
  assert.deepEqual({ s: await c.reg('store-r'), m: await c.reg('main-warehouse'), b: await c.bonus() }, snap);
  // Concurrent collections of one store: one wins, the money moves once.
  await c.sell('store-r', 1300, { cost: 10 });
  const race = await Promise.all([1, 2].map(() => c.collect('store-r', 100)));
  assert.equal(race.filter((r) => r.status === 201).length, 1, JSON.stringify(race));
  assert.equal((await c.reg('store-r')).usd.toString(), '0');
  // A stale confirmation fails as a whole and changes nothing.
  await c.sell('store-r', 1300, { cost: 10 });
  const beforeStale = { s: await c.reg('store-r'), m: await c.reg('main-warehouse'), b: await c.bonus() };
  assert.equal((await c.collect('store-r', 99)).status, 409);
  assert.deepEqual({ s: await c.reg('store-r'), m: await c.reg('main-warehouse'), b: await c.bonus() }, beforeStale);
  await c.assertReconciled(['store-r']);
  pass('G: retry returns the same collection, a concurrent duplicate moves nothing, a failed request rolls back completely');

  // G: insufficient funds — Central Cash spent below the regular part blocks the cancellation entirely.
  const exp = await c.call('POST', '/expenses', { category: 'Аренда', amountTjs: 2800, storeId: 'main-warehouse', paidFromCashRegister: true, comment: 'test' });
  assert.equal(exp.status, 201, JSON.stringify(exp));
  const beforeCancel = { s: await c.reg('store-r'), m: await c.reg('main-warehouse'), b: await c.bonus() };
  const blocked = await c.call('POST', `/cash-collections/${doc.id}/cancel`, {});
  assert.equal(blocked.status, 400, JSON.stringify(blocked));
  assert.deepEqual({ s: await c.reg('store-r'), m: await c.reg('main-warehouse'), b: await c.bonus() }, beforeCancel);
  assert.equal((await c.db.cashHandover.findUniqueOrThrow({ where: { id: doc.id } })).cancelledAt, null);
  pass('G: a cancellation Central Cash cannot cover is refused without any partial change');

  // Cash bonus lifecycle on the Bonus Account: credited once, edits post the difference, delete reverses.
  const b0 = await c.bonus();
  const created = await c.call('POST', '/supplier-bonuses', { supplierId: 'sup-dubai', campaignTitle: 'Квартал', bonusType: 'CASH_DISCOUNT', amountUsd: 40 });
  assert.equal(created.status, 201, JSON.stringify(created));
  assert.equal((await c.bonus()).usd.minus(b0.usd).toString(), '40');
  assert.equal((await c.bonus()).ledgerTjs.minus(b0.ledgerTjs).toString(), '520', '$40 at the bonus rate 13');
  assert.equal((await c.call('PUT', `/supplier-bonuses/${created.data.id}`, { amountUsd: 30 })).status, 200);
  assert.equal((await c.bonus()).usd.minus(b0.usd).toString(), '30');
  assert.equal((await c.call('DELETE', `/supplier-bonuses/${created.data.id}`)).status, 200);
  assert.equal((await c.bonus()).usd.minus(b0.usd).toString(), '0');
  assert.equal((await c.bonus()).ledgerTjs.minus(b0.ledgerTjs).toString(), '0');
  await c.assertReconciled(['store-r']);
  pass('cash bonus: +$40 once, edit to $30 nets +$30, delete reverses to 0 — all through the ledger');
}, async (db) => {
  // A Bonus Account created by the earlier version (name only, no key).
  await db.financialAccount.create({ data: { id: 'legacy-bonus-account', name: 'Бонусный счёт', type: 'OTHER' } });
});

console.log(`\nCollection bonus split: ${passed} checks passed`);
