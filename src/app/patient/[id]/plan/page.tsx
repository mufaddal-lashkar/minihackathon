import { notFound } from "next/navigation";
import { store } from "@/lib/db/store";
import { Shell } from "@/components/shell";
import { listProcedures } from "@/lib/rules/load-rules";
import { PlanEditor } from "@/components/plan-editor";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = store().patients.get(id);
  if (!p) notFound();
  return (
    <Shell role="patient" patientId={p.id}>
    <main id="main" className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4 lg:px-8 lg:py-8">
      <h1 className="text-2xl font-bold">Your recovery plan</h1>
      <p className="mt-1 text-sm text-muted-fg">Snap your discharge sheet and we’ll draft the plan for you to check. The rule table for your procedure is fixed and clinician-authored — you only edit the plan text.</p>
      <PlanEditor patient={{ id: p.id, procedureCode: p.procedureCode, procedureLabel: p.procedureLabel, surgeryDate: p.surgeryDate, plan: p.plan }} procedures={listProcedures()} />
    </main>
    </Shell>
  );
}
