// iex/fs — file system access (macOS via __iex bridge; iOS not yet wired).
//
// Sync path utilities (POSIX). All real I/O is async via Promise.

const native: any = (globalThis as any).__iex;

export interface AppDirs {
  appSupport: string;
  caches: string;
  documents: string;
  home: string;
  temp: string;
  bundle: string;
}

export interface Stat {
  size: number;
  isDirectory: boolean;
  mtime: number;
  ctime: number;
}

export interface OpenPanelOpts {
  allowMultiple?: boolean;
  canChooseFiles?: boolean;
  canChooseDirectories?: boolean;
  allowedTypes?: string[];
  message?: string;
}

export interface SavePanelOpts {
  defaultName?: string;
  allowedTypes?: string[];
  message?: string;
}

let cachedDirs: AppDirs | null = null;
function readDirs(): AppDirs {
  if (cachedDirs) return cachedDirs;
  if (!native?.fsAppDirs) {
    cachedDirs = { appSupport: '', caches: '', documents: '', home: '', temp: '', bundle: '' };
    return cachedDirs;
  }
  cachedDirs = JSON.parse(native.fsAppDirs() || '{}');
  return cachedDirs!;
}

// ─── async bridge ────────────────────────────────────────────────────────

interface PendingFs { resolve: (v: string | null) => void; reject: (e: Error) => void; }
const _pending = new Map<number, PendingFs>();
let _nextId = 1;

if (typeof (globalThis as any).__iex_fsComplete !== 'function') {
  (globalThis as any).__iex_fsComplete = function (id: number, result: string | null, error: string | null) {
    const p = _pending.get(id);
    if (!p) return;
    _pending.delete(id);
    if (error) p.reject(new Error(error));
    else p.resolve(result);
  };
}

function call(method: string, ...args: any[]): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (typeof native?.[method] !== 'function') {
      reject(new Error(`fs.${method} not available — running on a non-iExpo runtime?`));
      return;
    }
    const id = _nextId++;
    _pending.set(id, { resolve, reject });
    try { native[method](id, ...args); }
    catch (e) { _pending.delete(id); reject(e as Error); }
  });
}

async function callExpect(method: string, ...args: any[]): Promise<string> {
  const r = await call(method, ...args);
  if (r == null) throw new Error(`fs.${method} returned null`);
  return r;
}

// ─── path (sync, no I/O) ─────────────────────────────────────────────────

const path = {
  join(...parts: string[]): string {
    return parts
      .filter(p => p && p.length > 0)
      .join('/')
      .replace(/\/+/g, '/');
  },
  basename(p: string): string {
    const trimmed = p.replace(/\/+$/, '');
    const idx = trimmed.lastIndexOf('/');
    return idx < 0 ? trimmed : trimmed.slice(idx + 1);
  },
  dirname(p: string): string {
    const trimmed = p.replace(/\/+$/, '');
    const idx = trimmed.lastIndexOf('/');
    if (idx < 0) return '.';
    if (idx === 0) return '/';
    return trimmed.slice(0, idx);
  },
  extname(p: string): string {
    const base = path.basename(p);
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(dot) : '';
  },
};

// ─── ops ─────────────────────────────────────────────────────────────────

export const FS = {
  get paths(): AppDirs { return readDirs(); },
  path,

  async readText(p: string): Promise<string> {
    return callExpect('fsReadText', p);
  },
  async writeText(p: string, content: string): Promise<void> {
    await callExpect('fsWriteText', p, content);
  },
  async readBytes(p: string): Promise<Uint8Array> {
    const b64 = await callExpect('fsReadBytes', p);
    return base64ToBytes(b64);
  },
  async writeBytes(p: string, data: Uint8Array | ArrayBuffer): Promise<void> {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    await callExpect('fsWriteBytes', p, bytesToBase64(u8));
  },
  async exists(p: string): Promise<boolean> {
    return (await callExpect('fsExists', p)) === 'true';
  },
  async stat(p: string): Promise<Stat> {
    return JSON.parse(await callExpect('fsStat', p));
  },
  async list(p: string): Promise<string[]> {
    return JSON.parse(await callExpect('fsList', p));
  },
  async mkdir(p: string, options?: { recursive?: boolean }): Promise<void> {
    await callExpect('fsMkdir', p, !!options?.recursive);
  },
  async remove(p: string): Promise<void> {
    await callExpect('fsRemove', p);
  },
  async move(from: string, to: string): Promise<void> {
    await callExpect('fsMove', from, to);
  },
  async copy(from: string, to: string): Promise<void> {
    await callExpect('fsCopy', from, to);
  },

  async openFile(opts: OpenPanelOpts = {}): Promise<string[] | null> {
    const r = await call('fsOpenPanel', JSON.stringify({
      ...opts,
      canChooseFiles: opts.canChooseFiles ?? true,
      canChooseDirectories: opts.canChooseDirectories ?? false,
    }));
    return r ? JSON.parse(r) : null;
  },
  async openDirectory(opts: Omit<OpenPanelOpts, 'canChooseFiles' | 'canChooseDirectories'> = {}): Promise<string | null> {
    const r = await call('fsOpenPanel', JSON.stringify({
      ...opts,
      canChooseFiles: false,
      canChooseDirectories: true,
      allowMultiple: false,
    }));
    if (!r) return null;
    const arr: string[] = JSON.parse(r);
    return arr[0] ?? null;
  },
  async saveFile(opts: SavePanelOpts = {}): Promise<string | null> {
    return call('fsSavePanel', JSON.stringify(opts));
  },

  reveal(p: string): void {
    if (typeof native?.fsReveal === 'function') native.fsReveal(p);
  },
};

// ─── base64 helpers ──────────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof (globalThis as any).btoa === 'function') {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return (globalThis as any).btoa(bin);
  }
  // fallback (rare on iExpo) — manual encode
  const tbl = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = ''; let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i+1] << 8) | bytes[i+2];
    out += tbl[(n >> 18) & 63] + tbl[(n >> 12) & 63] + tbl[(n >> 6) & 63] + tbl[n & 63];
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((bytes[i+1] ?? 0) << 8);
    out += tbl[(n >> 18) & 63] + tbl[(n >> 12) & 63];
    out += i + 1 < bytes.length ? tbl[(n >> 6) & 63] : '=';
    out += '=';
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof (globalThis as any).atob === 'function') {
    const bin = (globalThis as any).atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  }
  // fallback
  const tbl = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const cleaned = b64.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor(cleaned.length * 3 / 4));
  let p = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const n = (tbl.indexOf(cleaned[i])     << 18)
            | (tbl.indexOf(cleaned[i + 1]) << 12)
            | ((tbl.indexOf(cleaned[i + 2]) | 0) << 6)
            | (tbl.indexOf(cleaned[i + 3]) | 0);
    out[p++] = (n >> 16) & 0xff;
    if (i + 2 < cleaned.length) out[p++] = (n >> 8) & 0xff;
    if (i + 3 < cleaned.length) out[p++] = n & 0xff;
  }
  return out.slice(0, p);
}
