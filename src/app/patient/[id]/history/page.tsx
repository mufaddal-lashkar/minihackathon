import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { SeverityBadge } from "@/components/severity";
import { SeverityTimeline } from "@/components/charts";
import { store } from "@/lib/db/store";
import { reportsFor } from "@/lib/db/stats";
import { seedHistory } from "@/lib/db/seed-history";
import { t, bcp47 } from "@/lib/i18n";
import { severityRank } from "@/lib/rules/types";
import { templateExplanation, NURSE_REVIEWED } from "@/lib/templates/explanations";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  seedHistory();
  const p = store().patients.get(id);
  if (!p) notFound();
  const lang = p.language;
  const reports = reportsFor(p.id);
  const escalations = reports.filter((r) => r.severity === "URGENT_CARE" || r.severity === "EMERGENCY").length;
  const reviews = reports.filter((r) => r.humanDecision && r.humanDecision.decidedBy !== "system").length;
  const timeline = [...reports].reverse().map((r) => ({ at: new Date(r.createdAt).toLocaleString(bcp47(lang), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), label: `D${r.recoveryDay}`, rank: severityRank(r.severity ?? "CALL_CLINIC"), severity: r.severity ?? "CALL_CLINIC", text: r.rawText }));

  return (
    <Shell role="patient" patientId={p.id}>
      <main id="main" lang={bcp47(lang)} className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4 lg:px-8 lg:py-8">
        <h1 className="text-2xl font-bold">{t(lang, "historyTitle")}</h1>
        <div className="stagger mt-4 grid grid-cols-3 gap-2">
          {[[t(lang, "checkins"), reports.length], [t(lang, "escalations"), escalations], [t(lang, "nurseReviews"), reviews]].map(([l, v]) => (
            <div key={String(l)} className="rounded-2xl bg-surface p-3 text-center ring-1 ring-border"><div className="font-heading text-2xl font-bold tabular-nums">{v}</div><div className="text-xs text-muted-fg">{l}</div></div>
          ))}
        </div>
        <section className="mt-4 rounded-2xl bg-surface p-4 ring-1 ring-border">
          <h2 className="text-sm font-semibold">{t(lang, "severityOverTime")}</h2>
          {timeline.length ? <div className="mt-2"><SeverityTimeline data={timeline} height={190} /></div> : <p className="mt-2 text-sm text-muted-fg">{t(lang, "noCheckins")}</p>}
        </section>
        <ul className="mt-4 space-y-2">
          {reports.map((r) => (
            <li key={r.id} className="rounded-2xl bg-surface p-4 ring-1 ring-border">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-muted-fg">{new Date(r.createdAt).toLocaleString(bcp47(lang), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                  <div className="mt-0.5 text-sm">“{r.rawText}”</div>
                </div>
                {r.status === "pending_review" ? <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">{t(lang, "nurseReviewing")}</span> : r.severity && <SeverityBadge severity={r.severity} small lang={lang} />}
              </div>
              {r.severity && <p className="mt-2 text-sm text-muted-fg">{r.seeded || !r.usedLlm ? `${r.humanDecision && r.humanDecision.decidedBy !== "system" ? `${NURSE_REVIEWED[lang] ?? NURSE_REVIEWED.en} ` : ""}${templateExplanation(r.severity, lang)}` : r.explanation}</p>}
            </li>
          ))}
        </ul>
      </main>
    </Shell>
  );
}
