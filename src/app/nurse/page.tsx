"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ShieldAlert, UserCheck, Inbox, Loader2, Timer, Bot, Cpu, ArrowRightLeft } from "lucide-react";
import type { Patient, ReportRecord } from "@/lib/db/store";
import { SEVERITY_ORDER, type Severity } from "@/lib/rules/types";
import { SeverityBadge, SEVERITY_META } from "@/components/severity";
import { TopBar } from "@/components/shell";

type Row = ReportRecord & { patient?: Patient };

export default function NursePage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data: Row[] = await fetch("/api/nurse/inbox").then((r) => r.json());
    setRows(data);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 3000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  const pending = (rows ?? []).filter((r) => r.status === "pending_review");
  const escalations = (rows ?? []).filter((r) => r.status !== "pending_review");
  const sel = rows?.find((r) => r.id === selId) ?? null;

  return (
    <>
      <TopBar active="nurse" />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Nurse inbox</h1>
            <p className="text-sm text-muted-fg">Reassurances wait for you. Escalations were already sent — you see them for follow-up.</p>
          </div>
          <div className="flex gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1.5 font-semibold text-sky-900"><Timer size={14} aria-hidden /> {pending.length} awaiting</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1.5 font-semibold text-orange-900"><ShieldAlert size={14} aria-hidden /> {escalations.length} escalated</span>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className="space-y-6">
            {rows === null ? (
              <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
            ) : (
              <>
                <Queue title="Awaiting your decision" rows={pending} selId={selId} onSel={setSelId} empty="Nothing waiting. Reassurances only reach patients after you confirm them." />
                <Queue title="Escalations (auto-sent, no gate)" rows={escalations} selId={selId} onSel={setSelId} empty="No escalations yet." />
              </>
            )}
          </div>
          <div className="lg:sticky lg:top-20 lg:self-start">
            {sel ? (
              <ReviewPanel key={sel.id} r={sel} onDone={load} />
            ) : (
              <div className="flex flex-col items-center rounded-2xl bg-surface p-10 text-center ring-1 ring-border">
                <Inbox size={32} className="text-muted-fg" aria-hidden />
                <p className="mt-3 font-semibold">Select a report</p>
                <p className="mt-1 text-sm text-muted-fg">You’ll see the patient’s exact words, every rule that fired — and every rule that didn’t.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function Queue({ title, rows, selId, onSel, empty }: { title: string; rows: Row[]; selId: string | null; onSel: (id: string) => void; empty: string }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">{title}</h2>
      {rows.length === 0 && <div className="rounded-xl bg-surface p-4 text-sm text-muted-fg ring-1 ring-border">{empty}</div>}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id}>
            <button onClick={() => onSel(r.id)} aria-pressed={selId === r.id} className={`press w-full rounded-xl bg-surface p-3 text-left ring-1 transition ${selId === r.id ? "shadow-md ring-2 ring-primary" : "ring-border hover:ring-primary/50"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate font-semibold">{r.patient?.name ?? r.patientId} <span className="font-normal text-muted-fg">· day {r.recoveryDay} · {r.patient?.procedureLabel}</span></div>
                {r.severity && <SeverityBadge severity={r.severity} small />}
              </div>
              <div className="mt-1 truncate text-sm text-foreground/80">“{r.rawText}”</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-fg">
                <span>{timeAgo(r.createdAt)}</span>
                {r.humanDecision && <span className="inline-flex items-center gap-1"><UserCheck size={12} aria-hidden /> {r.humanDecision.action} by {r.humanDecision.decidedBy}</span>}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewPanel({ r, onDone }: { r: Row; onDone: () => void }) {
  const [mode, setMode] = useState<"confirm" | "override">("confirm");
  const [sev, setSev] = useState<Severity>(r.severity ?? "CALL_CLINIC");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pending = r.status === "pending_review";

  async function decide() {
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/reports/${r.id}/review`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(mode === "confirm" ? { action: "confirm", decidedBy: "Nurse Priya" } : { action: "override", severity: sev, reason, decidedBy: "Nurse Priya" }),
    });
    if (!res.ok) setErr((await res.json()).error === "review_expired" ? "This review has expired or was already decided." : "Could not send the decision. Try again.");
    setBusy(false);
    onDone();
  }

  const fired = r.ruleEvaluations.filter((e) => e.fired);
  const notFired = r.ruleEvaluations.filter((e) => !e.fired);
  const canSubmit = mode === "confirm" || (reason.trim().length > 0 && sev !== r.severity);

  return (
    <div className="rise rounded-2xl bg-surface p-5 ring-1 ring-border">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{r.patient?.name}</h2>
          <p className="text-sm text-muted-fg">{r.patient?.procedureLabel} · day {r.recoveryDay} · age {r.patient?.ageBand}{r.patient?.anticoagulated ? " · anticoagulated" : ""}{r.patient?.comorbidities?.length ? ` · ${r.patient.comorbidities.join(", ")}` : ""}</p>
        </div>
        {r.severity && <SeverityBadge severity={r.severity} />}
      </div>

      <div className="mt-4 rounded-xl bg-muted p-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Patient’s own words · {r.modality.replace("_", " ")}</div>
        <p className="text-base leading-relaxed"><Highlighted text={r.rawText} spans={r.findings.map((f) => f.sourceSpan).filter((s): s is string => Boolean(s))} /></p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Findings</h3>
          {r.findings.length === 0 && <p className="text-sm text-muted-fg">None extracted</p>}
          <ul className="space-y-1 text-sm">
            {r.findings.map((f, i) => (
              <li key={i}><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{f.symptomCode}</code>{f.sourceSpan && <span className="text-muted-fg"> ← “{f.sourceSpan}”</span>}</li>
            ))}
          </ul>
          {r.unmappedSpans.length > 0 && <p className="mt-1 text-xs text-amber-800">Ungrounded, dropped: {r.unmappedSpans.join(", ")}</p>}
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-fg">{r.usedLlm ? <Bot size={12} aria-hidden /> : <Cpu size={12} aria-hidden />} {r.winningRuleClass === 1 ? "Red flag caught before AI" : r.usedLlm ? "Gemini extraction" : "Keyword extraction"} · confidence {Math.round(r.extractionConfidence * 100)}%</p>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Proposed outcome</h3>
          <p className="text-sm"><b>{(r.proposedSeverity ?? r.severity)?.replace("_", " ")}</b> via <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.winningRuleId ?? "default"}</code> (class {r.winningRuleClass ?? "4"})</p>
          <p className="mt-1 text-sm text-muted-fg">{r.rationale}</p>
          {r.explanation && <p className="mt-2 text-xs text-muted-fg">Patient sees: “{r.explanation}”</p>}
        </div>
      </div>

      <details className="group mt-4 text-sm" open>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-primary">
          <ArrowRightLeft size={14} aria-hidden /> Rule evaluations — {fired.length} fired, {notFired.length} did not
        </summary>
        <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto pr-1">
          {[...fired, ...notFired].map((e) => (
            <li key={e.ruleId} className={`grid grid-cols-[16px_7rem_5.5rem_1fr] items-start gap-2 rounded-lg px-2 py-1.5 ${e.fired ? "bg-emerald-50 text-emerald-950" : "text-muted-fg"}`}>
              <span aria-label={e.fired ? "fired" : "did not fire"}>{e.fired ? <Check size={14} aria-hidden /> : <span className="block h-3.5 w-3.5 rounded-full border border-current opacity-40" />}</span>
              <code className="text-xs">{e.ruleId}</code>
              <span className="text-xs">{e.severityAssigned?.replace("_", " ") ?? "—"}</span>
              <span className="text-xs">{e.rationale}</span>
            </li>
          ))}
        </ul>
      </details>

      {pending ? (
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex gap-2" role="radiogroup" aria-label="Decision">
            {(["confirm", "override"] as const).map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`press min-h-11 rounded-lg px-4 text-sm font-semibold ring-1 transition-colors ${mode === m ? "bg-primary text-on-primary ring-primary" : "ring-border hover:bg-muted"}`}>
                {m === "confirm" ? "Confirm" : "Override"}
              </button>
            ))}
          </div>
          {mode === "override" && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="New severity">
                {SEVERITY_ORDER.map((s) => (
                  <button key={s} role="radio" aria-checked={sev === s} onClick={() => setSev(s)} className={`press inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 transition-colors ${sev === s ? `${SEVERITY_META[s].badge} text-white ring-transparent` : "ring-border hover:bg-muted"}`}>
                    {s.replace("_", " ")}
                  </button>
                ))}
              </div>
              <div>
                <label htmlFor="override-reason" className="text-sm font-semibold">Reason <span className="text-destructive">*</span></label>
                <input id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="One line, shown in the audit trail" className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-primary" />
                <p className="mt-1 text-xs text-muted-fg">Pick a different severity and give a reason. If you lower it, the patient is told a nurse reviewed it — never that the system changed its mind.</p>
              </div>
            </div>
          )}
          {err && <p role="alert" className="mt-2 text-sm text-destructive">{err}</p>}
          <button onClick={decide} disabled={busy || !canSubmit} className="press mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? <Loader2 className="animate-spin" size={18} aria-hidden /> : <Check size={18} aria-hidden />}
            {busy ? "Sending…" : mode === "confirm" ? "Confirm and release to patient" : "Override and release to patient"}
          </button>
        </div>
      ) : (
        <p className="mt-5 border-t border-border pt-4 text-sm text-muted-fg">
          {r.humanDecision ? `Decided: ${r.humanDecision.action} by ${r.humanDecision.decidedBy}${r.humanDecision.reason ? ` — ${r.humanDecision.reason}` : ""}` : "Escalation was sent to the patient immediately; there is no human gate on the escalation path."}
        </p>
      )}
    </div>
  );
}

function Highlighted({ text, spans }: { text: string; spans: string[] }) {
  if (!spans.length) return <>“{text}”</>;
  const re = new RegExp(`(${spans.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(re);
  return <>“{parts.map((p, i) => (spans.some((s) => s.toLowerCase() === p.toLowerCase()) ? <mark key={i} className="rounded bg-yellow-200 px-0.5">{p}</mark> : <span key={i}>{p}</span>))}”</>;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
