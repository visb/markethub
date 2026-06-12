import React, { useEffect, useRef } from "react";
import { Animated, ScrollView, StyleSheet, View } from "react-native";
import { colors, radius, spacing } from "@markethub/ui";

/** Bloco pulsante — placeholder cinza com animação de opacidade. */
function Pulse({ style, opacity }: { style?: object; opacity: Animated.Value }) {
  return <Animated.View style={[styles.block, style, { opacity }]} />;
}

/**
 * Skeleton do feed da Home (S6.x): imita os carousels de produtos enquanto o
 * endereço é resolvido e o feed carrega. Algumas seções, cada uma com título e
 * uma fileira de cards no tamanho do ProductCard (158px).
 */
export function FeedSkeleton({ sections = 3, cards = 4 }: { sections?: number; cards?: number }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <ScrollView
      scrollEnabled={false}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      showsVerticalScrollIndicator={false}
    >
      {Array.from({ length: sections }).map((_, s) => (
        <View key={s}>
          <Pulse opacity={opacity} style={styles.title} />
          <View style={styles.row}>
            {Array.from({ length: cards }).map((__, c) => (
              <View key={c} style={styles.card}>
                <Pulse opacity={opacity} style={styles.img} />
                <Pulse opacity={opacity} style={styles.line} />
                <Pulse opacity={opacity} style={[styles.line, { width: "60%" }]} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surface, borderRadius: radius.sm },
  title: {
    height: 18,
    width: 160,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.md },
  card: { width: 158, gap: spacing.xs },
  img: { width: "100%", height: 92, borderRadius: radius.sm },
  line: { height: 12, width: "100%" },
});
