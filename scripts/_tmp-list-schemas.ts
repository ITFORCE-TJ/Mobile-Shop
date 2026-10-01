import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const drop = process.argv.slice(2).filter((s) => /^audit_fixes_browser_\d+_\d+$/.test(s));
for (const schema of drop) await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
const left = await db.$queryRawUnsafe<any[]>(`select schema_name from information_schema.schemata where schema_name like 'audit_%'`);
console.log(JSON.stringify(left));
await db.$disconnect();
