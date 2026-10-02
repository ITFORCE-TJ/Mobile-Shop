/**
 * Destructive test suites (they create data and clean up with direct deletes) may only run on
 * a local temporary schema created for them, never on a working database: a cleanup that
 * bypasses the ledger leaves supplier debt, invoices and journal entries without their stock.
 */
export function isDisposableDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1'].includes(url.hostname) && /^audit_fixes_/.test(url.searchParams.get('schema') ?? '');
  } catch {
    return false;
  }
}

export function requireDisposableDatabase(suite: string) {
  if (!isDisposableDatabaseUrl(process.env.DATABASE_URL)) {
    console.error(`${suite}: отказ — набор запускается только на временной схеме audit_fixes_* локальной базы. Используйте npm-скрипт, он создаёт и удаляет такую схему сам.`);
    process.exit(1);
  }
}
