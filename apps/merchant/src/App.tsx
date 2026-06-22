import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/auth/auth-context";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RequireCapability } from "@/components/RequireCapability";
import { Layout } from "@/components/Layout";
import { Login } from "@/pages/Login";
import { Stores } from "@/pages/Stores";
import { Integration } from "@/pages/Integration";
import { Staff } from "@/pages/Staff";
import { Catalog } from "@/pages/Catalog";
import { Orders } from "@/pages/Orders";
import { Placeholder } from "@/pages/Placeholder";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route index element={<Stores />} />
                {/* Só dono (owner) cria/edita lojas e gere integração. */}
                <Route element={<RequireCapability capability="integration.manage" />}>
                  <Route path="integration" element={<Integration />} />
                </Route>
                <Route element={<RequireCapability capability="staff.manage" />}>
                  <Route path="staff" element={<Staff />} />
                </Route>
                <Route element={<RequireCapability capability="catalog.manage" />}>
                  <Route path="catalog" element={<Catalog />} />
                </Route>
                <Route element={<RequireCapability capability="orders.view" />}>
                  <Route path="orders" element={<Orders />} />
                </Route>
                <Route element={<RequireCapability capability="reports.view" />}>
                  <Route path="reports" element={<Placeholder title="Relatórios" story="story 13" />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
