import { saveReport, store, type ReportRecord } from "./store";
import { preFilter } from "@/lib/rules/class1-pre-filter";
import { loadRules } from "@/lib/rules/load-rules";
import { evaluateRules } from "@/lib/rules/evaluator";
import { STUB_KEYWORDS, templateExplanation } from "@/lib/templates/explanations";
import type { Finding } from "@/lib/rules/types";

// Demo history so dashboards have something to show. Runs the real rule engine (no LLM) over a fixed script of
// check-ins spread across the last 7 days, and records nurse decisions for the gated ones. Idempotent.
const SCRIPT: { patientId: string; daysAgo: number; hour: number; text: string; decide?: "confirm" | "override"; overrideTo?: "SELF_CARE" | "CALL_CLINIC"; reason?: string }[] = [
  { patientId: "p-asha", daysAgo: 6, hour: 9, text: "there is some clear fluid on the dressing", decide: "confirm" },
  { patientId: "p-asha", daysAgo: 5, hour: 20, text: "mild pain around the cut, took paracetamol", decide: "confirm" },
  { patientId: "p-asha", daysAgo: 4, hour: 8, text: "I feel a bit tired today", decide: "confirm" },
  { patientId: "p-asha", daysAgo: 3, hour: 14, text: "my wound is a bit more pink than yesterday", decide: "override", overrideTo: "SELF_CARE", reason: "Faint pink edge, no warmth, day 3 — expected" },
  { patientId: "p-asha", daysAgo: 1, hour: 11, text: "the redness around my cut is spreading" },
  { patientId: "p-ravi", daysAgo: 6, hour: 10, text: "my knee is swollen and stiff", decide: "confirm" },
  { patientId: "p-ravi", daysAgo: 5, hour: 9, text: "hard to bend my knee this morning", decide: "confirm" },
  { patientId: "p-ravi", daysAgo: 4, hour: 18, text: "my calf is sore and puffy" },
  { patientId: "p-ravi", daysAgo: 3, hour: 9, text: "the wound is leaking a little fluid", decide: "confirm" },
  { patientId: "p-ravi", daysAgo: 2, hour: 7, text: "my wife says I seem confused this morning" },
  { patientId: "p-ravi", daysAgo: 1, hour: 16, text: "a bit of blood on the dressing when I changed it" },
  { patientId: "p-fatima", daysAgo: 5, hour: 12, text: "the bleeding is heavy like a period", decide: "confirm" },
  { patientId: "p-fatima", daysAgo: 4, hour: 21, text: "my breasts feel engorged and sore", decide: "confirm" },
  { patientId: "p-fatima", daysAgo: 3, hour: 8, text: "mild pain at the incision when I stand", decide: "confirm" },
  { patientId: "p-fatima", daysAgo: 2, hour: 15, text: "I have a fever of 38.4" },
  { patientId: "p-fatima", daysAgo: 1, hour: 9, text: "my incision is a little red", decide: "confirm" },
  { patientId: "p-fatima", daysAgo: 0, hour: 7, text: "I feel short of breath climbing the stairs" },
];

function stubFindings(text: string): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const [re, code] of STUB_KEYWORDS) {
    const m = re.exec(text);
    if (!m || seen.has(code)) continue;
    seen.add(code);
    out.push({ symptomCode: code, sourceSpan: m[0] });
  }
  return out;
}

export function seedHistory() {
  const s = store();
  if ([...s.reports.values()].some((r) => r.seeded)) return;
  const now = new Date();
  for (const [idx, item] of SCRIPT.entries()) {
    const p = s.patients.get(item.patientId);
    if (!p) continue;
    const at = new Date(now); at.setDate(at.getDate() - item.daysAgo); at.setHours(item.hour, 12, 0, 0);
    const recoveryDay = Math.max(0, Math.floor((at.getTime() - new Date(p.surgeryDate).getTime()) / 86400000));
    const hit = preFilter(item.text);
    const findings = hit.hit ? [hit.finding] : stubFindings(item.text);
    const rules = loadRules(p.procedureCode);
    const ev = evaluateRules({ rules, findings, recoveryDay, patient: { ageBand: p.ageBand, comorbidities: p.comorbidities, anticoagulated: p.anticoagulated }, preFilterHit: hit, extractionConfidence: findings.length ? 0.8 : 0.3 });
    const escalated = ev.severity === "URGENT_CARE" || ev.severity === "EMERGENCY";
    const rec: ReportRecord = {
      id: `seed-${String(idx).padStart(2, "0")}`, patientId: p.id, recoveryDay, modality: "free_text", rawText: item.text, createdAt: at.toISOString(), status: "complete",
      severity: ev.severity, proposedSeverity: ev.severity, winningRuleId: ev.winningRuleId, winningRuleClass: ev.winningRuleClass, rationale: ev.rationale,
      escalationRoute: ev.severity.toLowerCase(), explanation: templateExplanation(ev.severity, p.language), findings, unmappedSpans: [], extractionConfidence: findings.length ? 0.8 : 0.3,
      ruleEvaluations: ev.evaluations, requiresHuman: !escalated, usedLlm: false, seeded: true,
    };
    if (!escalated) {
      const decidedAt = new Date(at.getTime() + (4 + (item.hour % 9)) * 60000).toISOString();
      if (item.decide === "override" && item.overrideTo) {
        rec.severity = item.overrideTo;
        rec.humanDecision = { action: "override", severity: item.overrideTo, reason: item.reason, decidedBy: "Nurse Priya", decidedAt };
      } else {
        rec.humanDecision = { action: "confirm", decidedBy: "Nurse Priya", decidedAt };
      }
      rec.explanation = `A nurse reviewed your message. ${templateExplanation(rec.severity!, "en")}`;
    }
    saveReport(rec);
  }
}
