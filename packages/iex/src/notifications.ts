// iex/notifications — UNUserNotificationCenter-backed local notifications.

const native: any = (globalThis as any).__iex;

export type Permission = 'granted' | 'denied' | 'unknown';

export interface ScheduleOpts {
  id?: string;
  title?: string;
  body?: string;
  subtitle?: string;
  /** seconds from now (≥ 1). Mutually exclusive with `fireDate`. */
  delay?: number;
  /** unix ms epoch. */
  fireDate?: number;
  /** "default" or "none" — defaults to "default". */
  sound?: 'default' | 'none';
  /** opaque data echoed back when the notification is tapped. */
  userInfo?: Record<string, unknown>;
}

export interface PendingNotification {
  id: string;
  title: string;
  body: string;
  subtitle: string;
  userInfo?: Record<string, unknown>;
}

interface Pending { resolve: (v: string | null) => void; reject: (e: Error) => void; }
const _pending = new Map<number, Pending>();
let _nextId = 1;

if (typeof (globalThis as any).__iex_notifComplete !== 'function') {
  (globalThis as any).__iex_notifComplete = function (id: number, result: string | null, error: string | null) {
    const p = _pending.get(id);
    if (!p) return;
    _pending.delete(id);
    if (error) p.reject(new Error(error));
    else p.resolve(result);
  };
}

function call(method: string, ...args: any[]): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (typeof native?.[method] !== 'function') {
      reject(new Error(`notifications.${method} not available`));
      return;
    }
    const id = _nextId++;
    _pending.set(id, { resolve, reject });
    try { native[method](id, ...args); }
    catch (e) { _pending.delete(id); reject(e as Error); }
  });
}

const tapListeners = new Set<(id: string, userInfo: Record<string, unknown>) => void>();
let tapHandlerInstalled = false;

function ensureTapHandler() {
  if (tapHandlerInstalled || typeof native?.onNotificationTap !== 'function') return;
  tapHandlerInstalled = true;
  native.onNotificationTap((id: string, userInfoJson: string) => {
    let userInfo: Record<string, unknown> = {};
    try { userInfo = JSON.parse(userInfoJson || '{}'); } catch (e) {}
    tapListeners.forEach(fn => fn(id, userInfo));
  });
}

export const Notifications = {
  async requestPermission(): Promise<Permission> {
    const r = await call('notifRequestAuth');
    if (r === 'granted') return 'granted';
    if (r === 'denied') return 'denied';
    return 'unknown';
  },

  async schedule(opts: ScheduleOpts): Promise<string> {
    const r = await call('notifSchedule', JSON.stringify(opts));
    if (r == null) throw new Error('schedule returned null');
    return r;
  },

  cancel(id: string): void {
    if (typeof native?.notifCancel === 'function') native.notifCancel(id);
  },

  cancelAll(): void {
    if (typeof native?.notifCancelAll === 'function') native.notifCancelAll();
  },

  async listPending(): Promise<PendingNotification[]> {
    const r = await call('notifListPending');
    return r ? JSON.parse(r) : [];
  },

  addTapListener(fn: (id: string, userInfo: Record<string, unknown>) => void): () => void {
    ensureTapHandler();
    tapListeners.add(fn);
    return () => { tapListeners.delete(fn); };
  },
};
