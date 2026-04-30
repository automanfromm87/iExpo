// iex/window — imperative macOS window controls.
// On non-macOS platforms these calls are no-ops so app code stays portable.

type Size = { width: number; height: number };
type WindowConfig = {
  title?: string;
  size?: Size & { animated?: boolean };
  minSize?: Size;
  titleBarStyle?: 'default' | 'transparent' | 'hidden';
  backgroundColor?: string;
  movableByBackground?: boolean;
  center?: boolean;
};

const native: any = (globalThis as any).__iex;

function set(cfg: WindowConfig): void {
  if (!native || typeof native.windowSet !== 'function') return;
  native.windowSet(JSON.stringify(cfg));
}

export const Window = {
  set,
  setTitle(title: string) { set({ title }); },
  setSize(width: number, height: number, animated = false) {
    set({ size: { width, height, animated } });
  },
  setMinSize(width: number, height: number) { set({ minSize: { width, height } }); },
  setTitleBarStyle(style: 'default' | 'transparent' | 'hidden') { set({ titleBarStyle: style }); },
  setBackgroundColor(color: string) { set({ backgroundColor: color }); },
  center() { set({ center: true }); },
};

export type { WindowConfig };
