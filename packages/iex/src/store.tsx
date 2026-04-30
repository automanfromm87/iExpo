import React, { createContext, useContext, useRef, useSyncExternalStore } from 'react';

type Listener = () => void;

class Store<T> {
  private state: T;
  private listeners = new Set<Listener>();

  constructor(initial: T) {
    this.state = initial;
  }

  getState = (): T => this.state;

  setState = (updater: T | ((prev: T) => T)): void => {
    const next = typeof updater === 'function' ? (updater as (prev: T) => T)(this.state) : updater;
    if (next === this.state) return;
    this.state = next;
    this.listeners.forEach(l => l());
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export interface PersistOptions<T> {
  key: string;
  serialize?: (state: T) => string;
  deserialize?: (raw: string) => T;
  /** Coalesce writes to NSUserDefaults — useful for rapid setState (drag, typing). */
  throttle?: number;
}

export interface CreateStoreOptions<T> {
  persist?: PersistOptions<T>;
}

const native: any = (globalThis as any).__iex;

function readStored(key: string): string | null {
  if (typeof native?.storageGet !== 'function') return null;
  const v = native.storageGet(String(key));
  return v == null || v === '' ? null : String(v);
}

function writeStored(key: string, value: string): void {
  if (typeof native?.storageSet !== 'function') return;
  native.storageSet(String(key), value);
}

export function createStore<T>(initial: T, options?: CreateStoreOptions<T>) {
  const persist = options?.persist;
  const serialize = persist?.serialize ?? JSON.stringify;
  const deserialize = persist?.deserialize ?? JSON.parse;

  let initialState = initial;
  if (persist) {
    const raw = readStored(persist.key);
    if (raw != null) {
      try { initialState = deserialize(raw); }
      catch (e) { console.warn(`[iex/store] hydrate failed for "${persist.key}":`, e); }
    }
  }

  const store = new Store(initialState);

  if (persist) {
    let pending: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      pending = null;
      try { writeStored(persist.key, serialize(store.getState())); }
      catch (e) { console.warn(`[iex/store] persist failed for "${persist.key}":`, e); }
    };
    store.subscribe(() => {
      if (persist.throttle && persist.throttle > 0) {
        if (pending) clearTimeout(pending);
        pending = setTimeout(flush, persist.throttle);
      } else {
        flush();
      }
    });
  }

  const Context = createContext(store);

  function Provider({ children }: { children: React.ReactNode }) {
    const ref = useRef(store);
    return <Context.Provider value={ref.current}>{children}</Context.Provider>;
  }

  function useStore(): [T, (updater: T | ((prev: T) => T)) => void] {
    const s = useContext(Context);
    const state = useSyncExternalStore(s.subscribe, s.getState);
    return [state, s.setState];
  }

  function useSelector<R>(selector: (state: T) => R): R {
    const s = useContext(Context);
    return useSyncExternalStore(
      s.subscribe,
      () => selector(s.getState()),
    );
  }

  const reset = (): void => store.setState(initial);

  return { Provider, useStore, useSelector, reset };
}
