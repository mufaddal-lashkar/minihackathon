"use client";

import { useEffect, useRef, useState } from "react";
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

  async function submit(raw: string, modality: "free_text" | "voice" = "free_text") {
    if (!raw.trim()) return;
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ patientId, rawText: raw, modality }) });
    setResult(await res.json());
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
    if (!Ctor) return alert("Voice input is not supported in this browser.");
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
        <div className="fixed inset-x-0 bottom-0 p-4 bg-gradient-to-t from-[#f4fbfa] via-[#f4fbfa] to-transparent">
          <button onClick={() => setOpen(true)} className="mx-auto block w-full max-w-md rounded-2xl bg-teal-700 py-4 text-white text-lg font-semibold shadow-lg hover:bg-teal-800 transition">
            Something feels off?
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-20 flex items-end sm:items-center justify-center bg-teal-950/40 p-0 sm:p-4" onClick={() => !busy && setOpen(false)}>
          <div className="rise w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-5 shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Tell us what you notice</h2>
              <button onClick={() => setOpen(false)} className="text-teal-900/50 text-xl">×</button>
            </div>

            {!result && !busy && (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(CHIPS[procedureCode] ?? CHIPS.appendectomy).map((c) => (
                    <button key={c} onClick={() => { setText(c); void submit(c); }} className="rounded-full bg-teal-50 px-3 py-1.5 text-sm text-teal-900 ring-1 ring-teal-200 hover:bg-teal-100">
                      {c}
                    </button>
                  ))}
                </div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Or describe it in your own words…"
                  rows={3}
                  className="mt-4 w-full rounded-xl border border-teal-200 p-3 text-base focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <div className="mt-3 flex gap-2">
                  <button onClick={() => submit(text)} disabled={!text.trim()} className="flex-1 rounded-xl bg-teal-700 py-3 text-white font-semibold disabled:opacity-40">Check now</button>
                  <button onClick={toggleVoice} className={`rounded-xl px-4 py-3 font-semibold ring-1 ${listening ? "bg-red-50 text-red-700 ring-red-300" : "bg-white text-teal-800 ring-teal-300"}`}>
                    {listening ? "● Listening…" : "🎤 Speak"}
                  </button>
                </div>
              </>
            )}

            {busy && (
              <div className="py-10 text-center">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-teal-200 border-t-teal-700" />
                <p className="mt-4 text-sm text-teal-900/70">Checking your report against your recovery plan…</p>
              </div>
            )}

            {result && <ResultCard r={result} onReset={() => { setResult(null); setText(""); }} />}
          </div>
        </div>
      )}
    </>
  );
}

function ResultCard({ r, onReset }: { r: Result; onReset: () => void }) {
  if (r.error) return <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-900">Something went wrong: {r.error}. Please call your clinic.</div>;

  if (r.status === "pending_review") {
    return (
      <div className="mt-4 rise rounded-2xl bg-sky-50 p-5 ring-1 ring-sky-200">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
          <div>
            <div className="font-semibold text-sky-900">A nurse is checking this</div>
            <div className="text-sm text-sky-900/70">We think this is probably okay, but we never reassure without a nurse’s eyes. Usually a few minutes.</div>
          </div>
        </div>
        <div className="mt-4 text-xs text-sky-900/60">Your words: “{r.rawText}”</div>
        <div className="mt-3 text-xs text-sky-900/60">If anything gets worse while you wait, call your clinic.</div>
      </div>
    );
  }

  const sev = r.severity!;
  const m = SEVERITY_META[sev];
  const escalated = sev === "URGENT_CARE" || sev === "EMERGENCY";
  return (
    <div className={`mt-4 rise rounded-2xl p-5 ring-2 ${m.bg} ${m.ring} ${m.text}`}>
      <div className={`flex h-12 w-12 items-center justify-center rounded-full text-white text-xl font-bold ${m.badge} ${sev === "EMERGENCY" ? "pulse-ring" : ""}`}>{m.icon}</div>
      <h3 className="mt-3 text-xl font-bold">{m.label}</h3>
      <p className="mt-1 text-sm opacity-80">{m.action}</p>
      <p className="mt-3 text-base leading-relaxed">{r.explanation}</p>
      {r.humanDecision && <p className="mt-2 text-xs opacity-70">Reviewed by a nurse{r.humanDecision.reason ? ` — “${r.humanDecision.reason}”` : ""}.</p>}
      {escalated && (
        <a href={sev === "EMERGENCY" ? "tel:112" : "tel:+10000000000"} className={`mt-4 block rounded-xl py-3 text-center text-white font-semibold ${m.badge}`}>
          {sev === "EMERGENCY" ? "Call emergency services" : "Call the clinic now"}
        </a>
      )}
      <details className="mt-4 text-xs opacity-80">
        <summary className="cursor-pointer">Why this answer?</summary>
        <div className="mt-2 space-y-1">
          <div>Rule <code className="rounded bg-white/60 px-1">{r.winningRuleId ?? "default"}</code> (class {r.winningRuleClass ?? "4"}): {r.rationale}</div>
          <div>Findings: {r.findings.map((f) => `${f.symptomCode}${f.sourceSpan ? ` (“${f.sourceSpan}”)` : ""}`).join(", ") || "none"}</div>
          <div>Extraction: {r.usedLlm ? "Gemini" : "keyword stub"} · confidence {Math.round(r.extractionConfidence * 100)}%</div>
        </div>
      </details>
      <div className="mt-4 flex items-center justify-between">
        <SeverityBadge severity={sev} small />
        <button onClick={onReset} className="text-sm underline opacity-70">Report something else</button>
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
