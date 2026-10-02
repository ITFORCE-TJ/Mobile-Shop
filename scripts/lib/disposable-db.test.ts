import { describe, expect, it } from 'vitest';
import { isDisposableDatabaseUrl } from './disposable-db';

describe('isDisposableDatabaseUrl (destructive test suites only on throwaway schemas)', () => {
  it('accepts a local temporary audit_fixes_* schema', () => {
    expect(isDisposableDatabaseUrl('postgresql://u:p@localhost:5435/db?schema=audit_fixes_e2e_1')).toBe(true);
    expect(isDisposableDatabaseUrl('postgresql://u:p@127.0.0.1:5432/ci?schema=audit_fixes_123_4')).toBe(true);
  });
  it('refuses the working schema, a missing schema, and any remote host', () => {
    expect(isDisposableDatabaseUrl('postgresql://u:p@localhost:5435/mobile_shop_db?schema=public')).toBe(false);
    expect(isDisposableDatabaseUrl('postgresql://u:p@localhost:5435/mobile_shop_db')).toBe(false);
    expect(isDisposableDatabaseUrl('postgresql://u:p@db.example.com:5432/prod?schema=audit_fixes_x')).toBe(false);
    expect(isDisposableDatabaseUrl('')).toBe(false);
    expect(isDisposableDatabaseUrl(undefined)).toBe(false);
  });
});
