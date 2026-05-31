import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { brl, marketplace, type ProductDetail } from "@/api/marketplace";
import { Header } from "@/components/Header";
import { QtyStepper } from "@/components/QtyStepper";

/** Detalhe do produto (modal full screen): imagem, preço, opções, info, preço em outros mercados. */
export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [note, setNote] = useState("");
  const [qty, setQty] = useState(1);
  const [grams, setGrams] = useState(300);

  const load = useCallback(async () => {
    if (!id) return;
    setProduct(await mkt.productDetail(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!product) {
    return (
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <Header title={"Produto"} />
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  const main = product.offers[0];
  const others = product.offers.slice(1);
  const isWeight = product.saleType === "weight";

  async function addFromOffer(offerId: string) {
    if (isWeight) await mkt.addItem({ offerId, weightGrams: grams, note });
    else await mkt.addItem({ offerId, quantity: qty, note });
    router.push("/cart");
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title={product.name} />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.img} resizeMode="contain" />
        ) : (
          <View style={[styles.img, { borderWidth: 1, borderColor: colors.border }]} />
        )}

        {main ? (
          <View style={styles.priceRow}>
            {main.promoPriceCents != null ? (
              <Text style={styles.strike}>{brl(main.priceCents)}</Text>
            ) : null}
            <Text style={styles.price}>{brl(main.promoPriceCents ?? main.priceCents)}</Text>
          </View>
        ) : null}

        <View style={styles.fav}>
          <Ionicons name="heart-outline" size={18} color={colors.primary} />
          <Text style={{ color: colors.primary }}>Salvar nos favoritos</Text>
        </View>

        {isWeight ? (
          <Field label="Maturação">
            <View style={styles.select}>
              <Text>Maduro</Text>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </View>
          </Field>
        ) : null}

        <Field label="Se meu produto estiver fora de estoque">
          <View style={styles.select}>
            <Text>Prefiro o reembolso</Text>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </View>
        </Field>

        <Field label="Observações">
          <TextInput
            style={styles.input}
            placeholder="Opcional"
            value={note}
            onChangeText={setNote}
            placeholderTextColor={colors.textMuted}
          />
        </Field>

        {product.description ? (
          <View>
            <Text style={styles.infoTitle}>Informações do produto</Text>
            <Text muted>{product.description}</Text>
          </View>
        ) : null}

        {/* Mercado principal */}
        {main ? (
          <View style={styles.storeCard}>
            <View style={styles.storeDot}>
              <Ionicons name="storefront" size={16} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700" }}>{main.store.merchant.name}</Text>
              <Text variant="caption" muted>
                ⏱ 30 min ou programada · 🛵 R$7 - R$15
              </Text>
            </View>
            <Button
              title="Acessar loja"
              variant="outline"
              size="sm"
              onPress={() =>
                router.push(`/store/${main.store.id}?name=${encodeURIComponent(main.store.merchant.name)}`)
              }
            />
          </View>
        ) : null}

        {/* Preço em outros mercados */}
        {others.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.infoTitle}>Preço em outros mercados</Text>
            {others.map((o) => (
              <View key={o.id} style={styles.otherRow}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1}>{o.store.merchant.name}</Text>
                  <Text style={{ fontWeight: "700" }}>{brl(o.promoPriceCents ?? o.priceCents)}</Text>
                </View>
                <Button title="Adicionar" size="sm" onPress={() => addFromOffer(o.id)} />
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* Footer: quantidade + adicionar do mercado principal */}
      {main ? (
        <View style={styles.footer}>
          <QtyStepper
            label={isWeight ? `${grams}g` : String(qty)}
            onDec={() => (isWeight ? setGrams((g) => Math.max(100, g - 100)) : setQty((q) => Math.max(1, q - 1)))}
            onInc={() => (isWeight ? setGrams((g) => g + 100) : setQty((q) => q + 1))}
          />
          <View style={{ flex: 1 }}>
            <Button title="Adicionar" onPress={() => addFromOffer(main.id)} />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text variant="caption" muted>
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  img: { width: "100%", height: 180, borderRadius: radius.md, backgroundColor: colors.white },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  strike: { color: colors.strike, fontSize: 14, textDecorationLine: "line-through" },
  price: { fontSize: 22, fontWeight: "700" },
  fav: { flexDirection: "row", alignItems: "center", gap: 6 },
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
  infoTitle: { fontWeight: "700", marginBottom: spacing.xs },
  storeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  storeDot: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  otherRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
