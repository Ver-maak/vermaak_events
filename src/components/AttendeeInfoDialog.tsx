import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserCheck, Users, AlertCircle, Lock, CheckCircle2 } from "lucide-react";
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
type Step = "buyer" | "mode" | "details";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const blank = (buyer = "", email = ""): AttendeeHolder => ({
  name: buyer, email, attendee_type: "guest",
});

// Single source of truth for "is this holder valid to proceed?"
function isHolderValid(h: AttendeeHolder): boolean {
  if (!h.name?.trim() || h.name.trim().length < 2) return false;
  if (!h.email?.trim() || !EMAIL_RE.test(h.email.trim())) return false;
  if (h.attendee_type === "rotarian" && !h.rotary_club?.trim()) return false;
  if (h.attendee_type === "rotaractor" && (!h.member_id?.trim() || !h.rotary_club?.trim())) return false;
  return true;
}

function holderError(h: AttendeeHolder, label: string): string | null {
  if (!h.name?.trim()) return `${label}: full name is required`;
  if (h.name.trim().length < 2) return `${label}: name looks too short`;
  if (!h.email?.trim()) return `${label}: email is required`;
  if (!EMAIL_RE.test(h.email.trim())) return `${label}: email format is invalid`;
  if (h.attendee_type === "rotarian" && !h.rotary_club?.trim())
    return `${label}: Rotary club is required for Rotarians`;
  if (h.attendee_type === "rotaractor" && (!h.member_id?.trim() || !h.rotary_club?.trim()))
    return `${label}: please select your Rotaractor record from the directory`;
  return null;
}

const AttendeeInfoDialog = ({ open, onOpenChange, defaultBuyerName, defaultBuyerEmail, lines, onSubmit }: Props) => {
  const totalQty = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);
  const [step, setStep] = useState<Step>("buyer");
  const [buyer, setBuyer] = useState<AttendeeHolder>(blank(defaultBuyerName, defaultBuyerEmail));
  const [mode, setMode] = useState<NamingMode>("individual");
  const [ticketNames, setTicketNames] = useState<string[]>([]);
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setError("");
      setSubmitting(false);
      setStep("buyer");
      setMode("individual");
      setBuyer(blank(defaultBuyerName, defaultBuyerEmail));
      setTicketNames([]);
      setContactEmail(defaultBuyerEmail || "");
    }
  }, [open, defaultBuyerName, defaultBuyerEmail]);

  const buyerValid = isHolderValid(buyer);
  const namesValid =
    ticketNames.length === totalQty &&
    ticketNames.every((n) => n.trim().length >= 2) &&
    EMAIL_RE.test(contactEmail.trim());

  const buildHolders = (names: string[], email: string): AttendeeHolder[] =>
    names.map((n) => ({
      name: n.trim(),
      email: email.trim(),
      attendee_type: buyer.attendee_type,
      rotary_club: buyer.rotary_club,
      member_id: buyer.member_id,
    }));

  const goFromBuyer = () => {
    setError("");
    const err = holderError(buyer, "Your details");
    if (err) return setError(err);
    if (!contactEmail) setContactEmail(buyer.email);
    if (totalQty <= 1) {
      return finalize(buildHolders([buyer.name], buyer.email), buyer.name, buyer.email);
    }
    setStep("mode");
  };

  const goFromMode = () => {
    setError("");
    const email = (contactEmail || buyer.email).trim();
    if (mode === "group") {
      const names = Array.from({ length: totalQty }, (_, i) => `${buyer.name.trim()} #${i + 1}`);
      return finalize(buildHolders(names, email), buyer.name.trim(), email);
    }
    setTicketNames([buyer.name.trim(), ...Array.from({ length: totalQty - 1 }, () => "")]);
    setContactEmail(email);
    setStep("details");
  };

  const updateName = (i: number, v: string) => {
    setTicketNames((prev) => prev.map((n, idx) => (idx === i ? v : n)));
  };

  const submitDetails = () => {
    setError("");
    for (let i = 0; i < ticketNames.length; i++) {
      if (ticketNames[i].trim().length < 2) return setError(`Ticket ${i + 1}: name is required`);
    }
    if (!EMAIL_RE.test(contactEmail.trim())) return setError("Enter a valid email address to receive the tickets");
    const email = contactEmail.trim();
    finalize(buildHolders(ticketNames, email), buyer.name.trim(), email);
  };

  const finalize = async (
    list: AttendeeHolder[],
    buyerName = list[0].name,
    buyerEmail = list[0].email,
  ) => {
    let cursor = 0;
    const items = lines.map((l) => {
      const slice = list.slice(cursor, cursor + l.quantity);
      cursor += l.quantity;
      return { tier_id: l.tier_id, holders: slice };
    });
    try {
      setSubmitting(true);
      await onSubmit({ items, buyer_name: buyerName, buyer_email: buyerEmail });
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
            Rotaract D9213 requires attendee classification. We'll start with you, then handle the {totalQty > 1 ? "remaining tickets" : "ticket"}.
          </DialogDescription>
        </DialogHeader>

        {step === "buyer" && (
          <div className="space-y-4">
            <HolderForm title="Tell us about you" holder={buyer} onChange={(p) => setBuyer((b) => ({ ...b, ...p }))} />
            {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="h-4 w-4" />{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={goFromBuyer} disabled={!buyerValid}>
                {totalQty > 1 ? "Continue" : "Continue to payment"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "mode" && (
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
            {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="h-4 w-4" />{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("buyer")} disabled={submitting}>Back</Button>
              <Button onClick={goFromMode} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (mode === "group" ? "Continue to payment" : "Continue")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "details" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Ticket 1 is set to you. Add the remaining {totalQty - 1} attendee{totalQty - 1 > 1 ? "s" : ""}.</p>
            {holders.map((h, i) => (
              <HolderForm
                key={i}
                title={`Ticket ${i + 1}${lines.length > 1 ? ` — ${tierNameForIndex(lines, i)}` : ""}${i === 0 ? " (you)" : ""}`}
                holder={h}
                onChange={(p) => updateHolder(i, p)}
              />
            ))}
            {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="h-4 w-4" />{error}</p>}
            {!allHoldersValid && !error && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Complete every ticket's required fields to continue.
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("mode")} disabled={submitting}>Back</Button>
              <Button onClick={submitDetails} disabled={submitting || !allHoldersValid}>
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
  const [lookup, setLookup] = useState(holder.attendee_type === "rotaractor" ? holder.name : "");
  const [results, setResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [touched, setTouched] = useState(false);

  const locked = holder.attendee_type === "rotaractor" && !!holder.member_id;

  // Debounced Rotaractor lookup by full name (skip while locked)
  useEffect(() => {
    if (holder.attendee_type !== "rotaractor" || locked) { setResults(null); return; }
    const q = lookup.trim();
    if (q.length < 2) { setResults(null); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("lookup_rotaract_member", { _query: q });
      setSearching(false);
      if (error) { setResults([]); return; }
      const list = data || [];
      setResults(list);
      // Auto-pick on a single exact case-insensitive full-name match
      const exact = list.filter((m: any) => m.full_name?.toLowerCase() === q.toLowerCase());
      if (exact.length === 1) {
        pickResultInternal(exact[0]);
      }
    }, 350);
    return () => { clearTimeout(t); setSearching(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup, holder.attendee_type, locked]);

  const pickResultInternal = (m: any) => {
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

  const unlock = () => {
    onChange({ member_id: "", rotary_club: "" });
    setLookup(holder.name || "");
    setResults(null);
  };

  const emailValid = !holder.email || EMAIL_RE.test(holder.email);
  const exactMultiple =
    !!results && results.length > 1 &&
    results.filter((m: any) => m.full_name?.toLowerCase() === lookup.trim().toLowerCase()).length > 1;

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <p className="text-sm font-semibold">{title}</p>

      <div>
        <Label className="text-xs">I am a…</Label>
        <RadioGroup
          value={holder.attendee_type}
          onValueChange={(v) => {
            onChange({ attendee_type: v as AttendeeType, rotary_club: "", member_id: "" });
            setLookup("");
            setResults(null);
          }}
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

      {holder.attendee_type === "rotaractor" ? (
        <div className="space-y-2">
          <Label className="text-xs">Full name * — search the District 9213 directory</Label>
          <div className="relative">
            <Input
              value={locked ? holder.name : lookup}
              onChange={(e) => { setLookup(e.target.value); setTouched(true); }}
              placeholder="Type your full name exactly as registered…"
              readOnly={locked}
              className={locked ? "bg-muted/50 cursor-not-allowed pr-10" : ""}
            />
            {searching && <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-2.5 text-muted-foreground" />}
            {locked && <CheckCircle2 className="h-4 w-4 absolute right-3 top-2.5 text-primary" />}
          </div>

          {!locked && results && results.length > 0 && (
            <div className="space-y-1">
              {exactMultiple && (
                <p className="text-[11px] font-medium text-foreground">
                  Multiple Rotaractors share this name — please pick yours:
                </p>
              )}
              <div className="border rounded-md divide-y max-h-44 overflow-y-auto">
                {results.map((m) => (
                  <button
                    key={m.member_id}
                    type="button"
                    onClick={() => pickResultInternal(m)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 text-xs"
                  >
                    <p className="font-medium text-sm">{m.full_name}</p>
                    <p className="text-muted-foreground">{m.club_name} · ID {m.member_id}{m.email ? ` · ${m.email}` : ""}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!locked && touched && !searching && results && results.length === 0 && lookup.trim().length >= 2 && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              No matching Rotaractor found in District 9213. Check the spelling of your full name.
            </p>
          )}

          {locked && (
            <>
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-primary">
                  <Lock className="h-3.5 w-3.5" />
                  Verified from District 9213 directory — locked
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Club: {holder.rotary_club}</Badge>
                  <Badge variant="secondary">Member ID: {holder.member_id}</Badge>
                </div>
                <button
                  type="button"
                  onClick={unlock}
                  className="text-[11px] text-primary underline-offset-2 hover:underline"
                >
                  Not you? Change selection
                </button>
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
            </>
          )}

          {!locked && (
            <p className="text-[10px] text-muted-foreground">
              You must select your record from the directory before you can continue as a Rotaractor.
            </p>
          )}
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

export default AttendeeInfoDialog;
