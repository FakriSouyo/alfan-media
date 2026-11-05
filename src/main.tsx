import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Providers } from "./app/providers";
import { useAuth } from "./lib/auth-context";
import "./app/globals.css";

const Login = lazy(() => import("./app/login/page"));
const ResetPassword = lazy(() => import("./app/reset-password/page"));
const Profile = lazy(() => import("./app/profile/page"));
const Dashboard = lazy(() => import("./app/(app)/dashboard/page"));
const Agent = lazy(() => import("./app/(app)/agent/page"));
const Products = lazy(() => import("./app/(app)/stock/products/page"));
const Product = lazy(() => import("./app/(app)/stock/products/[id]/page"));
const NewProduct = lazy(() => import("./app/(app)/stock/products/new/page"));
const Categories = lazy(() => import("./app/(app)/stock/categories/page"));
const NewSale = lazy(() => import("./app/(app)/sales/new/page"));
const Orders = lazy(() => import("./app/(app)/sales/orders/page"));
const Order = lazy(() => import("./app/(app)/sales/orders/[id]/page"));
const SalesReport = lazy(() => import("./app/(app)/reports/sales/page"));
const InventoryReport = lazy(() => import("./app/(app)/reports/inventory/page"));
const Settings = lazy(() => import("./app/(app)/settings/page"));
const AppLayout = lazy(() => import("./app-shell"));

function Loading() { return <div role="status" className="flex min-h-svh items-center justify-center bg-background text-muted-foreground">Memuat aplikasi…</div>; }
function Home() { const { user, loading } = useAuth(); return loading ? <Loading /> : <Navigate to={user ? "/agent" : "/login"} replace />; }

createRoot(document.getElementById("root")!).render(
  <BrowserRouter><Providers><Suspense fallback={<Loading />}><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/login" element={<Login />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route element={<AppLayout />}>
      <Route path="/agent" element={<Agent />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/stock" element={<Navigate to="/stock/products" replace />} />
      <Route path="/stock/products" element={<Products />} />
      <Route path="/stock/products/new" element={<NewProduct />} />
      <Route path="/stock/products/:id" element={<Product />} />
      <Route path="/stock/categories" element={<Categories />} />
      <Route path="/sales" element={<Navigate to="/sales/new" replace />} />
      <Route path="/sales/new" element={<NewSale />} />
      <Route path="/sales/orders" element={<Orders />} />
      <Route path="/sales/orders/:id" element={<Order />} />
      <Route path="/reports" element={<Navigate to="/reports/sales" replace />} />
      <Route path="/reports/sales" element={<SalesReport />} />
      <Route path="/reports/inventory" element={<InventoryReport />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/profile" element={<Profile />} />
    </Route>
    <Route path="*" element={<main className="p-8">Halaman tidak ditemukan. <a href="/">Kembali ke beranda</a></main>} />
  </Routes></Suspense></Providers></BrowserRouter>,
);
