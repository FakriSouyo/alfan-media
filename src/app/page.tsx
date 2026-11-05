import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
export default function Home() { const {user,loading}=useAuth();return loading?null:<Navigate to={user?"/agent":"/login"} replace />; }
