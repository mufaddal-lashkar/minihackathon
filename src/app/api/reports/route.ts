import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { runReport } from "@/lib/graph/graph";

export async function POST(request: Request) {
  const body = await request.json();
  const reportId = body.reportId ?? randomUUID();
  try {
    const out = await runReport({ patientId: body.patientId, reportId, rawText: String(body.rawText ?? ""), modality: body.modality });
    return NextResponse.json({ ...out.report, status: out.status === 202 ? "pending_review" : "complete" }, { status: out.status });
  } catch (err) {
    return NextResponse.json({ reportId, error: (err as Error).message }, { status: 500 });
  }
}

export async function GET() {
  const { store } = await import("@/lib/db/store");
  return NextResponse.json([...store().reports.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}
