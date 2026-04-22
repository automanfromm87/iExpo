import React, { useState } from 'react';
import { View, Text, Switch, StyleSheet, ScrollView } from 'react-native';

export const icon = 'S';

export default function Settings(): React.JSX.Element {
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [analytics, setAnalytics] = useState(false);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.groupTitle}>APPEARANCE</Text>
      <View style={styles.group}>
        <SettingRow label="Dark Mode" value={darkMode} onToggle={setDarkMode} />
        <Divider />
        <SettingRow label="Haptic Feedback" value={haptics} onToggle={setHaptics} />
      </View>

      <Text style={styles.groupTitle}>NOTIFICATIONS</Text>
      <View style={styles.group}>
        <SettingRow label="Push Notifications" value={notifications} onToggle={setNotifications} />
      </View>

      <Text style={styles.groupTitle}>PRIVACY</Text>
      <View style={styles.group}>
        <SettingRow label="Analytics" value={analytics} onToggle={setAnalytics} />
      </View>

      <Text style={styles.footer}>iExpo v0.1.0{'\n'}Built with Rust + React Native</Text>
    </ScrollView>
  );
}

function SettingRow({ label, value, onToggle }: {
  label: string; value: boolean; onToggle: (v: boolean) => void;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch value={value} onValueChange={onToggle} trackColor={{ true: '#007AFF', false: '#e9e9ea' }} />
    </View>
  );
}

function Divider(): React.JSX.Element {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f2f2f7' },
  container: { padding: 20, paddingBottom: 40 },
  groupTitle: {
    fontSize: 13, fontWeight: '600', color: '#8e8e93',
    letterSpacing: 0.5, marginBottom: 8, marginTop: 16, marginLeft: 4,
  },
  group: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16,
  },
  rowLabel: { flex: 1, fontSize: 16 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.1)', marginLeft: 16 },
  footer: { textAlign: 'center', color: '#8e8e93', fontSize: 12, marginTop: 32, lineHeight: 18 },
});
