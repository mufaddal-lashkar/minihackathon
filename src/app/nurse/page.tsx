import Link from "next/link";
import { Timer, ShieldAlert, UserCheck, ArrowRightLeft, Bot, ChevronRight, Activity } from "lucide-react";
import { Shell } from "@/components/shell";
import { ReportsByDay, SeverityDonut, ClassBars } from "@/components/charts";
import { SeverityBadge } from "@/components/severity";
import { store, recoveryDayFor, syncStore } from "@/lib/db/store";
import { computeStats, reportsFor } from "@/lib/db/stats";
import { seedHistory } from "@/lib/db/seed-history";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function NurseDashboard() {
  await syncStore();
  seedHistory();
  const reports = reportsFor();
  const st = computeStats(reports);
  const patients = [...store().patients.values()];
  const recent = reports.slice(0, 6);

  const tiles = [
    { label: "Awaiting review", value: st.pending, hint: "reassurances held for you", Icon: Timer, tone: "bg-sky-100 text-sky-900", href: "/nurse/inbox" },
    { label: "Escalations (7d)", value: st.escalated, hint: "sent to patients instantly", Icon: ShieldAlert, tone: "bg-red-100 text-red-900", href: "/nurse/reports?severity=escalated" },
    { label: "Median time to decision", value: st.medianDecision === null ? "—" : `${Math.round(st.medianDecision)} min`, hint: `${st.reviewed} nurse decisions`, Icon: UserCheck, tone: "bg-emerald-100 text-emerald-900" },
    { label: "Override rate", value: st.reviewed ? `${Math.round((st.overrides / st.reviewed) * 100)}%` : "—", hint: `${st.overrides} of ${st.reviewed} reviews`, Icon: ArrowRightLeft, tone: "bg-amber-100 text-amber-900" },
  ];

  return (
    <Shell role="nurse">
      <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Ward dashboard</h1>
            <p className="text-sm text-muted-fg">{st.today} check-ins today · {st.total} in the last week · {st.llmShare}% used Gemini for extraction</p>
          </div>
          <Link href="/nurse/inbox" className="press inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-on-primary hover:bg-primary-hover">Open inbox {st.pending ? <span className="rounded-full bg-white/20 px-2 text-xs">{st.pending}</span> : null}</Link>
        </div>

        <section aria-label="Key figures" className="stagger mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((tl) => {
            const body = (
              <>
                <div className="flex items-center justify-between">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tl.tone}`}><tl.Icon size={18} aria-hidden /></span>
                  {tl.href && <ChevronRight size={16} className="text-muted-fg" aria-hidden />}
                </div>
                <div className="mt-3 font-heading text-3xl font-bold tabular-nums">{tl.value}</div>
                <div className="text-sm font-medium">{tl.label}</div>
                <div className="text-xs text-muted-fg">{tl.hint}</div>
              </>
            );
            return tl.href ? (
              <Link key={tl.label} href={tl.href} className="press rounded-2xl bg-surface p-4 ring-1 ring-border transition hover:ring-primary/50">{body}</Link>
            ) : (
              <div key={tl.label} className="rounded-2xl bg-surface p-4 ring-1 ring-border">{body}</div>
            );
          })}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl bg-surface p-5 ring-1 ring-border">
            <h2 className="font-semibold">Check-ins per day, by outcome</h2>
            <p className="text-xs text-muted-fg">Last 7 days · stacked by severity the rule engine assigned</p>
            <div className="mt-3"><ReportsByDay data={st.byDay} /></div>
          </div>
          <div className="rounded-2xl bg-surface p-5 ring-1 ring-border">
            <h2 className="font-semibold">Outcome mix</h2>
            <p className="text-xs text-muted-fg">Share of each severity</p>
            <div className="mt-3"><SeverityDonut data={st.bySeverity} /></div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <div className="rounded-2xl bg-surface p-5 ring-1 ring-border">
            <h2 className="font-semibold">Which rule class decided</h2>
            <p className="text-xs text-muted-fg">Class 1 never touches the LLM; Class 2/4 are gated by you</p>
            <div className="mt-3"><ClassBars data={st.byClass} /></div>
          </div>
          <div className="rounded-2xl bg-surface p-5 ring-1 ring-border">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Recent activity</h2>
              <Link href="/nurse/reports" className="text-sm font-medium text-primary">All reports →</Link>
            </div>
            <ul className="mt-3 divide-y divide-border">
              {recent.map((r) => {
                const p = store().patients.get(r.patientId);
                return (
                  <li key={r.id}>
                    <Link href={`/nurse/patients/${r.patientId}?report=${r.id}`} className="flex items-center gap-3 py-2.5 hover:bg-muted/60">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-primary">{p?.name.split(" ").map((x) => x[0]).join("")}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{p?.name} <span className="font-normal text-muted-fg">· “{r.rawText}”</span></div>
                        <div className="text-xs text-muted-fg">{timeAgo(r.createdAt)} · {r.usedLlm ? "Gemini" : r.winningRuleClass === 1 ? "pre-filter" : "keyword"}{r.humanDecision ? ` · ${r.humanDecision.action} by ${r.humanDecision.decidedBy}` : ""}</div>
                      </div>
                      {r.status === "pending_review" ? <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">Pending</span> : r.severity && <SeverityBadge severity={r.severity} small />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="mt-4 rounded-2xl bg-surface p-5 ring-1 ring-border">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold"><Activity size={16} className="text-primary" aria-hidden /> Patients on the ward</h2>
            <Link href="/nurse/patients" className="text-sm font-medium text-primary">All patients →</Link>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {patients.map((p) => {
              const mine = reports.filter((r) => r.patientId === p.id);
              const last = mine[0];
              return (
                <Link key={p.id} href={`/nurse/patients/${p.id}`} className="press rounded-xl bg-background p-4 ring-1 ring-border transition hover:ring-primary/50">
                  <div className="flex items-start justify-between gap-2">
                    <div><div className="font-semibold">{p.name}</div><div className="text-xs text-muted-fg">{p.procedureLabel} · day {recoveryDayFor(p)}</div></div>
                    {last?.severity && <SeverityBadge severity={last.severity} small />}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                    <span className="rounded-full bg-muted px-2 py-0.5">{mine.length} check-ins</span>
                    {p.anticoagulated && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">anticoagulated</span>}
                    {p.comorbidities.map((c) => <span key={c} className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{c}</span>)}
                    <span className="rounded-full bg-muted px-2 py-0.5 inline-flex items-center gap-1"><Bot size={10} aria-hidden /> {p.language.toUpperCase()}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </Shell>
  );
}
