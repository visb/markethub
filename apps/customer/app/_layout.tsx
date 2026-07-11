import React from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth-context";
import { ToastProvider } from "@/components/Toast";
import { usePushRegistration } from "@/hooks/usePushRegistration";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/** Registra push no device (dentro do AuthProvider p/ observar a sessão). */
function PushRegistrar() {
  usePushRegistration();
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PushRegistrar />
          <ToastProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }}>
              {/* Detalhe do produto abre como modal (slide baixo→cima); fechar = router.back() (story 31). */}
              <Stack.Screen
                name="product/[id]"
                options={{ presentation: "modal", animation: "slide_from_bottom" }}
              />
            </Stack>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
