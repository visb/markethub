import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/auth/auth-context";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { Catalog } from "@/pages/Catalog";
import { ProductDetail } from "@/pages/ProductDetail";
import { ErpRuns } from "@/pages/ErpRuns";
import { Users } from "@/pages/Users";
import { MarketplaceCategories } from "@/pages/MarketplaceCategories";

function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h1>{title}</h1>
      <p className="muted">Em breve.</p>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="catalog" element={<Catalog />} />
              <Route path="catalog/:id" element={<ProductDetail />} />
              <Route path="categories" element={<MarketplaceCategories />} />
              <Route path="users" element={<Users />} />
              <Route path="orders" element={<Placeholder title="Pedidos" />} />
              <Route path="erp" element={<ErpRuns />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
