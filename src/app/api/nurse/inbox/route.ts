import { NextResponse } from "next/server";
import { store, syncStore } from "@/lib/db/store";
import { severityRank } from "@/lib/rules/types";

export async function GET() {
  await syncStore();
  const s = store();
  const rows = [...s.reports.values()]
    .filter((r) => r.requiresHuman || (r.severity && severityRank(r.severity) >= 2))
    .map((r) => ({ ...r, patient: s.patients.get(r.patientId) }))
    .sort((a, b) => {
      const pa = a.status === "pending_review" ? 1 : 0, pb = b.status === "pending_review" ? 1 : 0;
      if (pa !== pb) return pb - pa;
      const d = severityRank(b.severity ?? "SELF_CARE") - severityRank(a.severity ?? "SELF_CARE");
      return d !== 0 ? d : a.createdAt.localeCompare(b.createdAt);
    });
  return NextResponse.json(rows);
}
