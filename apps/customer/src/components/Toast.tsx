import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet } from "react-native";
import { Text, colors, radius, spacing } from "@markethub/ui";

/**
 * Toast leve e reutilizável do app cliente (story 31). `useToast().show(msg)`
 * exibe uma faixa no rodapé com fade/slide e auto-dismiss (~2s). Sem filas nem
 * severidade — o mínimo para o feedback de "Adicionado ✓" no modal de produto.
 */

const DEFAULT_DURATION = 2000;
const FADE_MS = 150;

interface ToastContextValue {
  show: (message: string, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    if (clearTimer.current) clearTimeout(clearTimer.current);
  }, []);

  const show = useCallback(
    (msg: string, durationMs = DEFAULT_DURATION) => {
      clearTimers();
      setMessage(msg);
      Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
      // auto-dismiss: anima o fade-out e remove a mensagem após o fade (timer-driven
      // para o auto-dismiss ser determinístico, sem depender do callback do Animated).
      dismissTimer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start();
        clearTimer.current = setTimeout(() => setMessage(null), FADE_MS);
      }, durationMs);
    },
    [opacity, clearTimers],
  );

  useEffect(() => () => clearTimers(), [clearTimers]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message != null ? (
        <Animated.View
          pointerEvents="none"
          accessibilityRole="alert"
          style={[
            styles.toast,
            { opacity, transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
          ]}
        >
          <Text style={styles.text}>{message}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de <ToastProvider>");
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    backgroundColor: colors.text,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  text: { color: colors.white, fontWeight: "600" },
});
