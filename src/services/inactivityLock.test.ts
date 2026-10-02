import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INACTIVITY_LIMIT_MS, InactivityMonitor, isStoredActivityExpired, LAST_ACTIVITY_KEY } from './inactivityLock';

/** A page whose clocks and visibility the test controls; timers are vitest's fake timers. */
function setup(opts: { canLockNow?: () => boolean } = {}) {
  let wall = 1_000_000;
  let mono = 50_000;
  let visible = true;
  const win = new EventTarget();
  const doc = new EventTarget();
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  const onLock = vi.fn();
  const monitor = new InactivityMonitor({
    windowTarget: win, documentTarget: doc, isVisible: () => visible,
    wallNow: () => wall, monoNow: () => mono, storage, onLock, canLockNow: opts.canLockNow,
  });
  return {
    monitor, onLock, win, doc, store,
    /** Foreground time passes: clocks move and timers run. */
    advance(ms: number) { wall += ms; mono += ms; vi.advanceTimersByTime(ms); },
    /** Background: the clocks move but no timer runs (the OS suspended the page). */
    sleep(ms: number, monoMs = ms) { wall += ms; mono += monoMs; },
    setVisible(v: boolean) { visible = v; doc.dispatchEvent(new Event('visibilitychange')); },
    setWall(ms: number) { wall = ms; },
    user(type = 'pointerdown') { win.dispatchEvent(new Event(type)); },
  };
}

describe('InactivityMonitor (10-minute lock)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('uses exactly 10 minutes', () => {
    expect(INACTIVITY_LIMIT_MS).toBe(600_000);
  });

  it('does not lock at 9:59.999 and locks at exactly 10:00.000, once', () => {
    const t = setup();
    t.monitor.start();
    t.advance(599_999);
    expect(t.onLock).not.toHaveBeenCalled();
    t.advance(1);
    expect(t.onLock).toHaveBeenCalledTimes(1);
    t.advance(600_000);
    expect(t.onLock).toHaveBeenCalledTimes(1);
  });

  it.each(['pointerdown', 'touchstart', 'keydown', 'wheel', 'touchmove'])('%s restarts the 10 minutes', (type) => {
    const t = setup();
    t.monitor.start();
    t.advance(300_000);
    t.user(type);
    t.advance(599_999);
    expect(t.onLock).not.toHaveBeenCalled();
    t.advance(1);
    expect(t.onLock).toHaveBeenCalledTimes(1);
  });

  it('ignores background events: API polling, WebSocket messages, update checks, focus', () => {
    const t = setup();
    t.monitor.start();
    t.advance(500_000);
    for (const type of ['message', 'online', 'business-data-changed', 'business-data-refreshed', 'focus', 'pageshow', 'storage']) {
      t.win.dispatchEvent(new Event(type));
    }
    t.advance(100_000);
    expect(t.onLock).toHaveBeenCalledTimes(1);
  });

  it('locks on return to the foreground after 10 minutes in the background, without background timers', () => {
    const t = setup();
    t.monitor.start();
    t.advance(60_000);
    t.setVisible(false);
    t.sleep(540_000);                 // timers suspended: nothing fires during the sleep
    expect(t.onLock).not.toHaveBeenCalled();
    t.setVisible(true);
    expect(t.onLock).toHaveBeenCalledTimes(1);
  });

  it('stays unlocked after 9:59.999 in the background and locks 1 ms later in the foreground', () => {
    const t = setup();
    t.monitor.start();
    t.setVisible(false);
    t.sleep(599_999);
    t.setVisible(true);
    expect(t.onLock).not.toHaveBeenCalled();
    t.advance(1);
    expect(t.onLock).toHaveBeenCalledTimes(1);
  });

  it('counts device sleep even when the monotonic clock paused (wall clock covers it)', () => {
    const t = setup();
    t.monitor.start();
    t.sleep(600_000, 0);
    t.win.dispatchEvent(new Event('pageshow'));
    expect(t.onLock).toHaveBeenCalledTimes(1);
  });

  it('cannot be bypassed by moving the wall clock back (monotonic clock covers it)', () => {
    const t = setup();
    t.monitor.start();
    t.setWall(0);
    t.advance(600_000);
    expect(t.onLock).toHaveBeenCalledTimes(1);
  });

  it('waits for an in-flight operation instead of locking in the middle of it', () => {
    let busy = true;
    const t = setup({ canLockNow: () => !busy });
    t.monitor.start();
    t.advance(600_000);
    expect(t.onLock).not.toHaveBeenCalled();
    busy = false;
    t.advance(1_000);
    expect(t.onLock).toHaveBeenCalledTimes(1);
  });

  it('stops: no lock and no listeners after stop()', () => {
    const t = setup();
    t.monitor.start();
    t.monitor.stop();
    t.advance(700_000);
    t.setVisible(true);
    expect(t.onLock).not.toHaveBeenCalled();
  });

  it('records the last activity time for a reload in the same session', () => {
    const t = setup();
    t.monitor.start();
    t.advance(10_000);
    t.user('keydown');
    expect(Number(t.store.get(LAST_ACTIVITY_KEY))).toBe(1_010_000);
  });
});

describe('isStoredActivityExpired', () => {
  const storage = (value: string | null) => ({ getItem: () => value });
  it('is expired at exactly 10 minutes since the stored activity, not 1 ms before', () => {
    expect(isStoredActivityExpired(storage('1000'), 1000 + 599_999)).toBe(false);
    expect(isStoredActivityExpired(storage('1000'), 1000 + 600_000)).toBe(true);
  });
  it('treats a missing or unreadable record as expired (cannot prove recent activity)', () => {
    expect(isStoredActivityExpired(storage(null), 5)).toBe(true);
    expect(isStoredActivityExpired(storage('garbage'), 5)).toBe(true);
    expect(isStoredActivityExpired(null, 5)).toBe(true);
  });
  it('treats a record from the future (clock moved back) as expired', () => {
    expect(isStoredActivityExpired(storage('10000'), 5000)).toBe(true);
  });
});
