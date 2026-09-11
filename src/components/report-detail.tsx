import { Check, Bot, Cpu, ShieldCheck, UserCheck } from "lucide-react";
import type { ReportRecord } from "@/lib/db/store";
import { SeverityBadge } from "./severity";
import { fmtDateTime } from "@/lib/format";

export function Highlighted({ text, spans }: { text: string; spans: string[] }) {
  if (!spans.length) return <>“{text}”</>;
  const re = new RegExp(`(${spans.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(re);
  return <>“{parts.map((p, i) => (spans.some((s) => s.toLowerCase() === p.toLowerCase()) ? <mark key={i} className="rounded bg-yellow-200 px-0.5">{p}</mark> : <span key={i}>{p}</span>))}”</>;
}

export function ReportDetail({ r }: { r: ReportRecord }) {
  const fired = r.ruleEvaluations.filter((e) => e.fired);
  const notFired = r.ruleEvaluations.filter((e) => !e.fired);
  return (
    <section className="rise rounded-2xl bg-surface p-5 ring-1 ring-border" aria-label="Report detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Report · {fmtDateTime(r.createdAt)} · day {r.recoveryDay}</h2>
        {r.severity && <SeverityBadge severity={r.severity} />}
      </div>
      <div className="mt-3 rounded-xl bg-muted p-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Patient’s own words · {r.modality.replace("_", " ")}</div>
        <p className="text-base leading-relaxed"><Highlighted text={r.rawText} spans={r.findings.map((f) => f.sourceSpan).filter((s): s is string => Boolean(s))} /></p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Findings</h3>
          {r.findings.length === 0 && <p className="text-sm text-muted-fg">None extracted</p>}
          <ul className="space-y-1 text-sm">{r.findings.map((f, i) => <li key={i}><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{f.symptomCode}</code>{f.sourceSpan && <span className="text-muted-fg"> ← “{f.sourceSpan}”</span>}</li>)}</ul>
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-fg">
            {r.winningRuleClass === 1 ? <ShieldCheck size={12} aria-hidden /> : r.usedLlm ? <Bot size={12} aria-hidden /> : <Cpu size={12} aria-hidden />}
            {r.winningRuleClass === 1 ? "Red flag caught before AI" : r.usedLlm ? "Gemini extraction" : "Keyword extraction"} · confidence {Math.round(r.extractionConfidence * 100)}%
          </p>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Decision</h3>
          <p className="text-sm">Engine proposed <b>{(r.proposedSeverity ?? r.severity)?.replace("_", " ")}</b> via <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.winningRuleId ?? "default"}</code> (class {r.winningRuleClass ?? "4"})</p>
          <p className="mt-1 text-sm text-muted-fg">{r.rationale}</p>
          {r.humanDecision && <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-900"><UserCheck size={12} aria-hidden /> {r.humanDecision.action} by {r.humanDecision.decidedBy}{r.humanDecision.reason ? ` — ${r.humanDecision.reason}` : ""}</p>}
          {r.explanation && <p className="mt-2 text-xs text-muted-fg">Patient saw: “{r.explanation}”</p>}
        </div>
      </div>
      <details className="group mt-4 text-sm">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-primary">Rule evaluations — {fired.length} fired, {notFired.length} did not</summary>
        <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto pr-1">
          {[...fired, ...notFired].map((e) => (
            <li key={e.ruleId} className={`grid grid-cols-[16px_7rem_5.5rem_1fr] items-start gap-2 rounded-lg px-2 py-1.5 ${e.fired ? "bg-emerald-50 text-emerald-950" : "text-muted-fg"}`}>
              <span>{e.fired ? <Check size={14} aria-hidden /> : <span className="block h-3.5 w-3.5 rounded-full border border-current opacity-40" />}</span>
              <code className="text-xs">{e.ruleId}</code><span className="text-xs">{e.severityAssigned?.replace("_", " ") ?? "—"}</span><span className="text-xs">{e.rationale}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
