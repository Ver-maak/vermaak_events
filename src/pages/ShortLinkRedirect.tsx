import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const ShortLinkRedirect = () => {
  const { slug } = useParams<{ slug: string }>();
  const [status, setStatus] = useState<"loading" | "notfound">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) return;
      const { data } = await (supabase as any)
        .from("short_links")
        .select("target_url")
        .eq("slug", slug)
        .maybeSingle();
      if (cancelled) return;
      if (data?.target_url) {
        // Fire-and-forget click tracking
        (supabase as any).rpc("increment_short_link_click", { _slug: slug });
        window.location.replace(data.target_url);
      } else {
        setStatus("notfound");
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Redirecting…</p>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">Link not found</h1>
      <p className="text-muted-foreground">This short link doesn't exist or has been removed.</p>
      <Link to="/events"><Button>Browse events</Button></Link>
    </div>
  );
};

export default ShortLinkRedirect;
