import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { store } from "@/lib/db/store";
import { listProcedures } from "@/lib/rules/load-rules";
import { PlanEditor } from "@/components/plan-editor";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = store().patients.get(id);
  if (!p) notFound();
  return (
    <main id="main" className="mx-auto w-full max-w-md px-4 pb-16 pt-4">
      <Link href={`/patient/${p.id}`} className="inline-flex min-h-11 items-center gap-1 rounded-lg text-sm font-medium text-primary"><ArrowLeft size={16} aria-hidden /> Today</Link>
      <h1 className="mt-2 text-2xl font-bold">Your recovery plan</h1>
      <p className="mt-1 text-sm text-muted-fg">Snap your discharge sheet and we’ll draft the plan for you to check. The rule table for your procedure is fixed and clinician-authored — you only edit the plan text.</p>
      <PlanEditor patient={{ id: p.id, procedureCode: p.procedureCode, procedureLabel: p.procedureLabel, surgeryDate: p.surgeryDate, plan: p.plan }} procedures={listProcedures()} />
    </main>
  );
}
