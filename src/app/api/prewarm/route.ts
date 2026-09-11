import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { store, savePatient, type Patient } from "@/lib/db/store";
import { geminiTranslatePlan, hasGemini } from "@/lib/gemini/client";
import { todayModel } from "@/lib/readout";
import { templateExplanation, NURSE_REVIEWED, SLA_EXPIRED } from "@/lib/templates/explanations";
import { SEVERITY_ORDER } from "@/lib/rules/types";
import { SEVERITY_META } from "@/components/severity";
import { LANGS, t } from "@/lib/i18n";
import { getTts } from "@/app/api/tts/route";

export const maxDuration = 300;

const stampOf = (p: Patient) => JSON.stringify({ l: p.procedureLabel, p: p.plan.map((g) => [g.title, g.items]) });

// Warms every cache the demo touches: plan translations (persisted + exported to data/seed-i18n.json) and TTS audio
// for each patient's Today read-out and every result-card sentence, in all three languages.
export async function POST(request: Request) {
  if (!hasGemini()) return NextResponse.json({ error: "gemini_not_configured" }, { status: 503 });
  const { tts = true } = (await request.json().catch(() => ({}))) as { tts?: boolean };
  const s = store();
  const log: string[] = [];

  for (const p of s.patients.values()) {
    for (const lang of ["hi", "gu"]) {
      if (p.i18n?.[lang]?.stamp === stampOf(p)) continue;
      try {
        const tr = await geminiTranslatePlan({ procedureLabel: p.procedureLabel, plan: p.plan.map((g) => ({ title: g.title, items: g.items })), language: lang });
        p.i18n = { ...(p.i18n ?? {}), [lang]: { stamp: stampOf(p), procedureLabel: tr.procedureLabel, plan: tr.plan } };
        savePatient(p);
        log.push(`translated ${p.id} → ${lang}`);
      } catch (err) { log.push(`translate ${p.id} ${lang} FAILED: ${(err as Error).message}`); }
    }
  }
  const seed: Record<string, Patient["i18n"]> = {};
  for (const p of s.patients.values()) if (p.i18n) seed[p.id] = p.i18n;
  fs.writeFileSync(path.join(process.cwd(), "data", "seed-i18n.json"), JSON.stringify(seed, null, 2));

  if (tts) {
    const jobs: { text: string; lang: string }[] = [];
    for (const p of s.patients.values()) for (const l of LANGS) jobs.push({ text: todayModel(p, l.code).readout, lang: l.code });
    for (const l of LANGS) for (const sev of SEVERITY_ORDER) {
      const label = t(l.code, SEVERITY_META[sev].label);
      jobs.push({ text: `${label}. ${templateExplanation(sev, l.code)}`, lang: l.code });
      jobs.push({ text: `${label}. ${NURSE_REVIEWED[l.code]} ${templateExplanation(sev, l.code)}`, lang: l.code });
    }
    for (const l of LANGS) jobs.push({ text: `${t(l.code, "labelCall")}. ${SLA_EXPIRED[l.code]}`, lang: l.code });
    let done = 0, failed = 0;
    for (const j of jobs) {
      try { await getTts(j.text, j.lang); done++; } catch (err) { failed++; log.push(`tts ${j.lang} FAILED: ${(err as Error).message}`); }
    }
    log.push(`tts: ${done} ready, ${failed} failed, ${jobs.length} total`);
  }
  return NextResponse.json({ ok: true, log });
}
