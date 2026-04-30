// iex/app — NSApplication-level controls (dock icon, badge, attention).
// All ops are no-ops on platforms without the bridge.

const native: any = (globalThis as any).__iex;

export type IconWeight =
  | 'ultralight' | 'thin' | 'light' | 'regular'
  | 'medium' | 'semibold' | 'bold' | 'heavy' | 'black';

export type IconSpec =
  | { path: string }
  | { symbol: string; size?: number; weight?: IconWeight }
  | null;

function setIcon(spec: IconSpec): void {
  if (typeof native?.appSetIcon !== 'function') return;
  native.appSetIcon(spec ? JSON.stringify(spec) : '');
}

function setDockBadge(text: string | number | null): void {
  if (typeof native?.appSetBadge !== 'function') return;
  native.appSetBadge(text == null ? '' : String(text));
}

function requestAttention(opts?: { critical?: boolean }): void {
  if (typeof native?.appRequestAttention !== 'function') return;
  native.appRequestAttention(!!opts?.critical);
}

function activate(): void {
  if (typeof native?.appActivate === 'function') native.appActivate();
}

function quit(): void {
  if (typeof native?.appQuit === 'function') native.appQuit();
}

export const App = { setIcon, setDockBadge, requestAttention, activate, quit };
