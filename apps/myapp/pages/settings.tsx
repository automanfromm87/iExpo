import React, { useState } from 'react';
import { View, Text, Switch, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useAppForeground, useAppBackground } from 'iex/router';

export const meta = { title: 'Settings', icon: '⚙', tab: true, tabOrder: 2 };

export default function Settings(): React.JSX.Element {
  const [notifications, setNotifications] = useState(true);
  const [sound, setSound] = useState(true);
  const [fgCount, setFgCount] = useState(0);

  useAppForeground(() => {
    setFgCount(c => c + 1);
    console.log('[Settings] app came to foreground');
  });

  useAppBackground(() => {
    console.log('[Settings] app went to background');
  });

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.section}>Notifications</Text>
      <View style={styles.group}>
        <Row label="Enable Notifications" right={<Switch value={notifications} onValueChange={setNotifications} />} />
        <Sep />
        <Row label="Sound" right={<Switch value={sound} onValueChange={setSound} />} />
      </View>

      <Text style={styles.section}>App Lifecycle Demo</Text>
      <View style={styles.group}>
        <Row label="Foreground count" right={<Text style={styles.value}>{fgCount}</Text>} />
        <Sep />
        <Row label="Hook" right={<Text style={styles.value}>useAppForeground</Text>} />
      </View>
      <Text style={styles.hint}>Minimize and reopen the app to increment the counter.</Text>

      <Text style={styles.section}>Data</Text>
      <View style={styles.group}>
        <TouchableOpacity style={styles.row} onPress={() => Alert.alert('Reset', 'This would clear all tasks.')}>
          <Text style={[styles.label, { color: '#ff3b30' }]}>Reset All Data</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.section}>About</Text>
      <View style={styles.group}>
        <Row label="Framework" right={<Text style={styles.value}>iExpo</Text>} />
        <Sep />
        <Row label="React Native" right={<Text style={styles.value}>0.85.2</Text>} />
        <Sep />
        <Row label="Router" right={<Text style={styles.value}>iex/router</Text>} />
      </View>
    </ScrollView>
  );
}

function Row({ label, right }: { label: string; right: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {right}
    </View>
  );
}

function Sep() {
  return <View style={styles.sep} />;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 40 },
  section: { fontSize: 13, fontWeight: '600', color: '#8e8e93', marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  group: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  label: { fontSize: 16 },
  value: { fontSize: 15, color: '#8e8e93' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: '#e5e5ea', marginLeft: 16 },
  hint: { fontSize: 13, color: '#c7c7cc', marginTop: 8, paddingHorizontal: 4 },
});
