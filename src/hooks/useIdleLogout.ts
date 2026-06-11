import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const IDLE_MS = 5 * 60 * 1000; // 5 minutes
const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "visibilitychange",
];

/**
 * Signs the user out after 5 minutes of inactivity. Only armed while a
 * session exists.
 */
export const useIdleLogout = (enabled: boolean) => {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const reset = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(async () => {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        await supabase.auth.signOut();
        toast({
          title: "Signed out",
          description: "You were logged out after 5 minutes of inactivity. Please sign in again.",
        });
      }, IDLE_MS);
    };

    ACTIVITY_EVENTS.forEach((ev) => document.addEventListener(ev, reset, { passive: true }));
    reset();

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => document.removeEventListener(ev, reset));
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [enabled]);
};
