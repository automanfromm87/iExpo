import React, { createContext, useContext, useRef, useSyncExternalStore, useCallback } from 'react';

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

export function createStore<T>(initial: T) {
  const store = new Store(initial);
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

  return { Provider, useStore, useSelector, store };
}
