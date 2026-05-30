import React from "react";
import { type ViewProps, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../tokens";

export interface ScreenProps extends ViewProps {
  padded?: boolean;
}

export function Screen({ padded = true, style, children, ...rest }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.container, padded && styles.padded, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  padded: { padding: spacing.lg },
});
