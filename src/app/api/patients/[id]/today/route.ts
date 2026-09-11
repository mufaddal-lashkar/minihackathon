import { NextResponse } from "next/server";
import { store, recoveryDayFor } from "@/lib/db/store";
import { loadRules, phaseForDay } from "@/lib/rules/load-rules";

// Pure computation from the plan + surgeryDate. No LLM.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = store().patients.get(id);
  if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const recoveryDay = recoveryDayFor(p);
  let phase: { name: string; expectedSymptoms: string[]; redFlags: string[] } | null = null;
  try { phase = phaseForDay(loadRules(p.procedureCode), recoveryDay); } catch {}
  const tasks = p.plan.flatMap((g) => g.items.map((text, i) => ({ id: `${g.title}-${i}`, group: g.title, text })));
  return NextResponse.json({ patientId: p.id, recoveryDay, phase: phase?.name ?? null, expectedSymptoms: phase?.expectedSymptoms ?? [], redFlags: phase?.redFlags ?? [], tasks });
}
