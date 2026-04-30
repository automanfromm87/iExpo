import React, { useState } from 'react';
import { View, Text, Switch, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useAppForeground, useAppBackground } from 'iex/router';
import { Constants } from 'iex/constants';
import { FS } from 'iex/fs';
import { Notifications } from 'iex/notifications';
import { usePrefsStore, resetPrefs } from '../store/prefs';
import { resetTodos, useTodoStore } from '../store/todos';

export const meta = { title: 'Settings', icon: '⚙', systemImage: 'gearshape', tab: true, tabOrder: 2 };

export default function Settings(): React.JSX.Element {
  const [prefs, setPrefs] = usePrefsStore();
  const [todoState, setTodoState] = useTodoStore();
  const [fgCount, setFgCount] = useState(0);

  const setPref = <K extends keyof typeof prefs>(k: K, v: typeof prefs[K]) =>
    setPrefs(p => ({ ...p, [k]: v }));

  const exportTasks = async () => {
    try {
      const dest = await FS.saveFile({
        defaultName: 'tasks.json',
        allowedTypes: ['json'],
        message: 'Export your tasks as JSON',
      });
      if (!dest) return;
      await FS.writeText(dest, JSON.stringify(todoState, null, 2));
    } catch (e) {
      Alert.alert('Export failed', (e as Error).message);
    }
  };

  const importTasks = async () => {
    try {
      const picked = await FS.openFile({
        allowedTypes: ['json'],
        message: 'Choose a tasks.json to import',
      });
      if (!picked || picked.length === 0) return;
      const data = JSON.parse(await FS.readText(picked[0]));
      if (!data || !Array.isArray(data.todos) || typeof data.nextId !== 'number') {
        Alert.alert('Import failed', "That file doesn't look like a tasks export.");
        return;
      }
      setTodoState(data);
    } catch (e) {
      Alert.alert('Import failed', (e as Error).message);
    }
  };

  useAppForeground(() => {
    setFgCount(c => c + 1);
    console.log('[Settings] app came to foreground');
  });

  useAppBackground(() => {
    console.log('[Settings] app went to background');
  });

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.headerSection}>
        <Text style={styles.heading}>Settings</Text>
        <Text style={styles.subheading}>Configure your iExpo experience.</Text>
      </View>

      <Section label="Notifications">
        <Group>
          <Row label="Enable Notifications" hint="Receive task reminders and updates"
               right={<Switch value={prefs.notifications} onValueChange={async v => {
                 if (v) {
                   const result = await Notifications.requestPermission();
                   setPref('notifications', result === 'granted');
                   if (result !== 'granted') {
                     Alert.alert('Permission denied', 'Enable notifications in System Settings to receive task reminders.');
                   }
                 } else {
                   setPref('notifications', false);
                   Notifications.cancelAll();
                 }
               }} />} />
          <Sep />
          <Row label="Sound" hint="Play a sound when notifications arrive"
               right={<Switch value={prefs.sound} onValueChange={v => setPref('sound', v)} />} />
          <Sep />
          <TouchableOpacity
            style={styles.actionRow}
            onPress={async () => {
              try {
                await Notifications.schedule({
                  title: 'iExpo says hi',
                  body: `5-second test fired at ${new Date().toLocaleTimeString()}`,
                  delay: 5,
                  sound: prefs.sound ? 'default' : 'none',
                });
                Alert.alert('Scheduled', 'A notification will fire in 5 seconds.');
              } catch (e) {
                Alert.alert('Schedule failed', (e as Error).message);
              }
            }}
            activeOpacity={0.7}
            disabled={!prefs.notifications}
          >
            <Text style={[styles.actionText, !prefs.notifications && styles.actionTextDim]}>
              Send Test Notification (in 5s)
            </Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
        </Group>
      </Section>

      <Section label="Privacy">
        <Group>
          <Row label="Send Analytics" hint="Help improve iExpo by sharing anonymous usage"
               right={<Switch value={prefs.analytics} onValueChange={v => setPref('analytics', v)} />} />
        </Group>
      </Section>

      <Section label="App lifecycle (live)">
        <Group>
          <Row label="Foreground activations"
               right={<Text style={styles.value}>{fgCount}</Text>} />
          <Sep />
          <Row label="Hook source"
               right={<Text style={styles.valueDim}>useAppForeground</Text>} />
        </Group>
        <Text style={styles.hint}>
          Switch away with ⌘Tab and back to see this count rise.
        </Text>
      </Section>

      <Section label="Data">
        <Group>
          <TouchableOpacity style={styles.actionRow} onPress={exportTasks} activeOpacity={0.7}>
            <Text style={styles.actionText}>Export Tasks…</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
          <Sep />
          <TouchableOpacity style={styles.actionRow} onPress={importTasks} activeOpacity={0.7}>
            <Text style={styles.actionText}>Import Tasks…</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
          <Sep />
          <TouchableOpacity
            style={styles.dangerRow}
            onPress={() => Alert.alert('Reset all data?', 'This clears every task and your preferences. Cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', style: 'destructive', onPress: () => { resetTodos(); resetPrefs(); } },
            ])}
            activeOpacity={0.7}
          >
            <Text style={styles.dangerText}>Reset All Data</Text>
            <Text style={styles.dangerArrow}>›</Text>
          </TouchableOpacity>
        </Group>
      </Section>

      <Section label="Storage">
        <Group>
          <PathRow label="App data" path={FS.paths.appSupport} />
          <Sep />
          <PathRow label="Cache"    path={FS.paths.caches} />
        </Group>
      </Section>

      <Section label="About">
        <Group>
          <Row label="App"          right={<Text style={styles.value}>{Constants.displayName ?? '—'}</Text>} />
          <Sep />
          <Row label="Bundle ID"    right={<Text style={styles.valueDim}>{Constants.bundleId ?? '—'}</Text>} />
          <Sep />
          <Row label="iex CLI"      right={<Text style={styles.value}>{Constants.iexVersion ?? '—'}</Text>} />
          <Sep />
          <Row label="React Native" right={<Text style={styles.value}>{Constants.rnVersion ?? '—'}</Text>} />
          <Sep />
          <Row label="Platform"
               right={<Text style={styles.value}>{Constants.platform.os} {String(Constants.platform.version)}</Text>} />
          <Sep />
          <Row label="Locale"       right={<Text style={styles.value}>{Constants.locale}</Text>} />
          <Sep />
          <Row label="Window"
               right={<Text style={styles.value}>{Math.round(Constants.window.width)} × {Math.round(Constants.window.height)}</Text>} />
          <Sep />
          <Row label="Mode"
               right={<Text style={styles.value}>{Constants.isDev ? 'development' : 'production'}</Text>} />
        </Group>
      </Section>

      <Text style={styles.footer}>iExpo · macOS runtime · {new Date().getFullYear()}</Text>
    </ScrollView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

function Row({ label, hint, right }: { label: string; hint?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <View>{right}</View>
    </View>
  );
}

function Sep() {
  return <View style={styles.sep} />;
}

function PathRow({ label, path }: { label: string; path: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.pathHint} numberOfLines={1} ellipsizeMode="middle">{path || '—'}</Text>
      </View>
      {path ? (
        <TouchableOpacity onPress={() => FS.reveal(path)} activeOpacity={0.6}>
          <Text style={styles.revealBtn}>Reveal</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { paddingHorizontal: 32, paddingVertical: 24, paddingBottom: 60 },

  headerSection: { marginBottom: 16 },
  heading: { fontSize: 28, fontWeight: '700', color: '#1d1d1f' },
  subheading: { fontSize: 13, color: '#86868b', marginTop: 4 },

  section: { marginTop: 20 },
  sectionLabel: {
    fontSize: 11, fontWeight: '600',
    letterSpacing: 0.6, color: '#86868b',
    marginBottom: 8, paddingHorizontal: 4,
  },

  group: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
  },
  rowText: { flex: 1, paddingRight: 16 },
  rowLabel: { fontSize: 13, color: '#1d1d1f', fontWeight: '500' },
  rowHint: { fontSize: 11, color: '#86868b', marginTop: 2 },

  sep: { height: 1, backgroundColor: 'rgba(0,0,0,0.08)', marginLeft: 16 },

  value: { fontSize: 13, color: '#1d1d1f', fontWeight: '500' },
  valueDim: { fontSize: 12, color: '#86868b' },

  hint: {
    fontSize: 11, color: '#86868b',
    marginTop: 6, paddingHorizontal: 4,
  },

  pathHint: { fontSize: 11, color: '#86868b', marginTop: 3 },
  revealBtn: { fontSize: 12, color: '#0a84ff', fontWeight: '500' },

  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  actionText: { fontSize: 13, color: '#1d1d1f', fontWeight: '500' },
  actionTextDim: { color: '#a1a1a6' },
  actionArrow: { fontSize: 18, color: '#c7c7cc' },

  dangerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  dangerText: { fontSize: 13, color: '#ff3b30', fontWeight: '500' },
  dangerArrow: { fontSize: 18, color: '#c7c7cc' },

  footer: {
    fontSize: 11, color: '#a1a1a6',
    textAlign: 'center', marginTop: 32,
  },
});
