import { createStore } from 'iex/store';

export interface PrefsState {
  notifications: boolean;
  sound: boolean;
  analytics: boolean;
}

const SEED: PrefsState = {
  notifications: true,
  sound: true,
  analytics: false,
};

export const {
  Provider: PrefsProvider,
  useStore: usePrefsStore,
  useSelector: usePrefsSelector,
  reset: resetPrefs,
} = createStore<PrefsState>(
  SEED,
  { persist: { key: 'iex.myapp.prefs' } }
);
