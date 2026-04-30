// hub.tsx — the iExpo launcher.
//
// In the App-Store model the launcher is just one bundle among many. The
// macOS shell loads it by default; clicking "Launch" calls
// __iex.switchBundle(path) which tears down the JS engine and re-hosts on
// the picked app's bundle. Coming back happens via a native menu item that
// lives outside the JS engine and survives bundle swaps.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform,
} from 'react-native';
import { FS } from './fs';
import { useColorScheme } from './appearance';
import { Window } from './window';
import { Toolbar } from './toolbar';

const IS_MAC = Platform.OS === 'macos';
const INSTALLED_FILE = 'installed.json';

export interface AppCatalogEntry {
  id: string;
  displayName: string;
  icon: string;
  description: string;
  latestVersion: number;
  bundleUrl: string;
}

interface InstalledRecord {
  id: string;
  version: number;
  bundlePath: string;
  displayName: string;
  icon: string;
}

interface HubProps {
  serverUrl?: string;
}

const native: any = (globalThis as any).__iex;

// ─── persistence ────────────────────────────────────────────────────

async function readInstalled(): Promise<InstalledRecord[]> {
  try {
    const dir = FS.paths.appSupport;
    if (!dir) return [];
    const path = FS.path.join(dir, INSTALLED_FILE);
    if (!(await FS.exists(path))) return [];
    const parsed = JSON.parse(await FS.readText(path));
    if (!Array.isArray(parsed?.records)) return [];
    return parsed.records.filter((r: any) =>
      r && typeof r.id === 'string' && typeof r.bundlePath === 'string');
  } catch (e) {
    console.warn('[launcher] read installed.json:', e);
    return [];
  }
}

async function writeInstalled(records: InstalledRecord[]): Promise<void> {
  try {
    const dir = FS.paths.appSupport;
    if (!dir) return;
    await FS.mkdir(dir, { recursive: true });
    await FS.writeText(FS.path.join(dir, INSTALLED_FILE), JSON.stringify({ records }));
  } catch (e) {
    console.warn('[launcher] write installed.json:', e);
  }
}

async function fetchCatalog(serverUrl: string): Promise<AppCatalogEntry[]> {
  try {
    const res = await fetch(serverUrl + '/apps');
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  } catch (e) {
    console.warn('[launcher] fetch catalog:', e);
    return [];
  }
}

async function downloadBundle(serverUrl: string, entry: AppCatalogEntry): Promise<string> {
  const dir = FS.paths.appSupport;
  if (!dir) throw new Error('appSupport dir unavailable');
  const appDir = FS.path.join(dir, 'apps', entry.id);
  await FS.mkdir(appDir, { recursive: true });
  const bundlePath = FS.path.join(appDir, `v${entry.latestVersion}.jsbundle`);

  const res = await fetch(serverUrl + entry.bundleUrl);
  if (!res.ok) throw new Error(`bundle download failed: HTTP ${res.status}`);
  const src = await res.text();
  await FS.writeText(bundlePath, src);
  return bundlePath;
}

async function deleteAppFiles(record: InstalledRecord): Promise<void> {
  try {
    const appDir = FS.path.dirname(record.bundlePath);
    if (await FS.exists(appDir)) await FS.remove(appDir);
  } catch (e) {
    console.warn('[launcher] delete files:', e);
  }
}

// ─── Hub component ──────────────────────────────────────────────────

export function Hub({ serverUrl = 'http://localhost:3000' }: HubProps): React.JSX.Element {
  const [installed, setInstalled] = useState<InstalledRecord[]>([]);
  const [catalog, setCatalog] = useState<AppCatalogEntry[]>([]);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => { void readInstalled().then(setInstalled); }, []);

  const refresh = useCallback(() => {
    void fetchCatalog(serverUrl).then(setCatalog);
  }, [serverUrl]);
  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!IS_MAC) return;
    Window.set({
      title: 'iExpo',
      size: { width: 960, height: 640 },
      minSize: { width: 600, height: 420 },
      titleBarStyle: 'hidden',
      center: true,
    });
    Toolbar.hide();
  }, []);

  const installedIds = useMemo(() => new Set(installed.map(r => r.id)), [installed]);
  const catalogById = useMemo(() => {
    const m = new Map<string, AppCatalogEntry>();
    for (const e of catalog) m.set(e.id, e);
    return m;
  }, [catalog]);

  const installedRows = useMemo(() =>
    installed.map(r => ({ record: r, entry: catalogById.get(r.id) ?? null })),
    [installed, catalogById]);
  const availableRows = useMemo(() =>
    catalog.filter(e => !installedIds.has(e.id)),
    [catalog, installedIds]);

  const setBusyFor = (id: string, on: boolean) => {
    setBusy(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  };

  const install = useCallback(async (entry: AppCatalogEntry) => {
    if (installedIds.has(entry.id) || busy.has(entry.id)) return;
    setBusyFor(entry.id, true);
    try {
      const bundlePath = await downloadBundle(serverUrl, entry);
      const record: InstalledRecord = {
        id: entry.id,
        version: entry.latestVersion,
        bundlePath,
        displayName: entry.displayName,
        icon: entry.icon,
      };
      const next = [...installed, record];
      setInstalled(next);
      await writeInstalled(next);
      native?.refreshSidebar?.();
    } catch (e) {
      console.warn('[launcher] install failed:', e);
    } finally {
      setBusyFor(entry.id, false);
    }
  }, [serverUrl, installed, installedIds, busy]);

  const uninstall = useCallback(async (id: string) => {
    const record = installed.find(r => r.id === id);
    if (!record) return;
    const next = installed.filter(r => r.id !== id);
    setInstalled(next);
    await writeInstalled(next);
    await deleteAppFiles(record);
    native?.refreshSidebar?.();
  }, [installed]);

  const launch = useCallback((record: InstalledRecord) => {
    if (typeof native?.switchBundle !== 'function') {
      console.warn('[launcher] __iex.switchBundle not available — native missing handler');
      return;
    }
    native.switchBundle('file://' + record.bundlePath);
  }, []);

  return (
    <Launcher
      installed={installedRows}
      available={availableRows}
      busy={busy}
      onLaunch={launch}
      onInstall={install}
      onUninstall={uninstall}
      onRefresh={refresh}
    />
  );
}

// ─── Launcher screen ────────────────────────────────────────────────

interface InstalledRow {
  record: InstalledRecord;
  entry: AppCatalogEntry | null;
}

function Launcher({ installed, available, busy, onLaunch, onInstall, onUninstall, onRefresh }: {
  installed: InstalledRow[];
  available: AppCatalogEntry[];
  busy: Set<string>;
  onLaunch: (r: InstalledRecord) => void;
  onInstall: (e: AppCatalogEntry) => void;
  onUninstall: (id: string) => void;
  onRefresh: () => void;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const [containerWidth, setContainerWidth] = useState(0);
  const targetTile = IS_MAC ? 200 : 160;
  const gap = 16;
  const horizontalPadding = 24 * 2;
  const innerWidth = Math.max(0, containerWidth - horizontalPadding);
  const cols = innerWidth > 0
    ? Math.max(2, Math.floor((innerWidth + gap) / (targetTile + gap)))
    : 2;
  const tileWidth = innerWidth > 0
    ? Math.floor((innerWidth - gap * (cols - 1)) / cols)
    : targetTile;

  const bg = isDark ? '#1c1c1e' : '#f5f5f7';
  const tileBg = isDark ? '#2c2c2e' : '#ffffff';
  const titleColor = isDark ? '#f5f5f7' : '#1d1d1f';
  const subColor = isDark ? '#a1a1a6' : '#86868b';
  const sectionColor = isDark ? '#a1a1a6' : '#3c3c43';

  const empty = installed.length === 0 && available.length === 0;

  return (
    <View
      style={[s.launcher, { backgroundColor: bg }]}
      onLayout={(e: any) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <View style={[s.header, IS_MAC && { paddingTop: 36 }]}>
        <View style={s.headerRow}>
          <Text style={[s.brand, { color: titleColor }]}>iExpo</Text>
          <TouchableOpacity onPress={onRefresh} style={s.refreshBtn} activeOpacity={0.6}>
            <Text style={s.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>
        <Text style={[s.tagline, { color: subColor }]}>
          {summary(installed.length, available.length)}
        </Text>
      </View>

      <ScrollView contentContainerStyle={s.grid}>
        {installed.length > 0 ? (
          <View style={s.section}>
            <Text style={[s.sectionLabel, { color: sectionColor }]}>Installed</Text>
            <View style={s.gridRow}>
              {installed.map(row => (
                <InstalledTile
                  key={row.record.id}
                  row={row}
                  width={tileWidth}
                  bg={tileBg}
                  titleColor={titleColor}
                  subColor={subColor}
                  onLaunch={() => onLaunch(row.record)}
                  onUninstall={() => onUninstall(row.record.id)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {available.length > 0 ? (
          <View style={s.section}>
            <Text style={[s.sectionLabel, { color: sectionColor }]}>Available to install</Text>
            <View style={s.gridRow}>
              {available.map(entry => (
                <AvailableTile
                  key={entry.id}
                  entry={entry}
                  width={tileWidth}
                  bg={tileBg}
                  titleColor={titleColor}
                  subColor={subColor}
                  busy={busy.has(entry.id)}
                  onInstall={() => onInstall(entry)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {empty ? (
          <View style={s.empty}>
            <Text style={[s.emptyTitle, { color: titleColor }]}>No apps yet</Text>
            <Text style={[s.emptyHint, { color: subColor }]}>
              Run `iex publish-app &lt;id&gt;` against your bundled server, then tap Refresh.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function summary(installed: number, available: number): string {
  if (installed === 0 && available === 0) return 'Catalog is empty — publish an app to get started.';
  const parts: string[] = [];
  if (installed > 0) parts.push(`${installed} installed`);
  if (available > 0) parts.push(`${available} available`);
  return parts.join(' · ');
}

function InstalledTile({ row, width, bg, titleColor, subColor, onLaunch, onUninstall }: {
  row: InstalledRow;
  width: number;
  bg: string;
  titleColor: string;
  subColor: string;
  onLaunch: () => void;
  onUninstall: () => void;
}) {
  const icon = row.entry?.icon ?? '📦';
  const name = row.entry?.displayName ?? row.record.id;
  const desc = row.entry?.description ?? `Installed v${row.record.version}`;
  return (
    <TouchableOpacity
      style={[s.tile, { width, height: width, backgroundColor: bg }]}
      onPress={onLaunch}
      activeOpacity={0.7}
    >
      <View style={s.iconBox}>
        <Text style={s.iconText}>{icon}</Text>
      </View>
      <Text style={[s.tileName, { color: titleColor }]} numberOfLines={1}>{name}</Text>
      <Text style={[s.tileDesc, { color: subColor }]} numberOfLines={2}>{desc}</Text>
      <TouchableOpacity onPress={onUninstall} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <Text style={s.uninstallText}>Uninstall</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function AvailableTile({ entry, width, bg, titleColor, subColor, busy, onInstall }: {
  entry: AppCatalogEntry;
  width: number;
  bg: string;
  titleColor: string;
  subColor: string;
  busy: boolean;
  onInstall: () => void;
}) {
  return (
    <View style={[s.tile, { width, height: width, backgroundColor: bg }]}>
      <View style={s.iconBox}>
        <Text style={s.iconText}>{entry.icon || entry.displayName.charAt(0).toUpperCase()}</Text>
      </View>
      <Text style={[s.tileName, { color: titleColor }]} numberOfLines={1}>
        {entry.displayName}
      </Text>
      {entry.description ? (
        <Text style={[s.tileDesc, { color: subColor }]} numberOfLines={2}>
          {entry.description}
        </Text>
      ) : null}
      <TouchableOpacity
        style={[s.installBtn, busy && s.installBtnDisabled]}
        onPress={onInstall}
        disabled={busy}
        activeOpacity={0.7}
      >
        <Text style={s.installBtnText}>{busy ? 'Installing…' : 'Install'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  launcher: { flex: 1 },
  header: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  tagline: { fontSize: 14, marginTop: 4 },
  refreshBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  refreshText: { fontSize: 13, fontWeight: '500', color: '#0a84ff' },

  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 24,
    marginBottom: 12,
  },

  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyHint: { fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 18 },

  grid: { paddingBottom: 32 },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingHorizontal: 24 },

  tile: {
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  iconBox: {
    width: 56, height: 56, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(10,132,255,0.12)',
  },
  iconText: { fontSize: 30 },
  tileName: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  tileDesc: { fontSize: 11, textAlign: 'center', lineHeight: 14 },

  uninstallText: { fontSize: 11, color: '#ff3b30', fontWeight: '500', marginTop: 4 },

  installBtn: {
    backgroundColor: '#0a84ff',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    marginTop: 4,
  },
  installBtnDisabled: { backgroundColor: '#8e8e93' },
  installBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
});
