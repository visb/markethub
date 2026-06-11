import React, { useState } from "react";
import { Image, StyleSheet, View, type ViewStyle } from "react-native";
import { Text, colors, radius } from "@markethub/ui";

/** Iniciais do mercado p/ fallback sem logo ("Supermercado Europa" → "E"). */
export function merchantInitials(name: string): string {
  const words = name.replace(/^(super)?mercado\s+/i, "").trim().split(/\s+/);
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

interface MerchantLogoProps {
  name: string;
  logoUrl: string | null | undefined;
  size?: number;
  style?: ViewStyle;
}

/** Logo circular do mercado; sem logo (ou erro ao carregar) cai nas iniciais. */
export function MerchantLogo({ name, logoUrl, size = 32, style }: MerchantLogoProps) {
  const [failed, setFailed] = useState(false);
  const showImage = !!logoUrl && !failed;
  return (
    <View style={[styles.circle, { width: size, height: size }, style]}>
      {showImage ? (
        <Image
          source={{ uri: logoUrl }}
          style={{ width: size, height: size, borderRadius: radius.full }}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={[styles.initials, { fontSize: Math.max(11, size * 0.34) }]}>
          {merchantInitials(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderRadius: radius.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initials: { color: colors.primary, fontWeight: "800" },
});
