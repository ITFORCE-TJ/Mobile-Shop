/**
 * Automatic lock after 10 minutes without user activity (all roles).
 *
 * Only real user input counts as activity: touches, clicks, keys, wheel/touch scrolling.
 * Background API polling, WebSocket messages, update checks and window focus do not.
 * Inactivity is measured from timestamps, never by counting timer ticks: a suspended
 * background page runs no timers, so the elapsed time is recomputed whenever the page
 * returns to the foreground. Both clocks are used — the wall clock covers device sleep
 * (when the monotonic clock may pause) and the monotonic clock covers a wall clock moved
 * back — and the larger elapsed time wins.
 */
export const INACTIVITY_LIMIT_MS = 10 * 60 * 1000;
export const LAST_ACTIVITY_KEY = 'ms_last_activity_at';
export const USER_ACTIVITY_EVENTS = ['pointerdown', 'touchstart', 'keydown', 'wheel', 'touchmove'] as const;
const FOREGROUND_WINDOW_EVENTS = ['focus', 'pageshow'] as const;
const STORAGE_WRITE_INTERVAL_MS = 5_000;
const BUSY_RETRY_MS = 1_000;

type ReadStorage = Pick<Storage, 'getItem'>;
type RWStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface InactivityMonitorOptions {
  windowTarget: EventTarget;
  documentTarget: EventTarget;
  isVisible: () => boolean;
  onLock: () => void;
  /** False while something must not be interrupted (e.g. a request in flight); the lock waits. */
  canLockNow?: () => boolean;
  limitMs?: number;
  wallNow?: () => number;
  monoNow?: () => number;
  storage?: RWStorage | null;
}

/** True when the activity recorded in this browser session is at least the limit old (or unknown). */
export function isStoredActivityExpired(storage: ReadStorage | null | undefined, wallNow: number, limitMs = INACTIVITY_LIMIT_MS): boolean {
  let raw: string | null = null;
  try { raw = storage?.getItem(LAST_ACTIVITY_KEY) ?? null; } catch { raw = null; }
  const at = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(at)) return true;
  const elapsed = wallNow - at;
  return elapsed < 0 || elapsed >= limitMs;
}

export class InactivityMonitor {
  private readonly limitMs: number;
  private readonly wallNow: () => number;
  private readonly monoNow: () => number;
  private lastWall = 0;
  private lastMono = 0;
  private lastStored = -Infinity;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(private readonly options: InactivityMonitorOptions) {
    this.limitMs = options.limitMs ?? INACTIVITY_LIMIT_MS;
    this.wallNow = options.wallNow ?? (() => Date.now());
    this.monoNow = options.monoNow ?? (() => performance.now());
  }

  private readonly onActivity = () => this.recordActivity();
  private readonly onForeground = () => { if (this.options.isVisible()) this.check(); };

  start() {
    if (this.running) return;
    this.running = true;
    this.recordActivity(true);
    for (const type of USER_ACTIVITY_EVENTS) this.options.windowTarget.addEventListener(type, this.onActivity, { capture: true, passive: true });
    for (const type of FOREGROUND_WINDOW_EVENTS) this.options.windowTarget.addEventListener(type, this.onForeground);
    this.options.documentTarget.addEventListener('visibilitychange', this.onForeground);
    this.schedule(this.limitMs);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    for (const type of USER_ACTIVITY_EVENTS) this.options.windowTarget.removeEventListener(type, this.onActivity, { capture: true });
    for (const type of FOREGROUND_WINDOW_EVENTS) this.options.windowTarget.removeEventListener(type, this.onForeground);
    this.options.documentTarget.removeEventListener('visibilitychange', this.onForeground);
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Real user input: restarts the 10 minutes. */
  recordActivity(forceStore = false) {
    if (!this.running) return;
    this.lastWall = this.wallNow();
    this.lastMono = this.monoNow();
    // Kept for a reload within the same browser session (throttled: input can be frequent).
    if (forceStore || this.lastWall - this.lastStored >= STORAGE_WRITE_INTERVAL_MS || this.lastWall < this.lastStored) {
      try { this.options.storage?.setItem(LAST_ACTIVITY_KEY, String(this.lastWall)); this.lastStored = this.lastWall; } catch { /* storage unavailable */ }
    }
  }

  /** Inactive time so far; the larger of wall-clock and monotonic elapsed time. */
  elapsed(): number {
    const wall = this.wallNow() - this.lastWall;
    const mono = this.monoNow() - this.lastMono;
    return Math.max(wall, mono);
  }

  /** Locks if the limit is reached (call on foreground/resume); otherwise re-arms the timer. */
  check(): boolean {
    if (!this.running) return false;
    const remaining = this.limitMs - this.elapsed();
    if (remaining > 0) {
      this.schedule(remaining);
      return false;
    }
    if (this.options.canLockNow && !this.options.canLockNow()) {
      this.schedule(BUSY_RETRY_MS);
      return false;
    }
    this.stop();
    this.options.onLock();
    return true;
  }

  private schedule(ms: number) {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.check(); }, Math.max(0, ms));
  }
}
