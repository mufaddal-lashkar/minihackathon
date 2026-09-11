"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Patient, ReportRecord } from "@/lib/db/store";
import { SEVERITY_ORDER, type Severity } from "@/lib/rules/types";
import { SeverityBadge } from "@/components/severity";

type Row = ReportRecord & { patient?: Patient };

export default function NursePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [sel, setSel] = useState<Row | null>(null);

  const load = useCallback(async () => {
    const data: Row[] = await fetch("/api/nurse/inbox").then((r) => r.json());
    setRows(data);
    setSel((s) => (s ? data.find((d) => d.id === s.id) ?? null : null));
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const pending = rows.filter((r) => r.status === "pending_review");
  const escalations = rows.filter((r) => r.status !== "pending_review");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-teal-700">← Home</Link>
          <h1 className="text-2xl font-bold">Nurse inbox</h1>
        </div>
        <div className="text-sm text-teal-900/60">{pending.length} awaiting review · {escalations.length} escalations</div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <Queue title="Awaiting your decision" rows={pending} sel={sel} onSel={setSel} empty="Nothing waiting. Reassurances only reach patients after you confirm them." />
          <Queue title="Escalations (auto-sent, no gate)" rows={escalations} sel={sel} onSel={setSel} empty="No escalations yet." />
        </div>
        <div>{sel ? <ReviewPanel key={sel.id} r={sel} onDone={load} /> : <div className="rounded-2xl bg-white p-8 text-center text-teal-900/50 ring-1 ring-teal-100">Select a report to see why the engine decided what it did.</div>}</div>
      </div>
    </main>
  );
}

function Queue({ title, rows, sel, onSel, empty }: { title: string; rows: Row[]; sel: Row | null; onSel: (r: Row) => void; empty: string }) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-700 mb-2">{title}</h2>
      {rows.length === 0 && <div className="rounded-xl bg-white p-4 text-sm text-teal-900/50 ring-1 ring-teal-100">{empty}</div>}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id}>
            <button onClick={() => onSel(r)} className={`w-full rounded-xl bg-white p-3 text-left ring-1 transition ${sel?.id === r.id ? "ring-teal-500 shadow" : "ring-teal-100 hover:ring-teal-300"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">{r.patient?.name ?? r.patientId} <span className="font-normal text-teal-900/50">· day {r.recoveryDay} · {r.patient?.procedureLabel}</span></div>
                {r.severity && <SeverityBadge severity={r.severity} small />}
              </div>
              <div className="mt-1 text-sm text-teal-900/80 truncate">“{r.rawText}”</div>
              <div className="mt-1 text-xs text-teal-900/50">{timeAgo(r.createdAt)}{r.humanDecision ? ` · ${r.humanDecision.action}ed by ${r.humanDecision.decidedBy}` : ""}</div>
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
    if (!res.ok) setErr((await res.json()).error ?? "failed");
    setBusy(false);
    onDone();
  }

  const fired = r.ruleEvaluations.filter((e) => e.fired);
  const notFired = r.ruleEvaluations.filter((e) => !e.fired);

  return (
    <div className="rise rounded-2xl bg-white p-5 ring-1 ring-teal-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold">{r.patient?.name}</div>
          <div className="text-sm text-teal-900/60">{r.patient?.procedureLabel} · day {r.recoveryDay} · age {r.patient?.ageBand}{r.patient?.anticoagulated ? " · anticoagulated" : ""}{r.patient?.comorbidities?.length ? ` · ${r.patient.comorbidities.join(", ")}` : ""}</div>
        </div>
        {r.severity && <SeverityBadge severity={r.severity} />}
      </div>

      <div className="mt-4 rounded-xl bg-teal-50 p-4 text-base leading-relaxed">
        <div className="text-xs font-semibold uppercase tracking-wide text-teal-700 mb-1">Patient’s own words ({r.modality})</div>
        <Highlighted text={r.rawText} spans={r.findings.map((f) => f.sourceSpan).filter((s): s is string => Boolean(s))} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-teal-700 mb-1">Findings</div>
          {r.findings.length === 0 && <div className="text-sm text-teal-900/50">None extracted</div>}
          <ul className="space-y-1 text-sm">
            {r.findings.map((f, i) => (
              <li key={i}><code className="rounded bg-teal-50 px-1">{f.symptomCode}</code>{f.sourceSpan && <span className="text-teal-900/60"> ← “{f.sourceSpan}”</span>}</li>
            ))}
          </ul>
          {r.unmappedSpans.length > 0 && <div className="mt-1 text-xs text-amber-700">Ungrounded (dropped): {r.unmappedSpans.join(", ")}</div>}
          <div className="mt-2 text-xs text-teal-900/50">Extraction via {r.usedLlm ? "Gemini" : "keyword stub"} · confidence {Math.round(r.extractionConfidence * 100)}%</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-teal-700 mb-1">Proposed outcome</div>
          <div className="text-sm"><b>{r.proposedSeverity ?? r.severity}</b> via rule <code className="rounded bg-teal-50 px-1">{r.winningRuleId ?? "default"}</code> (class {r.winningRuleClass ?? "4"})</div>
          <div className="mt-1 text-sm text-teal-900/70">{r.rationale}</div>
          {r.explanation && <div className="mt-2 text-xs text-teal-900/50">Patient sees: “{r.explanation}”</div>}
        </div>
      </div>

      <details className="mt-4 text-sm" open>
        <summary className="cursor-pointer font-semibold text-teal-800">Rule evaluations — {fired.length} fired, {notFired.length} did not</summary>
        <ul className="mt-2 max-h-56 overflow-y-auto space-y-1">
          {[...fired, ...notFired].map((e) => (
            <li key={e.ruleId} className={`flex gap-2 rounded px-2 py-1 ${e.fired ? "bg-emerald-50" : "text-teal-900/50"}`}>
              <span className="w-4">{e.fired ? "●" : "○"}</span>
              <code className="w-28 shrink-0">{e.ruleId}</code>
              <span className="w-24 shrink-0 text-xs">{e.severityAssigned ?? "—"}</span>
              <span className="text-xs">{e.rationale}</span>
            </li>
          ))}
        </ul>
      </details>

      {pending ? (
        <div className="mt-5 border-t border-teal-100 pt-4">
          <div className="flex gap-2">
            <button onClick={() => setMode("confirm")} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ${mode === "confirm" ? "bg-teal-700 text-white ring-teal-700" : "ring-teal-300"}`}>Confirm</button>
            <button onClick={() => setMode("override")} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ${mode === "override" ? "bg-teal-700 text-white ring-teal-700" : "ring-teal-300"}`}>Override</button>
          </div>
          {mode === "override" && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                {SEVERITY_ORDER.map((s) => (
                  <button key={s} onClick={() => setSev(s)} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${sev === s ? "bg-teal-700 text-white ring-teal-700" : "ring-teal-300"}`}>{s.replace("_", " ")}</button>
                ))}
              </div>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="One-line reason (required)" className="w-full rounded-lg border border-teal-200 p-2 text-sm" />
            </div>
          )}
          {err && <div className="mt-2 text-sm text-red-700">{err}</div>}
          <button onClick={decide} disabled={busy || (mode === "override" && (!reason.trim() || sev === r.severity))} className="mt-3 w-full rounded-xl bg-teal-700 py-3 font-semibold text-white disabled:opacity-40">
            {busy ? "Sending…" : mode === "confirm" ? "Confirm and release to patient" : "Override and release to patient"}
          </button>
        </div>
      ) : (
        <div className="mt-5 border-t border-teal-100 pt-4 text-sm text-teal-900/60">
          {r.humanDecision ? `Decided: ${r.humanDecision.action} by ${r.humanDecision.decidedBy}${r.humanDecision.reason ? ` — ${r.humanDecision.reason}` : ""}` : "Escalation was sent to the patient immediately; no human gate on the escalation path."}
        </div>
      )}
    </div>
  );
}

function Highlighted({ text, spans }: { text: string; spans: string[] }) {
  if (!spans.length) return <span>“{text}”</span>;
  const re = new RegExp(`(${spans.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <span>“{parts.map((p, i) => (re.test(p) && spans.some((s) => s.toLowerCase() === p.toLowerCase()) ? <mark key={i} className="rounded bg-yellow-200 px-0.5">{p}</mark> : <span key={i}>{p}</span>))}”</span>
  );
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
