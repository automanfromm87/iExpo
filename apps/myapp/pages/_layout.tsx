import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <View style={styles.root}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f2f7' },
});
