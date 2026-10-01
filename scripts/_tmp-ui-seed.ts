// Temporary: demo data for the browser UI check, written only into the fixture's own schema.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const schema = process.argv[2];
assert(/^audit_fixes_browser_\d+_\d+$/.test(schema || ''), 'fixture schema required');
const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname));
url.searchParams.set('schema', schema);
const db = new PrismaClient({ datasources: { db: { url: url.href } } });
const base = 'http://127.0.0.1:3199/api';
const call = async (token: string, method: string, path: string, body?: unknown) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': crypto.randomUUID() }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json().catch(() => null);
  assert(r.ok, `${method} ${path} ${r.status} ${JSON.stringify(data)}`);
  return data;
};
const login = async (l: string, p: string) => (await call('', 'POST', '/auth/login', { login: l, password: p })).token as string;

const admin = await login('admin', 'admin123');
await call(admin, 'POST', '/exchange-rate/today', { rate: 10.9 });
await db.store.upsert({ where: { id: 'store-tsum' }, create: { id: 'store-tsum', name: 'ЦУМ' }, update: {} });

const dev = (imei: string, brand: string, model: string, storeId: string, status: any, retail: number | null, cost = 500, extra: object = {}) =>
  ({ imei, brand, model, storage: '128GB', color: 'Black', storeId, status, purchasePriceUsd: cost, costBasisUsd: cost, retailPriceTjs: retail, ...extra });
const devices = [
  dev('350000000000001', 'Apple', 'iPhone 15', 'store-siyoma', 'STORE_STOCK', 9500),
  dev('350000000000002', 'Apple', 'iPhone 15', 'store-siyoma', 'STORE_STOCK', 9800, 520),
  dev('350000000000003', 'Apple', 'iPhone 15', 'store-siyoma', 'STORE_STOCK', 9500),
  dev('350000000000004', 'Samsung', 'Galaxy A55', 'store-siyoma', 'STORE_STOCK', 3200, 250),
  dev('350000000000005', 'Xiaomi', 'Redmi Note 13', 'store-siyoma', 'STORE_STOCK', null, 150),
  dev('350000000000006', 'Apple', 'iPhone 14', 'store-siyoma', 'TRANSFER_PENDING', 7000, 400),
  dev('350000000000099', 'Apple', 'iPhone 15 Pro', 'store-tsum', 'STORE_STOCK', 12500, 800),
  dev('350000000000010', 'Apple', 'iPhone 16', 'main-warehouse', 'MAIN_WAREHOUSE', 13000, 900),
  dev('350000000000011', 'Samsung', 'Galaxy S24', 'main-warehouse', 'MAIN_WAREHOUSE', 11000, 700),
];
for (let i = 0; i < 18; i++) devices.push(dev(`3510000000000${String(i).padStart(2, '0')}`, ['Honor', 'Tecno', 'Infinix', 'Oppo', 'Vivo', 'Realme'][i % 6], `Model ${i}`, 'store-siyoma', 'STORE_STOCK', 2000 + i * 100, 120));
for (const d of devices) {
  const created = await db.device.create({ data: d });
  await db.deviceIdentifier.create({ data: { identifier: d.imei, deviceId: created.id } }).catch(() => undefined);
}

const seller = await login('ahmad', 'seller123');
const sold = await db.device.findUniqueOrThrow({ where: { imei: '350000000000005' } });
await call(seller, 'POST', '/sales', { storeId: 'store-siyoma', items: [{ deviceId: sold.id, salePriceTjs: 1800 }], paymentMethod: 'SPLIT', cashAmountTjs: 1000, cardAmountTjs: 800 });
const toMove = await db.device.findUniqueOrThrow({ where: { imei: '350000000000011' } });
await call(seller, 'POST', '/transfers', { fromLocationId: 'main-warehouse', toLocationId: 'store-siyoma', deviceIds: [toMove.id] });
for (const n of [1, 2]) {
  await call(seller, 'POST', '/repairs', { imei: `35200000000000${n}`, brand: 'Apple', model: `iPhone ${10 + n}`, storage: '—', color: '—', customerName: `Клиент ${n}`, customerPhone: '+992900000000', problemDescription: 'Не заряжается', storeId: 'store-siyoma' });
}
console.log('UI_SEED_OK');
await db.$disconnect();
