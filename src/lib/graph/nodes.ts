import { interrupt } from "@langchain/langgraph";
import type { GraphStateType } from "./state";
import { preFilter } from "@/lib/rules/class1-pre-filter";
import { loadRules } from "@/lib/rules/load-rules";
import { evaluateRules } from "@/lib/rules/evaluator";
import { severityRank, type Finding, type Severity } from "@/lib/rules/types";
import { store, saveReport, recoveryDayFor, type ReportRecord } from "@/lib/db/store";
import { geminiExtract, geminiExplain, hasGemini } from "@/lib/gemini/client";
import { templateExplanation, STUB_KEYWORDS, NURSE_REVIEWED, SLA_EXPIRED } from "@/lib/templates/explanations";

type Patch = Partial<GraphStateType>;

export function ingestNode(state: GraphStateType): Patch {
  const patient = store().patients.get(state.patientId);
  if (!patient) throw new Error(`unknown_patient: ${state.patientId}`);
  const rec: ReportRecord = {
    id: state.reportId, patientId: patient.id, recoveryDay: recoveryDayFor(patient), modality: state.modality,
    rawText: state.rawText, createdAt: new Date().toISOString(), status: "pending_review",
    findings: [], unmappedSpans: [], extractionConfidence: 1, ruleEvaluations: [], requiresHuman: false, usedLlm: false,
  };
  saveReport(rec);
  return { recoveryDay: rec.recoveryDay, procedureCode: patient.procedureCode, rawText: state.rawText.trim() };
}

export function preFilterNode(state: GraphStateType): Patch {
  const result = preFilter(state.rawText);
  return result.hit ? { findings: [result.finding], preFilterHit: result } : { preFilterHit: result };
}

function stubExtract(rawText: string): { findings: Finding[]; confidence: number } {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const [re, code] of STUB_KEYWORDS) {
    const m = re.exec(rawText);
    if (!m || seen.has(code)) continue;
    // pain family: only one of mild/strong
    if ((code === "mild_incisional_pain" && seen.has("incisional_pain")) || (code === "wound_redness" && seen.has("spreading_redness"))) continue;
    if (code === "serous_drainage" && seen.has("wound_drainage")) continue;
    if (code === "bleeding" && seen.has("lochia_heavy")) continue;
    seen.add(code);
    findings.push({ symptomCode: code, sourceSpan: m[0] });
  }
  return { findings, confidence: findings.length ? 0.8 : 0.3 };
}

export async function extractNode(state: GraphStateType): Promise<Patch> {
  if (hasGemini()) {
    try {
      const out = await geminiExtract(state.rawText, state.procedureCode, state.recoveryDay);
      return { findings: out.findings, extractionConfidence: out.confidence, usedLlm: true };
    } catch (err) {
      console.warn("[extract] gemini failed, using stub extractor:", (err as Error).message);
    }
  }
  const out = stubExtract(state.rawText);
  // Chip intake is pre-segmented: the phrase is one of ours, so extraction confidence is not in question.
  return { findings: out.findings, extractionConfidence: state.modality === "structured" ? 1 : out.confidence, usedLlm: false };
}

export function validateNode(state: GraphStateType): Patch {
  if (state.modality === "structured") return {};
  // Grounding check: a finding must quote a literal substring of the patient's text. Ungrounded ones are
  // recorded as unmapped spans (which forces human review) and ignored by the evaluator.
  const dropped = state.findings.filter(
    (f) => f.sourceSpan === undefined || !state.rawText.toLowerCase().includes(f.sourceSpan.toLowerCase()),
  );
  return { unmappedSpans: dropped.map((f) => f.sourceSpan ?? f.symptomCode) };
}

export function evaluateRulesNode(state: GraphStateType): Patch {
  const patient = store().patients.get(state.patientId)!;
  const findings = state.findings.filter(
    (f) => state.modality === "structured" || f.sourceSpan === undefined || state.rawText.toLowerCase().includes(f.sourceSpan.toLowerCase()),
  );
  let rules;
  try {
    rules = loadRules(state.procedureCode);
  } catch {
    return { severity: "CALL_CLINIC", winningRuleId: null, winningRuleClass: null, rationale: "No rule table for this procedure; a nurse must review." };
  }
  const result = evaluateRules({
    rules, findings, recoveryDay: state.recoveryDay,
    patient: { ageBand: patient.ageBand, comorbidities: patient.comorbidities, anticoagulated: patient.anticoagulated },
    preFilterHit: state.preFilterHit, extractionConfidence: state.extractionConfidence, unmappedCount: state.unmappedSpans.length,
  });
  return { severity: result.severity, proposedSeverity: result.severity, winningRuleId: result.winningRuleId, winningRuleClass: result.winningRuleClass, rationale: result.rationale, ruleEvaluations: result.evaluations };
}

export function triageNode(state: GraphStateType): Patch {
  const severity = state.severity ?? "CALL_CLINIC";
  if (severityRank(severity) >= severityRank("URGENT_CARE")) {
    return { requiresHumanReview: false, escalationRoute: severity === "EMERGENCY" ? "emergency" : "urgent_care" };
  }
  const requiresHumanReview =
    state.extractionConfidence < 0.6 || state.unmappedSpans.length > 0 || state.winningRuleClass === 2 || state.winningRuleClass === 4 || state.winningRuleClass === null;
  return { requiresHumanReview, escalationRoute: severity === "CALL_CLINIC" ? "call_clinic" : "self_care" };
}

export function humanReviewNode(state: GraphStateType): Patch {
  persistSnapshot(state, { status: "pending_review", requiresHuman: true });
  const decision = interrupt({ reason: "reassurance_needs_review", reportId: state.reportId }) as GraphStateType["humanDecision"];
  const severity: Severity = decision?.action === "override" && decision.severity ? decision.severity : (state.severity ?? "CALL_CLINIC");
  return { humanDecision: decision, severity, escalationRoute: severity === "CALL_CLINIC" ? "call_clinic" : severity === "SELF_CARE" ? "self_care" : severity === "EMERGENCY" ? "emergency" : "urgent_care" };
}

export async function explainNode(state: GraphStateType): Promise<Patch> {
  const severity = state.severity ?? "CALL_CLINIC";
  const patient = store().patients.get(state.patientId)!;
  const lang = patient.language ?? "en";
  let explanation = templateExplanation(severity, lang);
  if (state.humanDecision?.decidedBy === "system") {
    explanation = SLA_EXPIRED[lang] ?? SLA_EXPIRED.en;
  } else if (state.humanDecision) {
    explanation = `${NURSE_REVIEWED[lang] ?? NURSE_REVIEWED.en} ${explanation}`;
  } else if (hasGemini()) {
    try {
      explanation = await geminiExplain({ rawText: state.rawText, severity, rationale: state.rationale, procedureLabel: patient.procedureLabel, recoveryDay: state.recoveryDay, language: patient.language });
    } catch (err) {
      console.warn("[explain] gemini failed, using template:", (err as Error).message);
    }
  }
  return { explanation };
}

export function notifyCareTeamNode(state: GraphStateType): Patch {
  console.log(`[notify_care_team] report ${state.reportId} severity=${state.severity} route=${state.escalationRoute}`);
  return {};
}

export function persistNode(state: GraphStateType): Patch {
  persistSnapshot(state, { status: "complete" });
  return {};
}

function persistSnapshot(state: GraphStateType, extra: Partial<ReportRecord>) {
  const rec = store().reports.get(state.reportId);
  if (!rec) return;
  Object.assign(rec, {
    recoveryDay: state.recoveryDay, findings: state.findings, unmappedSpans: state.unmappedSpans, extractionConfidence: state.extractionConfidence,
    ruleEvaluations: state.ruleEvaluations, severity: state.severity, proposedSeverity: state.proposedSeverity ?? state.severity, winningRuleId: state.winningRuleId,
    winningRuleClass: state.winningRuleClass, rationale: state.rationale, escalationRoute: state.escalationRoute, explanation: state.explanation,
    requiresHuman: state.requiresHumanReview, humanDecision: state.humanDecision, usedLlm: state.usedLlm,
  }, extra);
  saveReport(rec);
}
