import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const KEY = "es:post-login-redirect";

/**
 * When a user returns from a magic sign-in link, Supabase may land them on the
 * configured Site URL (e.g. /dashboard) instead of the page they came from.
 * Before sending the link we stash the originating path; when a SIGNED_IN
 * event fires we send the user back there.
 */
export const PostLoginRedirect = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const handled = useRef(false);

  useEffect(() => {
    const consume = () => {
      const target = sessionStorage.getItem(KEY) || localStorage.getItem(KEY);
      if (!target) return;
      sessionStorage.removeItem(KEY);
      localStorage.removeItem(KEY);
      const current = location.pathname + location.search + location.hash;
      if (target && target !== current) {
        navigate(target, { replace: true });
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" && !handled.current) {
        handled.current = true;
        // Defer so other listeners (AuthProvider) update state first
        setTimeout(consume, 0);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};
