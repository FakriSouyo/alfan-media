import { Outlet } from "react-router-dom";
import { AuthGuard } from "./components/auth-guard";
import { AppSidebarLayout } from "./components/app-sidebar";
export default function AppShell() { return <AuthGuard><AppSidebarLayout><Outlet /></AppSidebarLayout></AuthGuard>; }
