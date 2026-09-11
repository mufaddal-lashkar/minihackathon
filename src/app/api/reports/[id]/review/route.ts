import { NextResponse } from "next/server";
import { resumeReport } from "@/lib/graph/graph";
import { flushStore, syncStore } from "@/lib/db/store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const decision = { action: body.action, severity: body.severity, reason: body.reason, decidedBy: body.decidedBy ?? "nurse", decidedAt: new Date().toISOString() };
  if (decision.action === "override" && (!decision.severity || !decision.reason)) {
    return NextResponse.json({ error: "override_requires_severity_and_reason" }, { status: 400 });
  }
  await syncStore();
  const rec = await resumeReport(id, decision);
  if (!rec) return NextResponse.json({ error: "review_expired" }, { status: 409 });
  await flushStore();
  return NextResponse.json(rec);
}
