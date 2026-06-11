import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "es:last-route";

export const RouteMemory = () => {
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname + location.search + location.hash;
    // Don't remember auth/landing/404 destinations
    if (
      path === "/" ||
      path.startsWith("/auth") ||
      path.startsWith("/forgot-password") ||
      path.startsWith("/reset-password") ||
      path.startsWith("/change-password")
    ) return;
    try { sessionStorage.setItem(STORAGE_KEY, path); } catch {}
  }, [location]);
  return null;
};

export const getLastRoute = (): string | null => {
  try { return sessionStorage.getItem(STORAGE_KEY); } catch { return null; }
};
