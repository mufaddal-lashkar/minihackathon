import { notFound } from "next/navigation";
import { store, syncStore } from "@/lib/db/store";
import { Shell } from "@/components/shell";
import { listProcedures } from "@/lib/rules/load-rules";
import { PlanEditor } from "@/components/plan-editor";
import { t, bcp47 } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  await syncStore();
  const { id } = await params;
  const p = store().patients.get(id);
  if (!p) notFound();
  return (
    <Shell role="patient" patientId={p.id}>
    <main id="main" lang={bcp47(p.language)} className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4 lg:px-8 lg:py-8">
      <h1 className="text-2xl font-bold">{t(p.language, "planTitle")}</h1>
      <p className="mt-1 text-sm text-muted-fg">{t(p.language, "planIntro")}</p>
      <PlanEditor lang={p.language} patient={{ id: p.id, procedureCode: p.procedureCode, procedureLabel: p.procedureLabel, surgeryDate: p.surgeryDate, plan: p.plan }} procedures={listProcedures()} />
    </main>
    </Shell>
  );
}
