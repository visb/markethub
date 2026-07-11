import { useCallback, useEffect, useRef, useState } from "react";
import { ORDER_CREATED_EVENT } from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";
import { NEW_ORDER_CHIME } from "@/lib/chime";

const SOUND_KEY = "merchant.orderSound";

/** Lê a preferência de som persistida (opt-in, default desligado). */
export function readSoundPref(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

/** Título da aba sem o prefixo de contador `(n) `. */
function stripBadge(title: string): string {
  return title.replace(/^\(\d+\)\s*/, "");
}

export interface NewOrderAlertResult {
  soundEnabled: boolean;
  toggleSound: () => void;
  /** Pedidos novos recebidos com a aba em segundo plano (badge no título). */
  pendingCount: number;
}

/**
 * Alerta de pedido novo (story 54): toggle 🔔 de som (persistido em localStorage,
 * opt-in por autoplay policy) + badge de contador no `document.title` enquanto a
 * aba está em segundo plano. Ouve `order.created` no socket (mesmo evento do
 * board) — não abre conexão própria; o `useMerchantOrders` já gerencia o socket.
 */
export function useNewOrderAlert(enabled: boolean): NewOrderAlertResult {
  const { realtime } = useAuth();
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => readSoundPref());
  const [pendingCount, setPendingCount] = useState(0);
  const soundRef = useRef(soundEnabled);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    soundRef.current = soundEnabled;
  }, [soundEnabled]);

  const primeAudio = useCallback(() => {
    if (!audioRef.current && typeof Audio !== "undefined") {
      audioRef.current = new Audio(NEW_ORDER_CHIME);
    }
    return audioRef.current;
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SOUND_KEY, next ? "on" : "off");
      } catch {
        /* storage indisponível — segue só em memória */
      }
      // Liga: prime o áudio DENTRO do gesto do usuário (autoplay policy).
      if (next) primeAudio()?.load();
      return next;
    });
  }, [primeAudio]);

  // Badge no título: `(n) Título` enquanto há pedidos novos não vistos.
  useEffect(() => {
    const base = stripBadge(document.title);
    document.title = pendingCount > 0 ? `(${pendingCount}) ${base}` : base;
  }, [pendingCount]);

  useEffect(() => {
    if (!enabled) return;
    const onNewOrder = () => {
      if (typeof document !== "undefined" && document.hidden) {
        setPendingCount((c) => c + 1);
      }
      if (soundRef.current) {
        const audio = primeAudio();
        void audio?.play().catch(() => undefined);
      }
    };
    const onVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) setPendingCount(0);
    };
    realtime.on(ORDER_CREATED_EVENT, onNewOrder);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, realtime, primeAudio]);

  return { soundEnabled, toggleSound, pendingCount };
}
