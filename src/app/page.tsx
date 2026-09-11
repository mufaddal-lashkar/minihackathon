import Link from "next/link";
import { store, recoveryDayFor } from "@/lib/db/store";

export const dynamic = "force-dynamic";

export default function Home() {
  const patients = [...store().patients.values()];
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-10">
        <div className="text-teal-700 font-semibold tracking-wide text-sm uppercase">RecoverWell</div>
        <h1 className="mt-2 text-3xl font-bold">Post-operative recovery triage</h1>
        <p className="mt-2 text-teal-900/70 max-w-xl">
          Severity is decided by a deterministic rule table. The AI only reads what you wrote and phrases the answer — it never
          decides how urgent it is. Uncertain reassurances go to a nurse before you see them.
        </p>
      </header>

      <section>
        <h2 className="text-sm font-semibold text-teal-800 uppercase tracking-wide mb-3">Demo patients</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {patients.map((p) => (
            <Link key={p.id} href={`/patient/${p.id}`} className="rise rounded-2xl bg-white p-5 ring-1 ring-teal-100 shadow-sm hover:shadow-md hover:ring-teal-300 transition">
              <div className="text-lg font-semibold">{p.name}</div>
              <div className="text-sm text-teal-900/70">{p.procedureLabel}</div>
              <div className="mt-3 inline-block rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">Day {recoveryDayFor(p)} of recovery</div>
              <div className="mt-2 text-xs text-teal-900/50">
                Age {p.ageBand}{p.anticoagulated ? " · on blood thinners" : ""}{p.comorbidities.length ? ` · ${p.comorbidities.join(", ")}` : ""}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <Link href="/nurse" className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-white font-semibold hover:bg-teal-800 transition">
          Open nurse inbox →
        </Link>
      </section>
    </main>
  );
}
