import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { marketplace, type Address, type CoveredCity } from "@/api/marketplace";

export interface AddressFormValue {
  label: string;
  zipCode: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  complement: string;
  latitude: number | null;
  longitude: number | null;
}

const EMPTY: AddressFormValue = {
  label: "Casa",
  zipCode: "",
  street: "",
  number: "",
  district: "",
  city: "",
  state: "",
  complement: "",
  latitude: null,
  longitude: null,
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Formulário de endereço (S6.2): CEP primeiro (autocompleta via ViaCEP), botão
 * "Usar minha localização" (GPS + geocodificação reversa) e validação antecipada
 * da área de cobertura (S6.3).
 */
export function AddressForm({
  initial,
  submitLabel = "Salvar endereço",
  onSubmit,
  busy,
}: {
  initial?: Partial<Address> | null;
  submitLabel?: string;
  onSubmit: (value: AddressFormValue) => void | Promise<void>;
  busy?: boolean;
}) {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const [f, setF] = useState<AddressFormValue>({
    ...EMPTY,
    ...(initial
      ? {
          label: initial.label ?? "Casa",
          zipCode: initial.zipCode ?? "",
          street: initial.street ?? "",
          number: initial.number ?? "",
          district: initial.district ?? "",
          city: initial.city ?? "",
          state: initial.state ?? "",
          latitude: initial.latitude ?? null,
          longitude: initial.longitude ?? null,
        }
      : {}),
  });
  const [covered, setCovered] = useState<CoveredCity[]>([]);
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "notfound">("idle");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mkt.coverageCities().then(setCovered).catch(() => setCovered([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cityCovered =
    !f.city ||
    covered.length === 0 ||
    covered.some(
      (c) => normalize(c.city) === normalize(f.city) && c.state.toUpperCase() === f.state.toUpperCase().trim(),
    );

  const set = (patch: Partial<AddressFormValue>) => setF((prev) => ({ ...prev, ...patch }));

  /** CEP completo → ViaCEP preenche rua/bairro/cidade/UF. */
  async function onZipChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    const masked = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    set({ zipCode: masked });
    setCepStatus("idle");
    if (digits.length !== 8) return;
    setCepStatus("loading");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const body = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (body.erro) {
        setCepStatus("notfound");
        return;
      }
      set({
        street: body.logradouro ?? "",
        district: body.bairro ?? "",
        city: body.localidade ?? "",
        state: body.uf ?? "",
        // CEP mudou o endereço → coordenadas antigas não valem mais
        latitude: null,
        longitude: null,
      });
      setCepStatus("idle");
    } catch {
      setCepStatus("notfound");
    }
  }

  /**
   * GPS do dispositivo → o backend faz a geocodificação reversa (story 76) e
   * preenche o form. As coords do GPS entram sempre (prevalecem sobre o geocode);
   * se o backend não resolver, mantém o erro amigável e as coords no form.
   */
  async function useMyLocation() {
    setLocating(true);
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setError("Permissão de localização negada — preencha pelo CEP.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = pos.coords;
      const addr = await mkt.reverseGeocode(latitude, longitude);
      if (!addr) {
        // coords do GPS preservadas no form mesmo sem endereço resolvido
        set({ latitude, longitude });
        setError("Não foi possível identificar o endereço — preencha pelo CEP.");
        return;
      }
      set({
        zipCode: addr.zipCode ?? f.zipCode,
        street: addr.street ?? f.street,
        number: addr.number ?? f.number,
        district: addr.district ?? f.district,
        city: addr.city ?? f.city,
        state: addr.state ?? f.state,
        latitude,
        longitude,
      });
    } catch {
      setError("Falha ao obter a localização — preencha pelo CEP.");
    } finally {
      setLocating(false);
    }
  }

  const canSubmit =
    f.zipCode.replace(/\D/g, "").length === 8 &&
    !!f.street.trim() &&
    !!f.number.trim() &&
    !!f.city.trim() &&
    f.state.trim().length === 2 &&
    cityCovered;

  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable style={styles.gps} onPress={useMyLocation} disabled={locating}>
        {locating ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name="navigate" size={16} color={colors.primary} />
        )}
        <Text style={{ color: colors.primary, fontWeight: "600" }}>Usar minha localização</Text>
      </Pressable>

      <View style={styles.cepRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="CEP"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          value={f.zipCode}
          onChangeText={onZipChange}
        />
        {cepStatus === "loading" && <ActivityIndicator size="small" color={colors.primary} />}
      </View>
      {cepStatus === "notfound" && (
        <Text variant="caption" style={{ color: colors.danger }}>
          CEP não encontrado — preencha os campos manualmente.
        </Text>
      )}

      <TextInput
        style={styles.input}
        placeholder="Rua"
        placeholderTextColor={colors.textMuted}
        value={f.street}
        onChangeText={(v) => set({ street: v })}
      />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Número"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          value={f.number}
          onChangeText={(v) => set({ number: v })}
        />
        <TextInput
          style={[styles.input, { flex: 2 }]}
          placeholder="Complemento (opcional)"
          placeholderTextColor={colors.textMuted}
          value={f.complement}
          onChangeText={(v) => set({ complement: v })}
        />
      </View>
      <TextInput
        style={styles.input}
        placeholder="Bairro"
        placeholderTextColor={colors.textMuted}
        value={f.district}
        onChangeText={(v) => set({ district: v })}
      />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <TextInput
          style={[styles.input, { flex: 2 }]}
          placeholder="Cidade"
          placeholderTextColor={colors.textMuted}
          value={f.city}
          onChangeText={(v) => set({ city: v })}
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="UF"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          maxLength={2}
          value={f.state}
          onChangeText={(v) => set({ state: v.toUpperCase() })}
        />
      </View>
      <TextInput
        style={styles.input}
        placeholder="Rótulo (Casa, Trabalho...)"
        placeholderTextColor={colors.textMuted}
        value={f.label}
        onChangeText={(v) => set({ label: v })}
      />

      {!cityCovered && (
        <Text variant="caption" style={{ color: colors.danger }}>
          Ainda não atendemos {f.city}. Por enquanto estamos em Curitiba e região metropolitana.
        </Text>
      )}
      {error && (
        <Text variant="caption" style={{ color: colors.danger }}>
          {error}
        </Text>
      )}

      <Button
        title={submitLabel}
        variant="outline"
        disabled={!canSubmit || busy}
        loading={busy}
        onPress={() => void onSubmit(f)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  gps: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xs },
  cepRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
});
