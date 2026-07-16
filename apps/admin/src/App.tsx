import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/auth/auth-context";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { Orders } from "@/pages/Orders";
import { OrderDetail as OrderSupportDetail } from "@/pages/OrderDetail";
import { Operations } from "@/pages/Operations";
import { Finance } from "@/pages/Finance";
import { CatalogQuality } from "@/pages/CatalogQuality";
import { Catalog } from "@/pages/Catalog";
import { ProductDetail } from "@/pages/ProductDetail";
import { ErpRuns } from "@/pages/ErpRuns";
import { Users } from "@/pages/Users";
import { MarketplaceCategories } from "@/pages/MarketplaceCategories";
import { Offers } from "@/pages/merchant/Offers";
import { Stock } from "@/pages/merchant/Stock";
import { Products } from "@/pages/merchant/Products";
import { MerchantsList } from "@/pages/merchants/MerchantsList";
import { MerchantDetail } from "@/pages/merchants/MerchantDetail";
import { StoreDetail } from "@/pages/merchants/StoreDetail";
import { Coupons } from "@/pages/Coupons";
import { Reviews } from "@/pages/Reviews";

/** React Query só p/ o server-state novo (cupons — story 53); legado segue como está. */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

/** Tela inicial conforme papel: admin vê o dashboard; manager vai p/ ofertas. */
function RoleHome() {
  const { user } = useAuth();
  if (user && !user.roles.includes("admin")) return <Navigate to="/merchant/offers" replace />;
  return <Dashboard />;
}

/** Só admin entra nas telas globais; managers são redirecionados. */
function AdminOnly() {
  const { user } = useAuth();
  if (user && !user.roles.includes("admin")) return <Navigate to="/merchant/offers" replace />;
  return <Outlet />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route index element={<RoleHome />} />
                {/* Área do manager (S3.11) */}
                <Route path="merchant/offers" element={<Offers />} />
                <Route path="merchant/stock" element={<Stock />} />
                <Route path="merchant/products" element={<Products />} />
                {/* Telas globais — só admin */}
                <Route element={<AdminOnly />}>
                  <Route path="merchants" element={<MerchantsList />} />
                  <Route path="merchants/:merchantId" element={<MerchantDetail />} />
                  <Route path="stores/:storeId" element={<StoreDetail />} />
                  <Route path="coupons" element={<Coupons />} />
                  <Route path="reviews" element={<Reviews />} />
                  <Route path="catalog" element={<Catalog />} />
                  <Route path="catalog/:id" element={<ProductDetail />} />
                  <Route path="catalog-quality" element={<CatalogQuality />} />
                  <Route path="categories" element={<MarketplaceCategories />} />
                  <Route path="users" element={<Users />} />
                  <Route path="orders" element={<Orders />} />
                  <Route path="orders/:id" element={<OrderSupportDetail />} />
                  <Route path="operations" element={<Operations />} />
                  <Route path="finance" element={<Finance />} />
                  <Route path="erp" element={<ErpRuns />} />
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
