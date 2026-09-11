import { NextResponse } from "next/server";
import { store, savePatient } from "@/lib/db/store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = store().patients.get(id);
  if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = await request.json();
  if (Array.isArray(body.plan)) p.plan = body.plan;
  if (body.surgeryDate) p.surgeryDate = body.surgeryDate;
  if (body.procedureCode) p.procedureCode = body.procedureCode;
  if (body.procedureLabel) p.procedureLabel = body.procedureLabel;
  if (body.language) p.language = body.language;
  savePatient(p);
  return NextResponse.json(p);
}
