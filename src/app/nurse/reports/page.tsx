import Link from "next/link";
import { Shell } from "@/components/shell";
import { SeverityBadge } from "@/components/severity";
import { ReportDetail } from "@/components/report-detail";
import { store, syncStore } from "@/lib/db/store";
import { reportsFor } from "@/lib/db/stats";
import { seedHistory } from "@/lib/db/seed-history";
import { fmtDateTime } from "@/lib/format";
import { SEVERITY_ORDER, type Severity } from "@/lib/rules/types";

export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" }, { key: "pending", label: "Pending review" }, { key: "escalated", label: "Escalated" },
  ...SEVERITY_ORDER.map((s) => ({ key: s, label: s.replace("_", " ").toLowerCase() })),
  { key: "llm", label: "Used Gemini" }, { key: "override", label: "Overridden" },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ severity?: string; patient?: string; report?: string }> }) {
  await syncStore();
  const { severity = "all", patient = "all", report } = await searchParams;
  seedHistory();
  const patients = [...store().patients.values()];
  let rows = reportsFor(patient === "all" ? undefined : patient);
  if (severity === "pending") rows = rows.filter((r) => r.status === "pending_review");
  else if (severity === "escalated") rows = rows.filter((r) => r.severity === "URGENT_CARE" || r.severity === "EMERGENCY");
  else if (severity === "llm") rows = rows.filter((r) => r.usedLlm);
  else if (severity === "override") rows = rows.filter((r) => r.humanDecision?.action === "override");
  else if (SEVERITY_ORDER.includes(severity as Severity)) rows = rows.filter((r) => r.severity === severity);
  const selected = rows.find((r) => r.id === report);
  const q = (over: Record<string, string>) => { const p = new URLSearchParams({ severity, patient, ...over }); return `/nurse/reports?${p}`; };

  return (
    <Shell role="nurse">
      <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted-fg">Every check-in with its rule trail. Filters combine.</p>

        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
          {FILTERS.map((f) => (
            <Link key={f.key} href={q({ severity: f.key })} aria-current={severity === f.key ? "true" : undefined} className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium capitalize ring-1 transition-colors ${severity === f.key ? "bg-primary text-on-primary ring-primary" : "bg-surface ring-border hover:bg-muted"}`}>{f.label}</Link>
          ))}
          <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden />
          {[{ id: "all", name: "All patients" }, ...patients].map((p) => (
            <Link key={p.id} href={q({ patient: p.id })} aria-current={patient === p.id ? "true" : undefined} className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium ring-1 transition-colors ${patient === p.id ? "bg-foreground text-white ring-foreground" : "bg-surface ring-border hover:bg-muted"}`}>{p.name}</Link>
          ))}
        </div>

        <div className={`mt-4 grid gap-4 ${selected ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`}>
          <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-border">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Reports</caption>
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-fg">
                <tr><th scope="col" className="px-4 py-3">When</th><th scope="col" className="px-4 py-3">Patient</th><th scope="col" className="px-4 py-3">Words</th><th scope="col" className="px-4 py-3">Rule</th><th scope="col" className="px-4 py-3">Outcome</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-fg">No reports match these filters.</td></tr>}
                {rows.map((r) => {
                  const p = store().patients.get(r.patientId);
                  return (
                    <tr key={r.id} className={`hover:bg-muted/40 ${selected?.id === r.id ? "bg-muted/60" : ""}`}>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-fg tabular-nums">{fmtDateTime(r.createdAt)}<div>day {r.recoveryDay}</div></td>
                      <td className="px-4 py-3"><Link href={`/nurse/patients/${r.patientId}`} className="font-medium text-primary hover:underline">{p?.name}</Link></td>
                      <td className="max-w-[280px] px-4 py-3"><Link href={q({ report: r.id })} scroll={false} className="line-clamp-2 hover:underline">“{r.rawText}”</Link></td>
                      <td className="px-4 py-3"><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.winningRuleId ?? "default"}</code><div className="text-xs text-muted-fg">class {r.winningRuleClass ?? 4} · {r.usedLlm ? "Gemini" : r.winningRuleClass === 1 ? "pre-filter" : "keyword"}</div></td>
                      <td className="px-4 py-3">{r.status === "pending_review" ? <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">Pending</span> : r.severity && <SeverityBadge severity={r.severity} small />}{r.humanDecision?.action === "override" && <div className="mt-1 text-[11px] text-muted-fg">overridden from {r.proposedSeverity?.replace("_", " ").toLowerCase()}</div>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {selected && <div className="xl:sticky xl:top-6 xl:self-start"><ReportDetail r={selected} /></div>}
        </div>
      </main>
    </Shell>
  );
}
