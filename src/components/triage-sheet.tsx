"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircleWarning, Mic, Square, X, Phone, ChevronDown, RotateCcw, UserCheck, Loader2, Bot, Cpu, ShieldCheck } from "lucide-react";
import type { ReportRecord } from "@/lib/db/store";
import { SEVERITY_META, SeverityBadge } from "./severity";
import { ReadAloud } from "./today-tasks";
import { t, bcp47, type Key } from "@/lib/i18n";

const CHIPS: Record<string, string[]> = {
  appendectomy: ["My wound looks a bit red", "Some clear fluid on the dressing", "Mild pain around the cut", "I feel a bit tired", "I have a fever of 38.5", "My calf is sore and swollen"],
  "knee-replacement": ["My knee is swollen", "Hard to bend my knee", "Wound is leaking fluid", "My calf is sore and puffy", "I feel confused today", "Short of breath"],
  "c-section": ["Bleeding is heavier with clots", "My incision is red", "Mild pain at the incision", "Breasts feel engorged", "I have chest pain", "My wound has opened up"],
};
// Chip labels shown in the patient's language; the English phrase is what the engine receives (chips are pre-segmented).
const CHIP_LABELS: Record<string, Record<string, string>> = {
  "My wound looks a bit red": { hi: "मेरा घाव थोड़ा लाल दिखता है", gu: "મારો ઘા થોડો લાલ દેખાય છે" },
  "Some clear fluid on the dressing": { hi: "पट्टी पर थोड़ा साफ़ तरल", gu: "પાટા પર થોડું સ્વચ્છ પ્રવાહી" },
  "Mild pain around the cut": { hi: "चीरे के आसपास हल्का दर्द", gu: "ચીરા આસપાસ હળવો દુખાવો" },
  "I feel a bit tired": { hi: "मुझे थोड़ी थकान है", gu: "મને થોડો થાક લાગે છે" },
  "I have a fever of 38.5": { hi: "मुझे 38.5 बुखार है", gu: "મને 38.5 તાવ છે" },
  "My calf is sore and swollen": { hi: "मेरी पिंडली में दर्द और सूजन है", gu: "મારી પિંડીમાં દુખાવો અને સોજો છે" },
  "My knee is swollen": { hi: "मेरे घुटने में सूजन है", gu: "મારા ઘૂંટણમાં સોજો છે" },
  "Hard to bend my knee": { hi: "घुटना मोड़ना मुश्किल है", gu: "ઘૂંટણ વાળવું મુશ્કેલ છે" },
  "Wound is leaking fluid": { hi: "घाव से तरल निकल रहा है", gu: "ઘામાંથી પ્રવાહી નીકળે છે" },
  "My calf is sore and puffy": { hi: "मेरी पिंडली में दर्द और सूजन है", gu: "મારી પિંડીમાં દુખાવો અને સોજો છે" },
  "I feel confused today": { hi: "आज मुझे भ्रम महसूस हो रहा है", gu: "આજે મને ગૂંચવણ લાગે છે" },
  "Short of breath": { hi: "साँस फूल रही है", gu: "શ્વાસ ચઢે છે" },
  "Bleeding is heavier with clots": { hi: "थक्कों के साथ ज़्यादा खून", gu: "ગઠ્ઠા સાથે વધુ લોહી" },
  "My incision is red": { hi: "मेरा चीरा लाल है", gu: "મારો ચીરો લાલ છે" },
  "Mild pain at the incision": { hi: "चीरे पर हल्का दर्द", gu: "ચીરા પર હળવો દુખાવો" },
  "Breasts feel engorged": { hi: "स्तन भारी लग रहे हैं", gu: "સ્તન ભારે લાગે છે" },
  "I have chest pain": { hi: "मुझे सीने में दर्द है", gu: "મને છાતીમાં દુખાવો છે" },
  "My wound has opened up": { hi: "मेरा घाव खुल गया है", gu: "મારો ઘા ખુલી ગયો છે" },
};

type Result = ReportRecord & { status: string; error?: string };

export function TriageSheet({ patientId, procedureCode, lang, initialOpen }: { patientId: string; procedureCode: string; lang: string; initialOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(initialOpen));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => { if (!initialOpen) return; const tm = setTimeout(() => setOpen(true), 0); return () => clearTimeout(tm); }, [initialOpen]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && close();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  });

  function close() {
    setOpen(false);
    if (initialOpen) router.replace(`/patient/${patientId}`);
    if (result) router.refresh();
  }

  async function submit(raw: string, modality: "free_text" | "voice" | "structured" = "free_text") {
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
    const tm = setInterval(async () => {
      const r = await fetch(`/api/reports/${result.id}`).then((x) => x.json());
      if (r.status === "complete") setResult(r);
    }, 2000);
    return () => clearInterval(tm);
  }, [result]);

  function toggleVoice() {
    const w = window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike; SpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return alert("Voice input is not supported in this browser. Please type instead.");
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const rec = new Ctor();
    rec.lang = bcp47(lang);
    rec.onresult = (e) => { const tr = e.results[0][0].transcript; setText(tr); setListening(false); void submit(tr, "voice"); };
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }

  return (
    <>
      {!open && (
        <div className="fixed inset-x-0 bottom-16 z-20 px-4 lg:bottom-0 lg:left-[272px] lg:pb-6">
          <button onClick={() => setOpen(true)} className="press mx-auto flex min-h-14 w-full max-w-2xl items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-semibold text-on-primary shadow-lg shadow-primary/25 transition-colors hover:bg-primary-hover">
            <MessageCircleWarning size={22} aria-hidden /> {t(lang, "somethingOff")}
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => !busy && close()}>
          <div role="dialog" aria-modal="true" aria-labelledby="sheet-title" lang={bcp47(lang)} className="sheet-up flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-4">
              <h2 id="sheet-title" className="text-lg font-bold">{result ? t(lang, "yourAnswer") : t(lang, "tellUs")}</h2>
              <button onClick={() => !busy && close()} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-muted-fg hover:bg-muted"><X size={20} aria-hidden /></button>
            </div>

            <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {!result && !busy && (
                <>
                  <p className="mt-1 text-sm text-muted-fg">{t(lang, "tapTypeSpeak")}</p>
                  <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Common symptoms">
                    {(CHIPS[procedureCode] ?? CHIPS.appendectomy).map((c) => (
                      <button key={c} onClick={() => { setText(c); void submit(c, "structured"); }} className="press min-h-11 rounded-full bg-muted px-4 text-sm font-medium text-foreground ring-1 ring-border transition-colors hover:bg-border/60">
                        {CHIP_LABELS[c]?.[lang] ?? c}
                      </button>
                    ))}
                  </div>
                  <label htmlFor="symptom-text" className="mt-5 block text-sm font-semibold">{t(lang, "inYourWords")}</label>
                  <textarea id="symptom-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={t(lang, "placeholder")} rows={3} className="mt-1.5 w-full resize-none rounded-xl border border-border bg-surface p-3 text-base focus:border-primary" />
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => submit(text)} disabled={!text.trim()} className="press min-h-12 flex-1 rounded-xl bg-primary font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40">{t(lang, "checkNow")}</button>
                    <button onClick={toggleVoice} aria-pressed={listening} className={`press inline-flex min-h-12 items-center gap-2 rounded-xl px-4 font-semibold ring-1 transition-colors ${listening ? "bg-red-50 text-red-800 ring-red-300" : "bg-surface text-primary ring-border hover:bg-muted"}`}>
                      {listening ? <><Square size={16} aria-hidden /> {t(lang, "stop")}</> : <><Mic size={18} aria-hidden /> {t(lang, "speak")}</>}
                    </button>
                  </div>
                </>
              )}

              {busy && (
                <div className="py-10 text-center" role="status" aria-live="polite">
                  <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" aria-hidden />
                  <p className="mt-4 text-sm text-muted-fg">{t(lang, "checking")}</p>
                </div>
              )}

              {result && <ResultCard r={result} lang={lang} onReset={() => { setResult(null); setText(""); router.refresh(); }} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const RED_FLAG_KEYS: Key[] = ["rf1", "rf2", "rf3", "rf4", "rf5", "rf6", "rf7"];

function ResultCard({ r, lang, onReset }: { r: Result; lang: string; onReset: () => void }) {
  if (r.error) {
    return (
      <div role="alert" className="mt-3 rounded-2xl bg-red-50 p-4 text-sm text-red-950 ring-1 ring-red-200">
        <p className="font-semibold">{t(lang, "couldntCheck")}</p>
        <p className="mt-1">{t(lang, "callDirectly")} <button onClick={onReset} className="underline">{t(lang, "tryAgain")}</button></p>
      </div>
    );
  }

  if (r.status === "pending_review") {
    return (
      <div className="rise mt-3 rounded-2xl bg-sky-50 p-5 ring-1 ring-sky-200" role="status" aria-live="polite">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white"><UserCheck size={22} aria-hidden /></span>
          <div>
            <h3 className="font-semibold text-sky-950">{t(lang, "nurseChecking")}</h3>
            <p className="mt-1 text-sm text-sky-950/80">{t(lang, "nurseCheckingBody")}</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-red-200">
          <p className="text-sm font-semibold text-red-900">{t(lang, "whileYouWait")}</p>
          <ul className="mt-2 space-y-1.5 text-sm text-red-950">
            {RED_FLAG_KEYS.map((k) => <li key={k} className="flex gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-sm border border-red-700" aria-hidden />{t(lang, k)}</li>)}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href="tel:112" className="press flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-red-700 text-sm font-semibold text-white"><Phone size={16} aria-hidden /> {t(lang, "emergency")}</a>
            <a href="tel:+912240001000" className="press flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-semibold text-red-900 ring-1 ring-red-300"><Phone size={16} aria-hidden /> {t(lang, "myClinic")}</a>
          </div>
        </div>
        <p className="mt-3 text-xs text-sky-950/70">{t(lang, "youSaid")}: “{r.rawText}”</p>
      </div>
    );
  }

  const sev = r.severity!;
  const m = SEVERITY_META[sev];
  const escalated = sev === "URGENT_CARE" || sev === "EMERGENCY";
  const aiKey: Key = r.winningRuleClass === 1 ? "aiSkipped" : r.usedLlm ? "aiUsed" : "aiFallback";
  const AiIcon = r.winningRuleClass === 1 ? ShieldCheck : r.usedLlm ? Bot : Cpu;
  return (
    <div className={`rise mt-3 rounded-2xl p-5 ring-2 ${m.bg} ${m.ring} ${m.text}`} role="status" aria-live="assertive">
      <div className={`flex h-14 w-14 items-center justify-center rounded-full text-white ${m.badge} ${sev === "EMERGENCY" ? "pulse-ring" : ""}`}><m.Icon size={28} aria-hidden /></div>
      <h3 className="mt-3 text-2xl font-bold leading-tight">{t(lang, m.label)}</h3>
      <p className="mt-1 text-sm opacity-80">{t(lang, m.action)}</p>
      <p className="mt-3 text-base leading-relaxed">{r.explanation}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-3 py-1 text-xs font-medium"><AiIcon size={14} aria-hidden /> {t(lang, aiKey)}</span>
        <ReadAloud text={`${t(lang, m.label)}. ${r.explanation ?? ""}`} lang={lang} compact />
      </div>
      {r.humanDecision && <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-medium"><UserCheck size={14} aria-hidden /> {t(lang, "reviewedByNurse")}</p>}
      {escalated && (
        <a href={sev === "EMERGENCY" ? "tel:112" : "tel:+912240001000"} className={`press mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl font-semibold text-white ${m.badge}`}>
          <Phone size={18} aria-hidden /> {sev === "EMERGENCY" ? t(lang, "callEmergency") : t(lang, "callClinicNow")}
        </a>
      )}
      <details className="group mt-4 text-sm">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium opacity-80"><ChevronDown size={16} className="transition group-open:rotate-180" aria-hidden /> {t(lang, "whyAnswer")}</summary>
        <dl className="mt-1 space-y-1 rounded-xl bg-white/60 p-3 text-xs" lang="en">
          <div><dt className="inline font-semibold">Rule: </dt><dd className="inline"><code>{r.winningRuleId ?? "default"}</code> (class {r.winningRuleClass ?? "4"}) — {r.rationale}</dd></div>
          <div><dt className="inline font-semibold">Findings: </dt><dd className="inline">{r.findings.map((f) => `${f.symptomCode}${f.sourceSpan ? ` (“${f.sourceSpan}”)` : ""}`).join(", ") || "none"}</dd></div>
        </dl>
      </details>
      <div className="mt-4 flex items-center justify-between">
        <SeverityBadge severity={sev} small lang={lang} />
        <button onClick={onReset} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium underline opacity-80"><RotateCcw size={14} aria-hidden /> {t(lang, "reportAnother")}</button>
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
