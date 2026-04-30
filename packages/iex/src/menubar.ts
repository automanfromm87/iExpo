// iex/menubar — NSStatusItem (menu-bar app) wrapper.

const native: any = (globalThis as any).__iex;

export interface MenuBarItemOpts {
  systemImage?: string;
  image?: string;
  title?: string;
  tooltip?: string;
}

export interface MenuBarMenuItem {
  id?: string;
  label?: string;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

export interface MenuBarItem {
  update(opts: MenuBarItemOpts): void;
  setMenu(items: MenuBarMenuItem[] | null): void;
  onPress(handler: (() => void) | null): void;
  remove(): void;
}

function add(opts: MenuBarItemOpts = {}): MenuBarItem {
  if (typeof native?.statusBarAdd !== 'function') {
    return { update() {}, setMenu() {}, onPress() {}, remove() {} };
  }
  const id = native.statusBarAdd(JSON.stringify(opts)) as number;
  let menuCallbacks: Map<string, () => void> = new Map();

  return {
    update(next: MenuBarItemOpts) {
      native.statusBarUpdate(id, JSON.stringify(next));
    },
    setMenu(items: MenuBarMenuItem[] | null) {
      menuCallbacks = new Map();
      if (!items || items.length === 0) {
        native.statusBarSetMenu(id, '[]', null);
        return;
      }
      const spec = items.map((it, idx) => {
        if (it.separator) return { separator: true };
        const entryId = it.id ?? `iex.mbi.${idx}`;
        if (it.onPress) menuCallbacks.set(entryId, it.onPress);
        return {
          id: entryId,
          label: it.label ?? '',
          shortcut: it.shortcut ?? '',
          disabled: !!it.disabled,
        };
      });
      native.statusBarSetMenu(id, JSON.stringify(spec), (entryId: string) => {
        const cb = menuCallbacks.get(entryId);
        if (cb) cb();
      });
    },
    onPress(handler: (() => void) | null) {
      native.statusBarSetPress(id, handler ?? null);
    },
    remove() {
      menuCallbacks.clear();
      native.statusBarRemove(id);
    },
  };
}

export const MenuBar = { add };
