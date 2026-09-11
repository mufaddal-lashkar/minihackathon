import Link from "next/link";
import { ArrowRight, ShieldCheck, Stethoscope, Sparkles, ChevronRight } from "lucide-react";
import { store, recoveryDayFor, syncStore } from "@/lib/db/store";
import { HeartPulse } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Home() {
  await syncStore();
  const patients = [...store().patients.values()];
  return (
    <>
      <header className="border-b border-border bg-surface/90">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <Link href="/" className="inline-flex items-center gap-2" aria-label="RecoverWell home"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary"><HeartPulse size={18} aria-hidden /></span><span className="font-heading text-lg font-semibold">RecoverWell</span></Link>
          <nav className="flex gap-1 text-sm font-medium"><Link href="/nurse" className="inline-flex min-h-11 items-center rounded-lg px-3 text-primary hover:bg-muted">Nurse</Link><Link href={`/patient/${patients[0]?.id}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-primary hover:bg-muted">Patient</Link></nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-10">
        <section className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div className="rise">
            <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-primary"><ShieldCheck size={14} aria-hidden /> Rules decide. AI only explains.</span>
            <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">Post-operative recovery, triaged safely.</h1>
            <p className="mt-4 max-w-xl text-lg text-muted-fg">
              Patients describe what they notice. A deterministic rule table decides how urgent it is. Gemini only reads their words and phrases the answer — and every reassurance passes a nurse first.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`/patient/${patients[0]?.id}`} className="press inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover">
                Try the patient app <ArrowRight size={18} aria-hidden />
              </Link>
              <Link href="/nurse" className="press inline-flex min-h-12 items-center gap-2 rounded-xl bg-surface px-5 font-semibold text-primary ring-1 ring-border transition-colors hover:bg-muted">
                <Stethoscope size={18} aria-hidden /> Nurse dashboard
              </Link>
            </div>
          </div>
          <ul className="stagger grid gap-3 text-sm">
            {[
              ["Class 1 red flags", "Caught by a regex pre-filter before any LLM call. Chest pain escalates even if Gemini is down."],
              ["Class 2 expectations", "Procedure- and day-specific rules from a JSON table. Clear fluid on day 2 is normal; on day 10 it is a clinic call."],
              ["Nurse gate on reassurance", "SELF_CARE / CALL_CLINIC pauses the graph (LangGraph interrupt) until a nurse confirms or overrides."],
            ].map(([t, d]) => (
              <li key={t} className="rounded-2xl bg-surface p-4 ring-1 ring-border">
                <div className="flex items-center gap-2 font-semibold"><Sparkles size={16} className="text-primary" aria-hidden /> {t}</div>
                <p className="mt-1 text-muted-fg">{d}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">Demo patients</h2>
          <ul className="stagger mt-3 grid gap-3 sm:grid-cols-3">
            {patients.map((p) => (
              <li key={p.id}>
                <Link href={`/patient/${p.id}`} className="press group flex h-full flex-col rounded-2xl bg-surface p-5 ring-1 ring-border transition hover:shadow-md hover:ring-primary/40">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-lg font-semibold">{p.name}</div>
                      <div className="text-sm text-muted-fg">{p.procedureLabel}</div>
                    </div>
                    <ChevronRight size={18} className="mt-1 text-muted-fg transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-muted px-2.5 py-1 font-semibold text-primary">Day {recoveryDayFor(p)}</span>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-muted-fg">Age {p.ageBand}</span>
                    {p.anticoagulated && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">Anticoagulated</span>}
                    {p.comorbidities.map((c) => <span key={c} className="rounded-full bg-amber-100 px-2.5 py-1 capitalize text-amber-900">{c}</span>)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
