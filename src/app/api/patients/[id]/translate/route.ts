import { NextResponse } from "next/server";
import { store, savePatient, flushStore, syncStore } from "@/lib/db/store";
import { geminiTranslatePlan } from "@/lib/gemini/client";

// Translate the patient's plan + procedure label into their chosen language (cached on the patient record).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await syncStore();
  const p = store().patients.get(id);
  if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { language } = (await request.json()) as { language?: string };
  const lang = language ?? p.language;
  if (lang === "en") return NextResponse.json({ ok: true, cached: true });
  const stamp = JSON.stringify({ l: p.procedureLabel, p: p.plan.map((g) => [g.title, g.items]) });
  if (p.i18n?.[lang]?.stamp === stamp) return NextResponse.json({ ok: true, cached: true });
  try {
    const tr = await geminiTranslatePlan({ procedureLabel: p.procedureLabel, plan: p.plan.map((g) => ({ title: g.title, items: g.items })), language: lang });
    p.i18n = { ...(p.i18n ?? {}), [lang]: { stamp, procedureLabel: tr.procedureLabel, plan: tr.plan } };
    savePatient(p);
    await flushStore();
    return NextResponse.json({ ok: true, cached: false });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
