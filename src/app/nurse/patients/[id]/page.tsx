import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Stethoscope, CalendarDays, Languages, Pill, ExternalLink } from "lucide-react";
import { Shell } from "@/components/shell";
import { SeverityBadge } from "@/components/severity";
import { SeverityTimeline, SeverityDonut } from "@/components/charts";
import { store, recoveryDayFor } from "@/lib/db/store";
import { computeStats, reportsFor } from "@/lib/db/stats";
import { seedHistory } from "@/lib/db/seed-history";
import { fmtDateTime } from "@/lib/format";
import { LANGS } from "@/lib/i18n";
import { severityRank } from "@/lib/rules/types";
import { loadRules, phaseForDay } from "@/lib/rules/load-rules";
import { ReportDetail } from "@/components/report-detail";

export const dynamic = "force-dynamic";

export default async function NursePatientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ report?: string }> }) {
  const { id } = await params;
  const { report } = await searchParams;
  seedHistory();
  const p = store().patients.get(id);
  if (!p) notFound();
  const reports = reportsFor(p.id);
  const st = computeStats(reports);
  const day = recoveryDayFor(p);
  let phase = "";
  try { phase = phaseForDay(loadRules(p.procedureCode), day).name; } catch {}
  const timeline = [...reports].reverse().map((r) => ({ at: fmtDateTime(r.createdAt), label: `D${r.recoveryDay}`, rank: severityRank(r.severity ?? "CALL_CLINIC"), severity: r.severity ?? "CALL_CLINIC", text: r.rawText }));
  const selected = reports.find((r) => r.id === report) ?? reports[0];

  return (
    <Shell role="nurse">
      <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">
        <Link href="/nurse/patients" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary"><ArrowLeft size={16} aria-hidden /> Patients</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted font-heading text-xl font-bold text-primary">{p.name.split(" ").map((x) => x[0]).join("")}</span>
            <div>
              <h1 className="text-2xl font-bold">{p.name}</h1>
              <p className="text-sm text-muted-fg">{p.procedureLabel} · day {day} ({phase}) · age {p.ageBand}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <a href={`tel:${p.phone}`} className="press inline-flex min-h-11 items-center gap-2 rounded-xl bg-surface px-4 text-sm font-semibold text-primary ring-1 ring-border hover:bg-muted"><Phone size={16} aria-hidden /> Call patient</a>
            <Link href={`/patient/${p.id}`} className="press inline-flex min-h-11 items-center gap-2 rounded-xl bg-surface px-4 text-sm font-semibold text-primary ring-1 ring-border hover:bg-muted"><ExternalLink size={16} aria-hidden /> Patient view</Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="rounded-2xl bg-surface p-5 ring-1 ring-border">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-primary">Properties</h2>
              <dl className="mt-3 space-y-2.5 text-sm">
                {[
                  [CalendarDays, "Surgery", new Date(p.surgeryDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })],
                  [Stethoscope, "Surgeon", p.surgeon ?? "—"],
                  [Phone, "Phone", p.phone ?? "—"],
                  [Languages, "Language", LANGS.find((l) => l.code === p.language)?.label ?? p.language],
                  [Pill, "Anticoagulated", p.anticoagulated ? "Yes" : "No"],
                ].map(([Icon, k, v]) => {
                  const I = Icon as typeof Phone;
                  return <div key={String(k)} className="flex items-start gap-2"><I size={14} className="mt-1 text-muted-fg" aria-hidden /><dt className="w-28 text-muted-fg">{String(k)}</dt><dd className="flex-1 font-medium">{String(v)}</dd></div>;
                })}
                <div className="flex items-start gap-2"><span className="mt-1 h-3.5 w-3.5" aria-hidden /><dt className="w-28 text-muted-fg">Comorbidities</dt><dd className="flex-1 font-medium">{p.comorbidities.length ? p.comorbidities.join(", ") : "None recorded"}</dd></div>
              </dl>
              <p className="mt-3 rounded-lg bg-muted p-2 text-xs text-muted-fg">Rule table: <code>{p.procedureCode}</code>. Class-3 modifiers active: {[p.anticoagulated && "anticoagulated", p.comorbidities.includes("diabetes") && "diabetic", p.ageBand >= 70 && "age 70+"].filter(Boolean).join(", ") || "none"}.</p>
            </section>

            <section className="rounded-2xl bg-surface p-5 ring-1 ring-border">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-primary">Outcome mix</h2>
              <div className="mt-3"><SeverityDonut data={st.bySeverity} /></div>
            </section>

            <section className="rounded-2xl bg-surface p-5 ring-1 ring-border">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-primary">Recovery plan</h2>
              <div className="mt-2 space-y-2 text-sm">
                {p.plan.map((g) => <div key={g.title}><div className="font-semibold">{g.title}</div><ul className="ml-4 list-disc text-muted-fg">{g.items.map((i) => <li key={i}>{i}</li>)}</ul></div>)}
              </div>
            </section>
          </aside>

          <div className="space-y-4">
            <section className="rounded-2xl bg-surface p-5 ring-1 ring-border">
              <h2 className="font-semibold">Severity across check-ins</h2>
              <p className="text-xs text-muted-fg">Each point is one check-in; the line steps at the rule engine’s outcome (after nurse override, if any). Hover for the patient’s words.</p>
              {timeline.length ? <div className="mt-2"><SeverityTimeline data={timeline} /></div> : <p className="mt-3 text-sm text-muted-fg">No check-ins yet.</p>}
            </section>

            <section className="rounded-2xl bg-surface ring-1 ring-border">
              <div className="flex items-center justify-between p-5 pb-3"><h2 className="font-semibold">Check-in history</h2><span className="text-xs text-muted-fg">{reports.length} total</span></div>
              <ul className="divide-y divide-border">
                {reports.map((r) => (
                  <li key={r.id}>
                    <Link href={`/nurse/patients/${p.id}?report=${r.id}`} scroll={false} aria-current={selected?.id === r.id ? "true" : undefined} className={`flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50 ${selected?.id === r.id ? "bg-muted/60" : ""}`}>
                      <div className="w-24 shrink-0 text-xs text-muted-fg tabular-nums">{fmtDateTime(r.createdAt)}<div>day {r.recoveryDay}</div></div>
                      <div className="min-w-0 flex-1 truncate text-sm">“{r.rawText}”</div>
                      {r.status === "pending_review" ? <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">Pending</span> : r.severity && <SeverityBadge severity={r.severity} small />}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            {selected && <ReportDetail r={selected} />}
          </div>
        </div>
      </main>
    </Shell>
  );
}

