import { Platform, NativeModules, Dimensions } from 'react-native';

declare const __DEV__: boolean | undefined;

interface AppConfig {
  name?: string;
  displayName?: string;
  bundleId?: string;
  scheme?: string;
  port?: number;
  rnVersion?: string;
  projectDir?: string;
  isHub?: boolean;
}

interface BuildInfo {
  iexVersion?: string;
}

const g = globalThis as {
  __IEX_APP_CONFIG__?: AppConfig;
  __IEX_BUILD_INFO__?: BuildInfo;
};

const appConfig: AppConfig = g.__IEX_APP_CONFIG__ ?? {};
const buildInfo: BuildInfo = g.__IEX_BUILD_INFO__ ?? {};

const sm = (NativeModules.SettingsManager?.settings ?? {}) as {
  AppleLocale?: string;
  AppleLanguages?: string[];
};
const locale = sm.AppleLocale || sm.AppleLanguages?.[0] || 'en-US';

const isSimulator =
  Platform.OS === 'ios' &&
  /simulator/i.test(String(Platform.constants?.systemName ?? ''));

const Constants = {
  name: appConfig.name,
  displayName: appConfig.displayName,
  bundleId: appConfig.bundleId,
  scheme: appConfig.scheme,
  rnVersion: appConfig.rnVersion,
  iexVersion: buildInfo.iexVersion,
  projectDir: appConfig.projectDir,

  isDev: typeof __DEV__ !== 'undefined' ? !!__DEV__ : false,
  isDevice: !isSimulator,
  /// True when this app is running inside the iExpo platform launcher (`iex
  /// hub`). Use to skip side effects that assume the app owns the whole
  /// window — e.g. Window.set({ size, center }) flickers when the platform
  /// has already sized the window.
  isHub: !!appConfig.isHub,
  locale,
  platform: {
    os: Platform.OS,
    version: Platform.Version,
  },

  get window() { return Dimensions.get('window'); },
  get screen() { return Dimensions.get('screen'); },
};

export type IexConstants = typeof Constants;
export default Constants;
