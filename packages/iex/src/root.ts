// iex/root — which JS root am I rendering into?
// Multi-root macOS shells render the same React app into separate NSWindow
// containers. This hook lets app code branch on it (e.g. only the primary
// window owns the global toolbar). On platforms with a single root the
// hook always returns 1 and usePrimaryRoot() is always true.

import * as React from 'react';

const PRIMARY_ROOT_TAG = 1;

const rn: any = require('react-native');
const fallback = React.createContext<number>(PRIMARY_ROOT_TAG);
const RootTagContext: React.Context<number> = rn.RootTagContext || fallback;

export function useRootTag(): number {
  return React.useContext(RootTagContext);
}

export function usePrimaryRoot(): boolean {
  return React.useContext(RootTagContext) === PRIMARY_ROOT_TAG;
}

export { PRIMARY_ROOT_TAG };
