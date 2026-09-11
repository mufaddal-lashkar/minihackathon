import Link from "next/link";
import { ChevronRight, Phone } from "lucide-react";
import { Shell } from "@/components/shell";
import { SeverityBadge } from "@/components/severity";
import { store, recoveryDayFor } from "@/lib/db/store";
import { reportsFor } from "@/lib/db/stats";
import { seedHistory } from "@/lib/db/seed-history";
import { timeAgo } from "@/lib/format";
import { LANGS } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default function PatientsPage() {
  seedHistory();
  const patients = [...store().patients.values()];
  const reports = reportsFor();
  return (
    <Shell role="nurse">
      <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">
        <h1 className="text-2xl font-bold">Patients</h1>
        <p className="text-sm text-muted-fg">{patients.length} on the post-operative pathway</p>
        <div className="mt-5 overflow-x-auto rounded-2xl bg-surface ring-1 ring-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-fg">
              <tr>
                <th scope="col" className="px-4 py-3">Patient</th><th scope="col" className="px-4 py-3">Procedure</th><th scope="col" className="px-4 py-3">Day</th>
                <th scope="col" className="px-4 py-3">Risk flags</th><th scope="col" className="px-4 py-3">Language</th><th scope="col" className="px-4 py-3">Check-ins</th><th scope="col" className="px-4 py-3">Last outcome</th><th scope="col" className="px-4 py-3"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {patients.map((p) => {
                const mine = reports.filter((r) => r.patientId === p.id);
                const last = mine[0];
                return (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/nurse/patients/${p.id}`} className="font-semibold text-primary hover:underline">{p.name}</Link>
                      <div className="text-xs text-muted-fg">Age {p.ageBand} · {p.surgeon}</div>
                    </td>
                    <td className="px-4 py-3">{p.procedureLabel}</td>
                    <td className="px-4 py-3 tabular-nums">{recoveryDayFor(p)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        {p.anticoagulated && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">anticoagulated</span>}
                        {p.comorbidities.map((c) => <span key={c} className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{c}</span>)}
                        {p.ageBand >= 70 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">70+</span>}
                        {!p.anticoagulated && !p.comorbidities.length && p.ageBand < 70 && <span className="text-muted-fg">none</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">{LANGS.find((l) => l.code === p.language)?.label ?? p.language}</td>
                    <td className="px-4 py-3 tabular-nums">{mine.length}</td>
                    <td className="px-4 py-3">{last ? <div className="flex items-center gap-2">{last.status === "pending_review" ? <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">Pending</span> : last.severity && <SeverityBadge severity={last.severity} small />}<span className="text-xs text-muted-fg">{timeAgo(last.createdAt)}</span></div> : <span className="text-muted-fg">—</span>}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <a href={`tel:${p.phone}`} aria-label={`Call ${p.name}`} className="flex h-9 w-9 items-center justify-center rounded-full text-primary hover:bg-muted"><Phone size={16} aria-hidden /></a>
                        <Link href={`/nurse/patients/${p.id}`} aria-label={`Open ${p.name}`} className="flex h-9 w-9 items-center justify-center rounded-full text-primary hover:bg-muted"><ChevronRight size={18} aria-hidden /></Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </Shell>
  );
}
