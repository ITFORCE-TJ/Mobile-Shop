import { describe, expect, it } from 'vitest';
import { onCommit, withCommitHooks } from './after-commit';

describe('onCommit', () => {
  it('runs registered callbacks only after the transaction body finished', async () => {
    const events: string[] = [];
    await withCommitHooks(async () => {
      onCommit(() => events.push('broadcast'));
      await Promise.resolve();
      events.push('last write');
    });
    expect(events).toEqual(['last write', 'broadcast']);
  });

  it('drops the callbacks when the transaction fails (nothing was committed)', async () => {
    const events: string[] = [];
    await expect(withCommitHooks(async () => {
      onCommit(() => events.push('broadcast'));
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    expect(events).toEqual([]);
  });

  it('runs immediately outside a transaction', () => {
    const events: string[] = [];
    onCommit(() => events.push('now'));
    expect(events).toEqual(['now']);
  });

  it('a failing callback does not hide the committed result or skip the others', async () => {
    const events: string[] = [];
    const result = await withCommitHooks(async () => {
      onCommit(() => { throw new Error('socket down'); });
      onCommit(() => events.push('second'));
      return 42;
    });
    expect(result).toBe(42);
    expect(events).toEqual(['second']);
  });
});
