import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, UserCheck, Users, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type AttendeeType = "rotarian" | "rotaractor" | "guest";

export interface AttendeeHolder {
  name: string;
  email: string;
  attendee_type: AttendeeType;
  rotary_club?: string;
  member_id?: string;
}

export interface TierLine {
  tier_id: string;
  tier_name: string;
  quantity: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultBuyerName: string;
  defaultBuyerEmail: string;
  lines: TierLine[];
  onSubmit: (data: {
    items: { tier_id: string; holders: AttendeeHolder[] }[];
    buyer_name: string;
    buyer_email: string;
  }) => Promise<void> | void;
}

type NamingMode = "individual" | "group";

const blank = (buyer = "", email = ""): AttendeeHolder => ({
  name: buyer, email, attendee_type: "guest",
});

const AttendeeInfoDialog = ({ open, onOpenChange, defaultBuyerName, defaultBuyerEmail, lines, onSubmit }: Props) => {
  const totalQty = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);
  const [step, setStep] = useState<"mode" | "details">("mode");
  const [mode, setMode] = useState<NamingMode>("individual");
  const [holders, setHolders] = useState<AttendeeHolder[]>([]);
  const [groupHolder, setGroupHolder] = useState<AttendeeHolder>(blank(defaultBuyerName, defaultBuyerEmail));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setError("");
      setSubmitting(false);
      setStep(totalQty > 1 ? "mode" : "details");
      setMode("individual");
      setHolders(Array.from({ length: totalQty }, () => blank("", defaultBuyerEmail)));
      setGroupHolder(blank(defaultBuyerName, defaultBuyerEmail));
    }
  }, [open, totalQty, defaultBuyerName, defaultBuyerEmail]);

  const updateHolder = (i: number, patch: Partial<AttendeeHolder>) => {
    setHolders((prev) => prev.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));
  };
  const updateGroup = (patch: Partial<AttendeeHolder>) => setGroupHolder((g) => ({ ...g, ...patch }));

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const proceed = async () => {
    setError("");
    const list = mode === "group"
      ? Array.from({ length: totalQty }, (_, i) => ({
          ...groupHolder,
          name: `${groupHolder.name.trim()} #${i + 1}`,
        }))
      : holders;

    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      const label = `Ticket ${i + 1}`;
      if (!h.name?.trim()) return setError(`${label}: full name is required`);
      if (h.name.trim().length < 2) return setError(`${label}: name looks too short`);
      if (!h.email?.trim()) return setError(`${label}: email is required`);
      if (!EMAIL_RE.test(h.email.trim())) return setError(`${label}: email format is invalid`);
      if (h.attendee_type === "rotarian" && !h.rotary_club?.trim())
        return setError(`${label}: Rotary club is required for Rotarians`);
      if (h.attendee_type === "rotaractor") {
        if (!h.member_id?.trim() || !h.rotary_club?.trim())
          return setError(`${label}: please pick your Rotaractor record from the directory (Member ID + club required)`);
      }
    }

    // Build items per tier
    let cursor = 0;
    const items = lines.map((l) => {
      const slice = list.slice(cursor, cursor + l.quantity);
      cursor += l.quantity;
      return { tier_id: l.tier_id, holders: slice };
    });

    try {
      setSubmitting(true);
      await onSubmit({
        items,
        buyer_name: mode === "group" ? groupHolder.name.trim() : list[0].name,
        buyer_email: mode === "group" ? groupHolder.email.trim() : list[0].email,
      });
    } catch (e: any) {
      setError(e.message || "Failed to continue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5 text-primary" />Attendee details</DialogTitle>
          <DialogDescription>
            Rotaract D9213 requires attendee classification for every ticket. This helps us verify members and welcome guests.
          </DialogDescription>
        </DialogHeader>

        {step === "mode" && totalQty > 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">You're buying {totalQty} tickets. How would you like to name them?</p>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as NamingMode)} className="space-y-2">
              <Label className={`border rounded-lg p-4 cursor-pointer flex items-start gap-3 ${mode==="individual"?"border-primary bg-primary/5":"border-border"}`}>
                <RadioGroupItem value="individual" className="mt-1" />
                <div>
                  <p className="font-medium flex items-center gap-2"><Users className="h-4 w-4" />Name each ticket</p>
                  <p className="text-xs text-muted-foreground">Add a distinct attendee for every ticket (recommended).</p>
                </div>
              </Label>
              <Label className={`border rounded-lg p-4 cursor-pointer flex items-start gap-3 ${mode==="group"?"border-primary bg-primary/5":"border-border"}`}>
                <RadioGroupItem value="group" className="mt-1" />
                <div>
                  <p className="font-medium">One name for all (numbered)</p>
                  <p className="text-xs text-muted-foreground">All tickets carry your name with #1, #2, #3 suffixes.</p>
                </div>
              </Label>
            </RadioGroup>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => setStep("details")}>Continue</Button>
            </DialogFooter>
          </div>
        )}

        {step === "details" && (
          <div className="space-y-4">
            {mode === "group" ? (
              <HolderForm
                title="Lead attendee (applied to all tickets)"
                holder={groupHolder}
                onChange={updateGroup}
              />
            ) : (
              holders.map((h, i) => (
                <HolderForm
                  key={i}
                  title={`Ticket ${i + 1}${lines.length > 1 ? ` — ${tierNameForIndex(lines, i)}` : ""}`}
                  holder={h}
                  onChange={(p) => updateHolder(i, p)}
                />
              ))
            )}
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="h-4 w-4" />{error}</p>
            )}
            <DialogFooter>
              {totalQty > 1 && <Button variant="outline" onClick={() => setStep("mode")} disabled={submitting}>Back</Button>}
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={proceed} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue to payment"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

function tierNameForIndex(lines: TierLine[], i: number) {
  let c = 0;
  for (const l of lines) { if (i < c + l.quantity) return l.tier_name; c += l.quantity; }
  return "";
}

function HolderForm({ title, holder, onChange }: { title: string; holder: AttendeeHolder; onChange: (p: Partial<AttendeeHolder>) => void }) {
  const [lookup, setLookup] = useState("");
  const [results, setResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [touched, setTouched] = useState(false);

  // Debounced Rotaractor lookup
  useEffect(() => {
    if (holder.attendee_type !== "rotaractor") { setResults(null); return; }
    const q = lookup.trim();
    if (q.length < 2) { setResults(null); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("lookup_rotaract_member", { _query: q });
      setSearching(false);
      if (!error) setResults(data || []);
    }, 350);
    return () => { clearTimeout(t); setSearching(false); };
  }, [lookup, holder.attendee_type]);

  const pickResult = (m: any) => {
    onChange({
      name: m.full_name,
      email: m.email || holder.email || "",
      rotary_club: m.club_name,
      member_id: m.member_id,
    });
    setResults(null);
    setLookup(m.full_name);
    setTouched(false);
  };

  const emailValid = !holder.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(holder.email);

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <p className="text-sm font-semibold">{title}</p>

      <div>
        <Label className="text-xs">I am a…</Label>
        <RadioGroup
          value={holder.attendee_type}
          onValueChange={(v) => { onChange({ attendee_type: v as AttendeeType, rotary_club: "", member_id: "" }); setLookup(""); setResults(null); }}
          className="grid grid-cols-3 gap-2 mt-1"
        >
          {[
            { v: "rotarian", l: "Rotarian" },
            { v: "rotaractor", l: "Rotaractor" },
            { v: "guest", l: "Guest" },
          ].map((opt) => (
            <Label
              key={opt.v}
              className={`border rounded-md py-2 text-center text-sm cursor-pointer ${holder.attendee_type === opt.v ? "border-primary bg-primary/5 font-medium" : "border-border"}`}
            >
              <RadioGroupItem value={opt.v} className="sr-only" />
              {opt.l}
            </Label>
          ))}
        </RadioGroup>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Full name *</Label>
          <Input value={holder.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Jane Doe" />
        </div>
        <div>
          <Label className="text-xs">Email *</Label>
          <Input
            type="email"
            value={holder.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="jane@example.com"
            aria-invalid={!emailValid}
            className={!emailValid ? "border-destructive" : ""}
          />
          {!emailValid && <p className="text-[10px] text-destructive mt-1">Enter a valid email address</p>}
        </div>
      </div>

      {holder.attendee_type === "rotarian" && (
        <div>
          <Label className="text-xs">Rotary club *</Label>
          <Input
            value={holder.rotary_club || ""}
            onChange={(e) => onChange({ rotary_club: e.target.value })}
            placeholder="e.g. Rotary Club of Kampala"
          />
        </div>
      )}

      {holder.attendee_type === "rotaractor" && (
        <div className="space-y-2">
          <Label className="text-xs">Find your record — type your email, name, or Member ID</Label>
          <div className="relative">
            <Input
              value={lookup}
              onChange={(e) => { setLookup(e.target.value); setTouched(true); }}
              placeholder="Start typing (min. 2 characters)…"
            />
            {searching && <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-2.5 text-muted-foreground" />}
          </div>

          {results && results.length > 0 && (
            <div className="border rounded-md divide-y max-h-44 overflow-y-auto">
              {results.map((m) => (
                <button
                  key={m.member_id}
                  type="button"
                  onClick={() => pickResult(m)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 text-xs"
                >
                  <p className="font-medium text-sm">{m.full_name}</p>
                  <p className="text-muted-foreground">{m.club_name} · ID {m.member_id}</p>
                </button>
              ))}
            </div>
          )}

          {touched && !searching && results && results.length === 0 && lookup.trim().length >= 2 && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              No matching Rotaractor found in District 9213. Double-check spelling or your Member ID.
            </p>
          )}

          {holder.member_id ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="secondary">Club: {holder.rotary_club}</Badge>
              <Badge variant="secondary">Member ID: {holder.member_id}</Badge>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              You must select a record from the directory to continue as a Rotaractor.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default AttendeeInfoDialog;
