import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text, colors, radius, spacing } from "@markethub/ui";
import { useSearchSuggestions } from "@/api/hooks/useProductSearch";

interface SearchBarProps {
  /** Submit do form OU tap num termo sugerido → tela de resultado. */
  onSubmit: (q: string) => void;
  /** Tap num departamento sugerido → tela da categoria (`/category/[id]`). */
  onSelectCategory: (category: { id: string; name: string }) => void;
  placeholder?: string;
}

/**
 * Campo de busca com dropdown de sugestões (story 80). Encapsula o input + a
 * orquestração do hook `useSearchSuggestions` (debounce + `enabled` ≥ 2 chars).
 * Termos e departamentos aparecem conforme digita; submeter ou tocar um termo
 * dispara `onSubmit`, tocar um departamento dispara `onSelectCategory`.
 */
export function SearchBar({ onSubmit, onSelectCategory, placeholder }: SearchBarProps) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const { terms, categories } = useSearchSuggestions(text);

  const submit = (q: string) => {
    const term = q.trim();
    if (!term) return;
    setOpen(false);
    onSubmit(term);
  };

  const selectCategory = (c: { id: string; name: string }) => {
    setOpen(false);
    onSelectCategory(c);
  };

  const hasSuggestions = terms.length > 0 || categories.length > 0;
  const showDropdown = open && text.trim().length >= 2 && hasSuggestions;

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <Ionicons name="search" size={18} color={colors.primary} />
        <TextInput
          style={styles.input}
          placeholder={placeholder ?? "Busque por produtos, marcas ou departamento..."}
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={(v) => {
            setText(v);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onSubmitEditing={() => submit(text)}
          returnKeyType="search"
        />
      </View>

      {showDropdown && (
        <ScrollView
          style={styles.dropdown}
          keyboardShouldPersistTaps="handled"
          testID="search-suggestions"
        >
          {terms.map((t) => (
            <Pressable
              key={`t-${t}`}
              testID={`suggestion-term-${t}`}
              style={styles.row}
              onPress={() => submit(t)}
            >
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <Text numberOfLines={1} style={styles.rowText}>
                {t}
              </Text>
            </Pressable>
          ))}
          {categories.map((c) => (
            <Pressable
              key={`c-${c.id}`}
              testID={`suggestion-category-${c.id}`}
              style={styles.row}
              onPress={() => selectCategory(c)}
            >
              <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
              <Text numberOfLines={1} style={styles.rowText}>
                {c.name} <Text variant="caption" muted>em Categoria</Text>
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: spacing.md, position: "relative", zIndex: 10 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  input: { flex: 1, color: colors.text },
  dropdown: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    maxHeight: 260,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowText: { flex: 1 },
});
