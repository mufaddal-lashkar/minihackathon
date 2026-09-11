import { notFound } from "next/navigation";
import { CalendarDays, ClipboardList, Clock } from "lucide-react";
import { store } from "@/lib/db/store";
import { todayModel } from "@/lib/readout";
import { TriageSheet } from "@/components/triage-sheet";
import { SeverityBadge } from "@/components/severity";
import { TodayTasks, ReadAloud } from "@/components/today-tasks";
import { Shell } from "@/components/shell";
import { t, bcp47 } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function PatientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ checkin?: string }> }) {
  const { id } = await params;
  const { checkin } = await searchParams;
  const p = store().patients.get(id);
  if (!p) notFound();
  const lang = p.language;
  const { procedureLabel, plan, day, expected, readout } = todayModel(p, lang);
  const history = [...store().reports.values()].filter((r) => r.patientId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  const dateStr = new Date(p.surgeryDate).toLocaleDateString(bcp47(lang), { day: "numeric", month: "long" });

  return (
    <Shell role="patient" patientId={p.id}>
      <main id="main" lang={bcp47(lang)} className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4 lg:px-8 lg:py-8">
        <header className="rise flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-muted-fg">{t(lang, "hello")}, {p.name.split(" ")[0]}</div>
            <h1 className="mt-1 text-3xl font-bold leading-tight">{t(lang, "dayAfter", { day, procedure: procedureLabel })}</h1>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-primary"><CalendarDays size={14} aria-hidden /> {t(lang, "surgeryOn", { date: dateStr })}</div>
          </div>
          <ReadAloud text={readout} lang={lang} />
        </header>

        {expected.length > 0 && (
          <section className="rise mt-6 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200" aria-labelledby="normal-today">
            <h2 id="normal-today" className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{t(lang, "normalToday")}</h2>
            <p className="mt-1 text-sm text-emerald-950">{t(lang, "mayNotice", { list: expected.join(", "), day })}</p>
          </section>
        )}

        <section className="mt-6" aria-labelledby="plan-heading">
          <h2 id="plan-heading" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><ClipboardList size={14} aria-hidden /> {t(lang, "planToday")}</h2>
          <TodayTasks patientId={p.id} day={day} plan={plan} lang={lang} />
        </section>

        {history.length > 0 && (
          <section className="mt-8" aria-labelledby="history-heading">
            <h2 id="history-heading" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><Clock size={14} aria-hidden /> {t(lang, "recentCheckins")}</h2>
            <ul className="mt-2 space-y-2">
              {history.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface p-3 text-sm ring-1 ring-border">
                  <span className="truncate text-foreground/80">“{r.rawText}”</span>
                  {r.status === "pending_review" ? <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">{t(lang, "nurseReviewing")}</span> : r.severity && <SeverityBadge severity={r.severity} small lang={lang} />}
                </li>
              ))}
            </ul>
          </section>
        )}

        <TriageSheet patientId={p.id} procedureCode={p.procedureCode} lang={lang} initialOpen={checkin === "1"} />
      </main>
    </Shell>
  );
}
