import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Vibration, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { PickItemDTO } from "@markethub/api-client";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import {
  isDuplicateScan,
  matchScan,
  normalizeGtin,
  type ScanGuard,
  type ScanMatch,
} from "@/lib/scanMatcher";

/** Descritor do aviso transitório mostrado após cada bip. */
export interface MatchFeedback {
  message: string;
  tone: "success" | "warn" | "error";
  /** Ação de desfazer (só no pick por unidade). */
  undo?: () => void;
}

export interface ScannerSheetProps {
  visible: boolean;
  onClose: () => void;
  items: PickItemDTO[];
  /** Itens resolvidos (inclui os otimistas ainda não commitados) — contador + matcher. */
  resolvedIds?: ReadonlySet<string>;
  /** A tela decide o efeito de cada bip e devolve o aviso a exibir no scanner. */
  onMatch: (result: ScanMatch) => MatchFeedback;
}

/** Tempo (ms) que o aviso do bip fica na tela. */
const BANNER_MS = 4000;

const TONE_BG: Record<MatchFeedback["tone"], string> = {
  success: colors.success,
  warn: colors.warning,
  error: colors.danger,
};

/**
 * Sheet de leitura de código de barras da separação (story 63). Renderiza a
 * câmera (`CameraView`) com overlay de mira, contador "X de N separados" p/ bipar
 * em sequência, e um aviso transitório por leitura. Toda a decisão do que fazer
 * com o código vem de `matchScan` (puro) + callback `onMatch` da tela. Câmera
 * negada/indisponível cai numa mensagem — a tela segue no fluxo manual.
 */
export function ScannerSheet({ visible, onClose, items, resolvedIds, onMatch }: ScannerSheetProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [feedback, setFeedback] = useState<MatchFeedback | null>(null);
  const guardRef = useRef<ScanGuard>({ code: null, at: 0 });
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Permissão pedida no 1º uso (só quando o sheet abre e ainda não foi concedida).
  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  // Limpa o timer do aviso ao desmontar.
  useEffect(() => () => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
  }, []);

  const showBanner = useCallback((fb: MatchFeedback) => {
    setFeedback(fb);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setFeedback(null), BANNER_MS);
  }, []);

  const handleScan = useCallback(
    (raw: string) => {
      const now = Date.now();
      if (isDuplicateScan(guardRef.current, raw, now)) return; // debounce mesmo código
      guardRef.current = { code: normalizeGtin(raw), at: now };

      const result = matchScan(items, raw, resolvedIds);
      // Vibração: erro/aviso = padrão longo; sucesso = toque curto.
      Vibration.vibrate(result.kind === "pick-unit" || result.kind === "focus-weight" ? 40 : [0, 60, 40, 60]);
      showBanner(onMatch(result));
    },
    [items, resolvedIds, onMatch, showBanner],
  );

  const total = items.length;
  const resolvedCount = items.filter((i) => i.status !== "pending" || resolvedIds?.has(i.id)).length;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text variant="title" style={styles.headerText}>
            Escanear
          </Text>
          <Text style={styles.counter}>
            {resolvedCount} de {total} separados
          </Text>
        </View>

        {permission?.granted ? (
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
              onBarcodeScanned={({ data }: { data: string }) => handleScan(data)}
            />
            <View style={styles.overlay} pointerEvents="none">
              <View style={styles.reticle} />
              <Text style={styles.hint}>Aponte para o código de barras</Text>
            </View>
          </View>
        ) : (
          <View style={styles.denied}>
            <Text style={styles.deniedText}>
              {permission && !permission.canAskAgain
                ? "Acesso à câmera negado. Toque nos itens para separar manualmente."
                : "Liberando a câmera..."}
            </Text>
          </View>
        )}

        {feedback && (
          <View style={[styles.banner, { backgroundColor: TONE_BG[feedback.tone] }]}>
            <Text style={styles.bannerText}>{feedback.message}</Text>
            {feedback.undo && (
              <Pressable
                onPress={() => {
                  feedback.undo?.();
                  setFeedback(null);
                }}
                style={styles.undo}
              >
                <Text style={styles.undoText}>Desfazer</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.footer}>
          <Button title="Fechar" variant="outline" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerText: { color: "#fff" },
  counter: { color: "#fff", fontWeight: "700" },
  cameraWrap: { flex: 1, position: "relative" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  reticle: {
    width: 240,
    height: 140,
    borderWidth: 3,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: "transparent",
  },
  hint: { color: "#fff", marginTop: spacing.md },
  denied: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  deniedText: { color: "#fff", textAlign: "center" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  bannerText: { color: "#fff", flex: 1, fontWeight: "600" },
  undo: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  undoText: { color: "#fff", fontWeight: "700" },
  footer: { padding: spacing.md },
});
