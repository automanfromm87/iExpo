import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const meta = { title: 'About' };

export default function About(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>About</Text>
      <Text style={styles.body}>
        This Hello World app demonstrates iExpo's multi-app platform mode —
        the same shell hosts both this and the Tasks app, with the launcher
        switching between them at runtime.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 32, paddingTop: 24, gap: 12 },
  heading: { fontSize: 28, fontWeight: '700', color: '#1d1d1f' },
  body: { fontSize: 14, color: '#3c3c43', lineHeight: 20 },
});
