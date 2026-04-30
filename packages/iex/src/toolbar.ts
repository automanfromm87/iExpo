// iex/macos Toolbar — bind a JS spec to NSWindow.toolbar (NSToolbar).
// Imperative API mirrors NSToolbar's nature: Toolbar.set() rebuilds; .hide() empties.

type ToolbarItemKind = 'button' | 'flexibleSpace' | 'space';

type ToolbarButton = {
  id: string;
  kind?: 'button';
  label?: string;
  tooltip?: string;
  bordered?: boolean;
  systemImage?: string;
  onPress?: () => void;
};

type ToolbarSpacer = {
  id: string;
  kind: 'flexibleSpace' | 'space';
};

type ToolbarItem = ToolbarButton | ToolbarSpacer;

type ToolbarStyle = 'unified' | 'unifiedCompact' | 'expanded' | 'preference';

type ToolbarConfig = {
  items: ToolbarItem[];
  style?: ToolbarStyle;
};

const native: any = (globalThis as any).__iex;

let currentDispatch: ((id: string) => void) | null = null;

function dispatch(id: string): void {
  currentDispatch && currentDispatch(id);
}

function set(items: ToolbarItem[], style?: ToolbarStyle): void {
  if (!native || typeof native.toolbarSet !== 'function') return;

  const callbacks: Record<string, () => void> = Object.create(null);
  const spec = items.map(it => {
    const kind = (it as any).kind ?? 'button';
    if (kind === 'button' && (it as ToolbarButton).onPress) {
      callbacks[it.id] = (it as ToolbarButton).onPress!;
    }
    return {
      id: it.id,
      kind,
      label: (it as ToolbarButton).label ?? '',
      tooltip: (it as ToolbarButton).tooltip ?? '',
      bordered: !!(it as ToolbarButton).bordered,
      systemImage: (it as ToolbarButton).systemImage ?? '',
    };
  });

  currentDispatch = id => {
    const cb = callbacks[id];
    if (cb) cb();
  };

  const cfg: ToolbarConfig = { items: spec as any };
  if (style) cfg.style = style;
  native.toolbarSet(JSON.stringify(cfg), dispatch);
}

function hide(): void {
  set([]);
}

export const Toolbar = { set, hide };
export type { ToolbarItem, ToolbarButton, ToolbarStyle, ToolbarConfig, ToolbarItemKind };
