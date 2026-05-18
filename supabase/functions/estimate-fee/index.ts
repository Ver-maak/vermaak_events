import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { amount, currency, organization_id, context } = await req.json();
    if (!amount || !currency) {
      return json({ error: "amount and currency are required" }, 400);
    }

    const auth = req.headers.get("Authorization") || "";
    const isAuthed = auth.startsWith("Bearer ") && !auth.endsWith(Deno.env.get("SUPABASE_ANON_KEY") || "___");

    // Use the user's JWT (so auth.uid() resolves inside estimate_and_log), otherwise service role for anon estimate.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      isAuthed ? Deno.env.get("SUPABASE_ANON_KEY")! : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      isAuthed ? { global: { headers: { Authorization: auth } } } : {}
    );

    const rpcName = isAuthed ? "estimate_and_log" : "calculate_transaction_fee";
    const args: Record<string, unknown> = {
      _amount: amount,
      _currency: currency,
      _organization_id: organization_id || null,
    };
    if (isAuthed) args._context = context || "estimate";

    const { data, error } = await supabase.rpc(rpcName, args);
    if (error) throw error;

    return json(data);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
