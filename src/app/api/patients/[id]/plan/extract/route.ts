import { NextResponse } from "next/server";
import { store } from "@/lib/db/store";
import { geminiExtractPlan } from "@/lib/gemini/client";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = store().patients.get(id);
  if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const form = await request.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) return NextResponse.json({ error: "photo_required" }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
  try {
    const draft = await geminiExtractPlan(bytes, file.type || "image/jpeg");
    return NextResponse.json({ source: "gemini", draft });
  } catch (err) {
    return NextResponse.json({ source: "fallback", reason: (err as Error).message, draft: { procedureLabel: p.procedureLabel, surgeryDate: p.surgeryDate, plan: p.plan } });
  }
}
