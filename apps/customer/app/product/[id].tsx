import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { brl } from "@/api/marketplace";
import {
  useAddCartItem,
  useFavorites,
  useProductDetail,
  useToggleFavorite,
} from "@/api/hooks/useProductDetail";
import { useToast } from "@/components/Toast";
import { Header } from "@/components/Header";
import { MerchantLogo } from "@/components/MerchantLogo";
import { QtyStepper } from "@/components/QtyStepper";
import { Select } from "@/components/Select";

const OUT_OF_STOCK_OPTIONS = ["Prefiro o reembolso", "Trocar por similar", "Cancelar a compra"];

/** Detalhe do produto (modal slide baixo→cima): imagem, preço, opções, info, preço em outros mercados. */
export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { product } = useProductDetail(id);
  const { favorites } = useFavorites();
  const toggleFavorite = useToggleFavorite();
  const addCartItem = useAddCartItem();

  const [note, setNote] = useState("");
  // opção de preparo do departamento (S6.6): rótulo/opções vêm da API
  const [prep, setPrep] = useState<string | null>(null);
  const [outOfStock, setOutOfStock] = useState(OUT_OF_STOCK_OPTIONS[0]);
  const [qty, setQty] = useState(1);
  const [grams, setGrams] = useState(300);

  // default de preparo derivado do dado do hook (server-state → React Query).
  useEffect(() => {
    setPrep(product?.prepOptions?.options[0] ?? null);
  }, [product?.id, product?.prepOptions]);

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
  const favorite = !!main && favorites.some((f) => f.offerId === main.id);

  async function addFromOffer(offerId: string, opts?: { closeAfter?: boolean }) {
    const meta = [
      product?.prepOptions && prep ? `${product.prepOptions.label}: ${prep}` : null,
      `Fora de estoque: ${outOfStock}`,
      note.trim() ? `Obs: ${note.trim()}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const body = isWeight
      ? { offerId, weightGrams: grams, note: meta }
      : { offerId, quantity: qty, note: meta };
    await addCartItem.mutateAsync(body);
    // oferta principal: adiciona + toast + fecha o modal (story 31).
    if (opts?.closeAfter) {
      toast.show("Adicionado ✓");
      router.back();
    } else {
      // outras ofertas: comportamento atual (vai pro carrinho).
      router.push("/cart");
    }
  }

  function onToggleFavorite() {
    if (!main || toggleFavorite.isPending) return;
    toggleFavorite.mutate({ offerId: main.id, favorite });
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

        <Pressable style={styles.fav} onPress={onToggleFavorite} disabled={toggleFavorite.isPending}>
          <Ionicons
            name={favorite ? "heart" : "heart-outline"}
            size={18}
            color={colors.primary}
          />
          <Text style={{ color: colors.primary }}>
            {favorite ? "Salvo nos favoritos" : "Salvar nos favoritos"}
          </Text>
        </Pressable>

        {product.prepOptions ? (
          <Field label={product.prepOptions.label}>
            <Select
              value={prep ?? product.prepOptions.options[0]}
              options={product.prepOptions.options}
              onChange={setPrep}
            />
          </Field>
        ) : null}

        <Field label="Se meu produto estiver fora de estoque">
          <Select value={outOfStock} options={OUT_OF_STOCK_OPTIONS} onChange={setOutOfStock} />
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
            <MerchantLogo
              name={main.store.merchant.name}
              logoUrl={main.store.merchant.logoUrl}
              size={32}
            />
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
            <Button title="Adicionar" onPress={() => addFromOffer(main.id, { closeAfter: true })} />
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
