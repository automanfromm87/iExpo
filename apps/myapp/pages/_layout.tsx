import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.accent} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  accent: { height: 3, backgroundColor: '#007AFF' },
});
