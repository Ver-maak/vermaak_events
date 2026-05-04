import { useEffect, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, QrCode, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Html5Qrcode } from "html5-qrcode";

type Result = { ok: boolean; msg: string; ts: number };

const CheckIn = () => {
  const [code, setCode] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ code: string; t: number }>({ code: "", t: 0 });

  const submit = async (codeToCheck: string) => {
    if (!codeToCheck) return;
    const { data, error } = await supabase.rpc("checkin_ticket", { _code: codeToCheck });
    if (error) {
      setResults((r) => [{ ok: false, msg: error.message, ts: Date.now() }, ...r].slice(0, 20));
      return;
    }
    const d = data as any;
    setResults((r) => [{ ok: !!d?.ok, msg: d?.ok ? `✓ ${d.holder} — ${d.event}` : `✗ ${d.error}${d.holder ? " (" + d.holder + ")" : ""}`, ts: Date.now() }, ...r].slice(0, 20));
  };

  const startScan = async () => {
    setScanning(true);
    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 },
        (decoded) => {
          const now = Date.now();
          if (lastScanRef.current.code === decoded && now - lastScanRef.current.t < 3000) return;
          lastScanRef.current = { code: decoded, t: now };
          submit(decoded);
        }, () => {});
    } catch (e: any) {
      setScanning(false);
      setResults((r) => [{ ok: false, msg: "Camera error: " + e.message, ts: Date.now() }, ...r]);
    }
  };

  const stopScan = async () => {
    try { await scannerRef.current?.stop(); await scannerRef.current?.clear(); } catch {}
    scannerRef.current = null; setScanning(false);
  };

  useEffect(() => () => { stopScan(); }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Check‑in</h1>
          <p className="text-muted-foreground">Scan ticket QR codes or enter codes manually</p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><QrCode className="h-4 w-4" />Scanner</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div id="qr-reader" className={`w-full max-w-md mx-auto rounded-lg overflow-hidden ${scanning ? "" : "hidden"}`} />
            {!scanning ? <Button onClick={startScan} className="gap-2"><Camera className="h-4 w-4" />Start camera</Button>
              : <Button variant="outline" onClick={stopScan}>Stop scanner</Button>}
            <div className="flex gap-2 pt-2">
              <Input placeholder="Enter ticket code (TKT-…)" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { submit(code); setCode(""); } }} className="font-mono" />
              <Button onClick={() => { submit(code); setCode(""); }}>Check in</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent</CardTitle></CardHeader>
          <CardContent>
            {results.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No scans yet</p> :
              <div className="space-y-2">
                {results.map((r, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${r.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                    {r.ok ? <CheckCircle2 className="h-5 w-5 flex-shrink-0" /> : <XCircle className="h-5 w-5 flex-shrink-0" />}
                    <p className="text-sm flex-1">{r.msg}</p>
                    <span className="text-xs opacity-70">{new Date(r.ts).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default CheckIn;
