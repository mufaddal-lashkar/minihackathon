"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircleWarning, Mic, Square, X, Phone, ChevronDown, RotateCcw, UserCheck, Loader2 } from "lucide-react";
import type { ReportRecord } from "@/lib/db/store";
import { SEVERITY_META, SeverityBadge } from "./severity";

const CHIPS: Record<string, string[]> = {
  appendectomy: ["My wound looks a bit red", "Some clear fluid on the dressing", "Mild pain around the cut", "I feel a bit tired", "I have a fever of 38.5", "My calf is sore and swollen"],
  "knee-replacement": ["My knee is swollen", "Hard to bend my knee", "Wound is leaking fluid", "My calf is sore and puffy", "I feel confused today", "Short of breath"],
  "c-section": ["Bleeding is heavier with clots", "My incision is red", "Mild pain at the incision", "Breasts feel engorged", "I have chest pain", "My wound has opened up"],
};

type Result = ReportRecord & { status: string; error?: string };

export function TriageSheet({ patientId, procedureCode }: { patientId: string; procedureCode: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, busy]);

  async function submit(raw: string, modality: "free_text" | "voice" = "free_text") {
    if (!raw.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ patientId, rawText: raw, modality }) });
      setResult(await res.json());
    } catch {
      setResult({ error: "network" } as Result);
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!result || result.status !== "pending_review") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/reports/${result.id}`).then((x) => x.json());
      if (r.status === "complete") setResult(r);
    }, 2000);
    return () => clearInterval(t);
  }, [result]);

  function toggleVoice() {
    const w = window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike; SpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return alert("Voice input is not supported in this browser. Please type instead.");
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.onresult = (e) => { const t = e.results[0][0].transcript; setText(t); setListening(false); void submit(t, "voice"); };
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }

  return (
    <>
      {!open && (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background via-background to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
          <button onClick={() => setOpen(true)} className="press mx-auto flex min-h-14 w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-semibold text-on-primary shadow-lg shadow-primary/25 transition-colors hover:bg-primary-hover">
            <MessageCircleWarning size={22} aria-hidden /> Something feels off?
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => !busy && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="sheet-title" className="sheet-up flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-4">
              <h2 id="sheet-title" className="text-lg font-bold">{result ? "Your answer" : "Tell us what you notice"}</h2>
              <button onClick={() => !busy && setOpen(false)} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-muted-fg hover:bg-muted"><X size={20} aria-hidden /></button>
            </div>

            <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {!result && !busy && (
                <>
                  <p className="mt-1 text-sm text-muted-fg">Tap a common one, type, or speak. We check it against your recovery plan for today.</p>
                  <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Common symptoms">
                    {(CHIPS[procedureCode] ?? CHIPS.appendectomy).map((c) => (
                      <button key={c} onClick={() => { setText(c); void submit(c); }} className="press min-h-11 rounded-full bg-muted px-4 text-sm font-medium text-foreground ring-1 ring-border transition-colors hover:bg-border/60">
                        {c}
                      </button>
                    ))}
                  </div>
                  <label htmlFor="symptom-text" className="mt-5 block text-sm font-semibold">In your own words</label>
                  <textarea
                    id="symptom-text"
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="e.g. the redness around my cut is spreading"
                    rows={3}
                    className="mt-1.5 w-full resize-none rounded-xl border border-border bg-surface p-3 text-base focus:border-primary"
                  />
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => submit(text)} disabled={!text.trim()} className="press min-h-12 flex-1 rounded-xl bg-primary font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40">Check now</button>
                    <button onClick={toggleVoice} aria-pressed={listening} className={`press inline-flex min-h-12 items-center gap-2 rounded-xl px-4 font-semibold ring-1 transition-colors ${listening ? "bg-red-50 text-red-800 ring-red-300" : "bg-surface text-primary ring-border hover:bg-muted"}`}>
                      {listening ? <><Square size={16} aria-hidden /> Stop</> : <><Mic size={18} aria-hidden /> Speak</>}
                    </button>
                  </div>
                </>
              )}

              {busy && (
                <div className="py-10 text-center" role="status" aria-live="polite">
                  <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" aria-hidden />
                  <p className="mt-4 text-sm text-muted-fg">Checking against your day-by-day plan…</p>
                </div>
              )}

              {result && <ResultCard r={result} onReset={() => { setResult(null); setText(""); }} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ResultCard({ r, onReset }: { r: Result; onReset: () => void }) {
  if (r.error) {
    return (
      <div role="alert" className="mt-3 rounded-2xl bg-red-50 p-4 text-sm text-red-950 ring-1 ring-red-200">
        <p className="font-semibold">We couldn’t check this right now.</p>
        <p className="mt-1">Please call your clinic directly. You can also <button onClick={onReset} className="underline">try again</button>.</p>
      </div>
    );
  }

  if (r.status === "pending_review") {
    return (
      <div className="rise mt-3 rounded-2xl bg-sky-50 p-5 ring-1 ring-sky-200" role="status" aria-live="polite">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white"><UserCheck size={22} aria-hidden /></span>
          <div>
            <h3 className="font-semibold text-sky-950">A nurse is checking this</h3>
            <p className="mt-1 text-sm text-sky-950/80">This looks like it may be okay, but we never reassure without a nurse’s eyes. Usually a few minutes — this screen updates by itself.</p>
          </div>
        </div>
        <p className="mt-4 rounded-xl bg-white/70 p-3 text-sm text-sky-950/80">You said: “{r.rawText}”</p>
        <p className="mt-3 text-xs text-sky-950/70">If anything gets worse while you wait, call your clinic.</p>
      </div>
    );
  }

  const sev = r.severity!;
  const m = SEVERITY_META[sev];
  const escalated = sev === "URGENT_CARE" || sev === "EMERGENCY";
  return (
    <div className={`rise mt-3 rounded-2xl p-5 ring-2 ${m.bg} ${m.ring} ${m.text}`} role="status" aria-live="assertive">
      <div className={`flex h-14 w-14 items-center justify-center rounded-full text-white ${m.badge} ${sev === "EMERGENCY" ? "pulse-ring" : ""}`}><m.Icon size={28} aria-hidden /></div>
      <h3 className="mt-3 text-2xl font-bold leading-tight">{m.label}</h3>
      <p className="mt-1 text-sm opacity-80">{m.action}</p>
      <p className="mt-3 text-base leading-relaxed">{r.explanation}</p>
      {r.humanDecision && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-medium"><UserCheck size={14} aria-hidden /> Reviewed by a nurse</p>
      )}
      {escalated && (
        <a href={sev === "EMERGENCY" ? "tel:112" : "tel:+10000000000"} className={`press mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl font-semibold text-white ${m.badge}`}>
          <Phone size={18} aria-hidden /> {sev === "EMERGENCY" ? "Call emergency services" : "Call the clinic now"}
        </a>
      )}
      <details className="group mt-4 text-sm">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium opacity-80"><ChevronDown size={16} className="transition group-open:rotate-180" aria-hidden /> Why this answer?</summary>
        <dl className="mt-1 space-y-1 rounded-xl bg-white/60 p-3 text-xs">
          <div><dt className="inline font-semibold">Rule: </dt><dd className="inline"><code>{r.winningRuleId ?? "default"}</code> (class {r.winningRuleClass ?? "4"}) — {r.rationale}</dd></div>
          <div><dt className="inline font-semibold">Findings: </dt><dd className="inline">{r.findings.map((f) => `${f.symptomCode}${f.sourceSpan ? ` (“${f.sourceSpan}”)` : ""}`).join(", ") || "none"}</dd></div>
          <div><dt className="inline font-semibold">Extraction: </dt><dd className="inline">{r.winningRuleClass === 1 ? "not needed — red flag caught before AI" : r.usedLlm ? "Gemini" : "keyword fallback"} · confidence {Math.round(r.extractionConfidence * 100)}%</dd></div>
        </dl>
      </details>
      <div className="mt-4 flex items-center justify-between">
        <SeverityBadge severity={sev} small />
        <button onClick={onReset} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium underline opacity-80"><RotateCcw size={14} aria-hidden /> Report something else</button>
      </div>
    </div>
  );
}

type SpeechRecognitionLike = {
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
};
