import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, ClipboardList, FileText, Clock } from "lucide-react";
import { store, recoveryDayFor } from "@/lib/db/store";
import { loadRules, phaseForDay } from "@/lib/rules/load-rules";
import { TriageSheet } from "@/components/triage-sheet";
import { SeverityBadge } from "@/components/severity";
import { TodayTasks, HeaderTools } from "@/components/today-tasks";

export const dynamic = "force-dynamic";

const NICE: Record<string, string> = {
  serous_drainage: "a little clear fluid on the dressing", mild_incisional_pain: "mild pain around the wound", low_grade_temp: "a slightly raised temperature",
  mild_swelling: "some swelling", decreased_rom: "stiffness and limited bending", incisional_pain: "pain at the incision", lochia_heavy: "bleeding like a heavy period",
  breast_engorgement: "breast fullness", wound_redness: "faint pinkness at the edges",
};

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = store().patients.get(id);
  if (!p) notFound();
  const day = recoveryDayFor(p);
  let expected: string[] = [];
  try { expected = phaseForDay(loadRules(p.procedureCode), day).expectedSymptoms.map((s) => NICE[s] ?? s.replace(/_/g, " ")); } catch {}
  const history = [...store().reports.values()].filter((r) => r.patientId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <main id="main" className="mx-auto w-full max-w-md px-4 pb-32 pt-4">
      <div className="flex min-h-11 items-center justify-between">
        <Link href="/" className="inline-flex min-h-11 items-center gap-1 rounded-lg text-sm font-medium text-primary"><ArrowLeft size={16} aria-hidden /> Patients</Link>
        <div className="flex items-center gap-1">
          <HeaderTools patientId={p.id} language={p.language} readout={`Day ${day} after your ${p.procedureLabel}. ${expected.length ? `Today you may notice ${expected.join(", ")}.` : ""} ${p.plan.map((g) => `${g.title}: ${g.items.join(". ")}`).join(". ")}`} />
          <Link href={`/patient/${p.id}/plan`} aria-label="Recovery plan" className="flex h-11 w-11 items-center justify-center rounded-full text-primary hover:bg-muted"><FileText size={20} aria-hidden /></Link>
        </div>
      </div>

      <header className="rise mt-2">
        <div className="text-sm font-medium text-muted-fg">Hello, {p.name.split(" ")[0]}</div>
        <h1 className="mt-1 text-3xl font-bold leading-tight">Day {day} after your {p.procedureLabel.toLowerCase()}</h1>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-primary"><CalendarDays size={14} aria-hidden /> Surgery on {new Date(p.surgeryDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
      </header>

      {expected.length > 0 && (
        <section className="rise mt-6 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200" aria-labelledby="normal-today">
          <h2 id="normal-today" className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Normal for today</h2>
          <p className="mt-1 text-sm text-emerald-950">You may notice {expected.join(", ")}. These are expected on day {day}.</p>
        </section>
      )}

      <section className="mt-6" aria-labelledby="plan-heading">
        <h2 id="plan-heading" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><ClipboardList size={14} aria-hidden /> Your plan today</h2>
        <TodayTasks patientId={p.id} day={day} plan={p.plan} />
      </section>

      {history.length > 0 && (
        <section className="mt-8" aria-labelledby="history-heading">
          <h2 id="history-heading" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><Clock size={14} aria-hidden /> Recent check-ins</h2>
          <ul className="mt-2 space-y-2">
            {history.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface p-3 text-sm ring-1 ring-border">
                <span className="truncate text-foreground/80">“{r.rawText}”</span>
                {r.status === "pending_review" ? <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">Nurse reviewing</span> : r.severity && <SeverityBadge severity={r.severity} small />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <TriageSheet patientId={p.id} procedureCode={p.procedureCode} />
    </main>
  );
}
