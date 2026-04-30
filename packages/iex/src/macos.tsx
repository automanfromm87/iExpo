import * as React from 'react';
import { Platform, View } from 'react-native';

const IS_MAC = Platform.OS === 'macos';

export type VibrancyMaterial =
  | 'sidebar'
  | 'titlebar'
  | 'menu'
  | 'popover'
  | 'selection'
  | 'headerView'
  | 'sheet'
  | 'hudWindow'
  | 'fullScreenUI'
  | 'toolTip'
  | 'contentBackground'
  | 'underWindowBackground'
  | 'underPageBackground';

interface VibrancyProps {
  material?: VibrancyMaterial;
  blending?: 'behindWindow' | 'withinWindow';
  style?: any;
  children?: React.ReactNode;
}

export function Vibrancy(props: VibrancyProps): React.JSX.Element {
  if (!IS_MAC) {
    return <View style={props.style}>{props.children}</View>;
  }
  return React.createElement('iex_vibrancy', {
    material: props.material ?? 'sidebar',
    blending: props.blending ?? 'behindWindow',
    style: props.style,
    children: props.children,
  });
}

// ─── SF Symbol ───

export type SFSymbolWeight =
  | 'ultralight' | 'thin' | 'light' | 'regular'
  | 'medium' | 'semibold' | 'bold' | 'heavy' | 'black';

export type SFSymbolScale = 'small' | 'medium' | 'large';

interface SFSymbolProps {
  name: string;
  size?: number;
  weight?: SFSymbolWeight;
  scale?: SFSymbolScale;
  color?: string;
  style?: any;
}

export function SFSymbol(props: SFSymbolProps): React.JSX.Element {
  if (!IS_MAC) {
    return <View style={props.style} />;
  }
  return React.createElement('iex_sf_symbol', {
    style: props.style,
    name: props.name,
    size: props.size ?? 14,
    weight: props.weight ?? 'regular',
    scale: props.scale ?? 'medium',
    color: props.color,
  });
}

export interface ContextMenuItem {
  label?: string;
  separator?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  style?: any;
  children: React.ReactNode;
}

// ─── Menu / keyboard shortcuts ───

export type ShortcutModifier = '⌘' | '⇧' | '⌥' | '⌃';

const MOD_MASK: Record<string, number> = {
  '⌘': 1 << 20,  // Command
  '⇧': 1 << 17,  // Shift
  '⌥': 1 << 19,  // Option
  '⌃': 1 << 18,  // Control
};

function parseShortcut(s?: string): { key: string; mask: number } {
  if (!s) return { key: '', mask: 0 };
  let mask = 0;
  let key = '';
  for (const c of Array.from(s)) {
    if (MOD_MASK[c] != null) mask |= MOD_MASK[c];
    else if (c) key = c.toLowerCase();
  }
  return { key, mask };
}

interface MenuItemSpec {
  menu: 'File' | 'Edit' | 'View' | 'Window' | 'Help' | string;
  label: string;
  shortcut?: string;
  onPress: () => void;
}

export const Menu = {
  addItem(spec: MenuItemSpec): { remove: () => void } {
    const native: any = (globalThis as any).__iex;
    if (!IS_MAC || !native || typeof native.menuItemAdd !== 'function') {
      return { remove() {} };
    }
    const { key, mask } = parseShortcut(spec.shortcut);
    const id = native.menuItemAdd(spec.menu, spec.label, key, mask, spec.onPress);
    return { remove() { native.menuItemRemove(id); } };
  },
};

// ─── Drag (mouseDragged with 5px threshold) ───

interface DragEvent { dx: number; dy: number; }

interface UseDraggableOpts {
  onStart?: () => void;
  onMove?: (e: DragEvent) => void;
  onEnd?: (e: DragEvent) => void;
}

export function useDraggable(opts: UseDraggableOpts) {
  const ref = React.useRef<UseDraggableOpts>(opts);
  ref.current = opts;
  return {
    onDragStart: () => ref.current.onStart && ref.current.onStart(),
    onDragMove: (json: string) => {
      try {
        const d = JSON.parse(json);
        ref.current.onMove && ref.current.onMove(d);
      } catch (e) {}
    },
    onDragEnd: (json: string) => {
      try {
        const d = JSON.parse(json);
        ref.current.onEnd && ref.current.onEnd(d);
      } catch (e) {}
    },
  };
}

export function ContextMenu({ items, style, children }: ContextMenuProps): React.JSX.Element {
  if (!IS_MAC) {
    return <View style={style}>{children}</View>;
  }
  const serialised = items.map(it =>
    it.separator ? { separator: true } :
      { label: it.label || '', danger: !!it.danger, disabled: !!it.disabled });
  const onItemPress = (idx: string) => {
    const i = parseInt(idx, 10);
    const item = items[i];
    if (item && !item.separator && !item.disabled && item.onPress) item.onPress();
  };
  const extraProps: any = {
    contextMenu: JSON.stringify(serialised),
    onContextMenuItemPress: onItemPress,
  };
  return (
    <View style={style} {...extraProps}>
      {children}
    </View>
  );
}
