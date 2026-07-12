import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text, colors, radius, spacing } from "@markethub/ui";
import type { StoreReviewDTO } from "@/api/marketplace";

/** Estrelas cheias/vazias (1..5) para a nota do review ou da média. */
export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  const full = Math.round(rating);
  return (
    <View style={styles.stars} accessibilityLabel={`Nota ${rating} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= full ? "star" : "star-outline"}
          size={size}
          color={colors.warning}
        />
      ))}
    </View>
  );
}

/** Data curta pt-BR (dd/mm/aaaa) a partir do ISO. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function ReviewRow({ review }: { review: StoreReviewDTO }) {
  return (
    <View style={styles.row} testID="store-review-item">
      <View style={styles.rowHead}>
        <Stars rating={review.rating} />
        <Text variant="caption" muted>
          {review.authorName} · {shortDate(review.createdAt)}
        </Text>
      </View>
      {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
      {review.replyText ? (
        <View style={styles.reply} testID="store-review-reply">
          <Text variant="caption" style={styles.replyLabel}>
            Resposta da loja
          </Text>
          <Text style={styles.replyText}>{review.replyText}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Seção "Avaliações" da página da loja (story 56). Mostra a lista paginada de
 * avaliações da REDE (não da loja física) — a nota agregada fica no cabeçalho.
 * Estado vazio convida a ser o primeiro. A tela injeta os dados dos hooks; este
 * componente é puro (sem fetch).
 */
export function StoreReviews({
  merchantName,
  items,
  count,
  isLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  merchantName: string;
  items: StoreReviewDTO[];
  count: number;
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Avaliações</Text>
      <Text variant="caption" muted style={styles.subtitle}>
        Avaliações da rede {merchantName}
      </Text>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
      ) : count === 0 ? (
        <Text muted style={styles.empty} testID="store-reviews-empty">
          Seja o primeiro a avaliar esta rede.
        </Text>
      ) : (
        <>
          {items.map((r) => (
            <ReviewRow key={r.id} review={r} />
          ))}
          {hasMore ? (
            <Pressable
              style={styles.more}
              onPress={onLoadMore}
              disabled={isLoadingMore}
              testID="store-reviews-more"
            >
              {isLoadingMore ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.moreText}>Ver mais avaliações</Text>
              )}
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  subtitle: { marginBottom: spacing.sm },
  stars: { flexDirection: "row", gap: 1 },
  empty: { paddingVertical: spacing.md },
  row: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  rowHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  comment: { color: colors.text },
  reply: {
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 2,
  },
  replyLabel: { color: colors.primary, fontWeight: "700" },
  replyText: { color: colors.text },
  more: {
    alignSelf: "center",
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  moreText: { color: colors.primary, fontWeight: "700" },
});
