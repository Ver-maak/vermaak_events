import { useLocation, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getLastRoute } from "@/components/RouteMemory";

const NotFound = () => {
  const location = useLocation();
  const [redirectTo] = useState<string | null>(() => {
    const last = getLastRoute();
    return last && last !== location.pathname + location.search ? last : null;
  });

  useEffect(() => {
    if (!redirectTo) {
      console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    }
  }, [location.pathname, redirectTo]);

  if (redirectTo) return <Navigate to={redirectTo} replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
