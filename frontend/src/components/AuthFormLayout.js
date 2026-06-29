import React from 'react';
import { ScrollView, Platform, StyleSheet, View } from 'react-native';

const IS_WEB = Platform.OS === 'web';
const IS_IOS = Platform.OS === 'ios';

/** Pantallas de auth centradas; el teclado solo ajusta en iOS (Android usa resize en app.json). */
export default function AuthFormLayout({ children, backgroundColor }) {
  return (
    <View style={[styles.flex, { backgroundColor }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={IS_IOS}
        showsVerticalScrollIndicator={false}
        bounces={!IS_WEB}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    paddingBottom: 32,
  },
});
