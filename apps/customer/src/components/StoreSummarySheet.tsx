import React from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { brl, type StoreSummaryDTO } from "@/api/marketplace";
import { useStoreSummary } from "@/api/hooks/useStoreSummary";
import { MerchantLogo } from "@/components/MerchantLogo";

/** "R$7" ou "R$7 – R$15": valor único quando piso = teto, faixa quando difere. */
export function freightLabel(deliveryFeeCents: number, doorFeeCents: number): string {
  return deliveryFeeCents === doorFeeCents
    ? brl(deliveryFeeCents)
    : `${brl(deliveryFeeCents)} – ${brl(doorFeeCents)}`;
}

/** Endereço em uma linha (campos ausentes são omitidos). */
function addressLine(a: StoreSummaryDTO["address"]): string {
  const top = [a.street, a.number].filter(Boolean).join(", ");
  return [top, a.district, a.city, a.state].filter(Boolean).join(" · ");
}

/**
 * Bottom sheet com o resumo do mercado (ref: Explorar.jpg — story 29). Aberto ao
 * tocar o marker no explore; busca o resumo via `useStoreSummary` (spinner enquanto
 * carrega). "Retirar na loja" e "Aberto agora" são badges condicionais; o único CTA
 * é "Acessar loja" → `/store/:id`. `storeId` null fecha o modal.
 */
export function StoreSummarySheet({
  storeId,
  onClose,
}: {
  storeId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { summary, loading } = useStoreSummary(storeId);

  return (
    <Modal
      visible={!!storeId}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Pressable hitSlop={8} onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>

        {loading || !summary ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : (
          <Content summary={summary} onAccess={() => {
            router.push(
              `/store/${summary.id}?name=${encodeURIComponent(summary.merchantName)}`,
            );
            onClose();
          }} />
        )}
      </View>
    </Modal>
  );
}

function Content({ summary, onAccess }: { summary: StoreSummaryDTO; onAccess: () => void }) {
  return (
    <>
      <View style={styles.header}>
        <MerchantLogo name={summary.merchantName} logoUrl={summary.merchantLogoUrl} size={56} />
        <View style={styles.headerText}>
          <Text variant="title" numberOfLines={1}>
            {summary.name}
          </Text>
          <Text variant="caption" muted numberOfLines={2}>
            {addressLine(summary.address) || summary.merchantName}
          </Text>
          {summary.rating ? (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={14} color={colors.warning} />
              <Text variant="caption">
                {summary.rating.average.toFixed(1)} ({summary.rating.count})
              </Text>
            </View>
          ) : (
            <Text variant="caption" muted>
              Sem avaliações
            </Text>
          )}
        </View>
      </View>

      {summary.phone ? (
        <InfoRow icon="logo-whatsapp" text={summary.phone} />
      ) : null}
      <InfoRow icon="time-outline" text={`${summary.etaMinutes} min ou programada`} />
      <InfoRow
        icon="bicycle-outline"
        text={freightLabel(summary.deliveryFeeCents, summary.doorFeeCents)}
      />

      <View style={styles.badges}>
        <Badge
          label={summary.openNow ? "Aberto agora" : "Fechado"}
          color={summary.openNow ? colors.success : colors.textMuted}
        />
        {summary.allowsPickup && <Badge label="Retirar na loja" color={colors.success} />}
      </View>

      <Button title="Acessar loja" onPress={onAccess} style={styles.cta} />
    </>
  );
}

function InfoRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text style={{ flex: 1 }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text variant="caption" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  close: { position: "absolute", top: spacing.md, right: spacing.md, zIndex: 1 },
  loading: { paddingVertical: spacing.xl },
  header: { flexDirection: "row", gap: spacing.md, paddingRight: spacing.lg },
  headerText: { flex: 1, gap: 2 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  badges: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  badge: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  cta: { marginTop: spacing.lg },
});
