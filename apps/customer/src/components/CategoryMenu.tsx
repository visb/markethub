import React from "react";
import { Pressable, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text, colors, spacing } from "@markethub/ui";

export interface MenuCategory {
  id: string;
  name: string;
}

/** Menu horizontal de departamentos. Clicar abre a página da categoria. */
export function CategoryMenu({
  categories,
  onSelect,
}: {
  categories: MenuCategory[];
  onSelect: (cat: MenuCategory) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
      contentContainerStyle={styles.content}
    >
      <Ionicons name="menu" size={20} color={colors.primary} />
      {categories.map((c) => (
        <Pressable key={c.id} onPress={() => onSelect(c)}>
          <Text style={styles.link}>{c.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { paddingVertical: spacing.md, maxHeight: 56 },
  content: { alignItems: "center", gap: spacing.lg, paddingHorizontal: spacing.md },
  link: { color: colors.primary, fontWeight: "600" },
});
