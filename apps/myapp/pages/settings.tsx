import React, { useState } from 'react';
import { View, Text, Switch, StyleSheet, ScrollView } from 'react-native';

export const meta = { title: 'Settings', icon: 'S', tab: true, tabOrder: 2, statusBarStyle: 'dark-content' as const };

export default function Settings(): React.JSX.Element {
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [analytics, setAnalytics] = useState(false);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.section}>Preferences</Text>
      <View style={styles.group}>
        <SettingRow label="Dark Mode" value={darkMode} onToggle={setDarkMode} />
        <View style={styles.sep} />
        <SettingRow label="Notifications" value={notifications} onToggle={setNotifications} />
        <View style={styles.sep} />
        <SettingRow label="Analytics" value={analytics} onToggle={setAnalytics} />
      </View>

      <Text style={styles.section}>Info</Text>
      <View style={styles.group}>
        <InfoRow label="Framework" value="iExpo" />
        <View style={styles.sep} />
        <InfoRow label="React Native" value="0.85.2" />
        <View style={styles.sep} />
        <InfoRow label="Router" value="iex/router" />
      </View>
    </ScrollView>
  );
}

function SettingRow({ label, value, onToggle }: { label: string; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch value={value} onValueChange={onToggle} />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 40 },
  section: { fontSize: 13, fontWeight: '600', color: '#8e8e93', marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  group: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  rowLabel: { fontSize: 16 },
  rowValue: { fontSize: 16, color: '#8e8e93' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: '#e5e5ea', marginLeft: 16 },
});
