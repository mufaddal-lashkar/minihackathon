import Link from "next/link";
import { notFound } from "next/navigation";
import { store, recoveryDayFor } from "@/lib/db/store";
import { TriageSheet } from "@/components/triage-sheet";

export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = store().patients.get(id);
  if (!p) notFound();
  const day = recoveryDayFor(p);
  const history = [...store().reports.values()].filter((r) => r.patientId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6 pb-24">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-teal-700">← Patients</Link>
        <span className="text-xs text-teal-900/50">Demo · {p.name}</span>
      </div>

      <header className="mt-4 rise">
        <div className="text-sm text-teal-700 font-semibold">Good day, {p.name.split(" ")[0]}</div>
        <h1 className="text-2xl font-bold">Day {day} after your {p.procedureLabel.toLowerCase()}</h1>
        <p className="text-sm text-teal-900/60 mt-1">Here is what is normal today, and what to do if something feels off.</p>
      </header>

      <section className="mt-6 space-y-3">
        {p.plan.map((g) => (
          <div key={g.title} className="rise rounded-2xl bg-white p-4 ring-1 ring-teal-100">
            <div className="text-xs font-semibold uppercase tracking-wide text-teal-700">{g.title}</div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {g.items.map((it) => (
                <li key={it} className="flex gap-2"><span className="text-teal-500">•</span><span>{it}</span></li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <TriageSheet patientId={p.id} procedureCode={p.procedureCode} />

      {history.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-700 mb-2">Recent check-ins</h2>
          <ul className="space-y-2">
            {history.map((r) => (
              <li key={r.id} className="rounded-xl bg-white p-3 ring-1 ring-teal-100 text-sm">
                <div className="text-teal-900/80">“{r.rawText}”</div>
                <div className="mt-1 text-xs text-teal-900/50">{r.status === "pending_review" ? "Waiting for nurse review" : r.severity?.replace("_", " ")}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
