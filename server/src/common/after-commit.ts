import { AsyncLocalStorage } from 'node:async_hooks';

const hooks = new AsyncLocalStorage<Array<() => void>>();

/**
 * Runs a transaction body and, only once it has finished successfully (committed), the
 * callbacks it registered with onCommit — e.g. realtime broadcasts, so clients never hear
 * about a write that was rolled back. Used by the patched prisma.$transaction.
 */
export async function withCommitHooks<T>(run: () => Promise<T>): Promise<T> {
  const queue: Array<() => void> = [];
  const result = await hooks.run(queue, run);
  for (const callback of queue) {
    try {
      callback();
    } catch (error) {
      console.error('[after-commit] callback failed', error);
    }
  }
  return result;
}

/** Defers `callback` until the surrounding transaction commits; runs it at once outside one. */
export function onCommit(callback: () => void): void {
  const queue = hooks.getStore();
  if (queue) queue.push(callback);
  else callback();
}
