import type { Finding, ProcedureRules, Rule, RuleEvaluation, Severity } from "./types";
import { SEVERITY_ORDER, maxSeverity, severityRank } from "./types";
import { phaseForDay } from "./load-rules";
import type { PreFilterResult } from "./class1-pre-filter";

export type PatientContext = { ageBand: number; comorbidities: string[]; anticoagulated: boolean };

const CLASS_4_DEFAULT_SEVERITY: Severity = "CALL_CLINIC";

function patientHasFlag(flag: string, patient: PatientContext): boolean {
  if (flag === "anticoagulated") return patient.anticoagulated;
  if (flag === "age_70_plus") return patient.ageBand >= 70;
  return patient.comorbidities.includes(flag.replace(/^diabetic$/, "diabetes")) || patient.comorbidities.includes(flag);
}

function predicateMatches(rule: Rule, findings: Finding[], phaseName: string, patient: PatientContext): Finding[] {
  const w = rule.when;
  if (w.patientFlag && !patientHasFlag(w.patientFlag, patient)) return [];
  if (w.comorbidity && !patient.comorbidities.includes(w.comorbidity)) return [];
  if (w.ageBandMin !== undefined && patient.ageBand < w.ageBandMin) return [];
  if (w.anticoagulated !== undefined && patient.anticoagulated !== w.anticoagulated) return [];
  if (w.phase && phaseName !== w.phase) return [];
  if (!w.symptomCode) return findings;
  return findings.filter((f) => f.symptomCode === w.symptomCode);
}

function raise(severity: Severity): Severity {
  return SEVERITY_ORDER[Math.min(severityRank(severity) + 1, SEVERITY_ORDER.length - 1)];
}

export type EvaluationResult = {
  severity: Severity;
  winningRuleId: string | null;
  winningRuleClass: number | null;
  rationale: string;
  evaluations: RuleEvaluation[];
};

export function evaluateRules(input: {
  rules: ProcedureRules;
  findings: Finding[];
  recoveryDay: number;
  patient: PatientContext;
  preFilterHit?: PreFilterResult;
  extractionConfidence?: number;
  unmappedCount?: number;
}): EvaluationResult {
  const { rules, findings, recoveryDay, patient, preFilterHit } = input;
  const phase = phaseForDay(rules, recoveryDay);
  const evaluations: RuleEvaluation[] = [];
  const notFired = (r: Rule): RuleEvaluation => ({ ruleId: r.id, fired: false, evidenceFindingIds: [], severityAssigned: null, rationale: r.rationale });

  if (preFilterHit?.hit) {
    evaluations.push({ ruleId: preFilterHit.ruleId, fired: true, evidenceFindingIds: [preFilterHit.finding.symptomCode], severityAssigned: preFilterHit.severity, rationale: preFilterHit.rationale });
    for (const r of rules.rules) evaluations.push(notFired(r));
    return { severity: preFilterHit.severity, winningRuleId: preFilterHit.ruleId, winningRuleClass: 1, rationale: preFilterHit.rationale, evaluations };
  }

  let severity: Severity | null = null;
  let winningRuleId: string | null = null;
  let winningRuleClass: number | null = null;
  let rationale = "";

  for (const r of rules.rules.filter((r) => r.class === 2)) {
    const ev = predicateMatches(r, findings, phase.name, patient);
    const fired = ev.length > 0;
    evaluations.push({ ruleId: r.id, fired, evidenceFindingIds: ev.map((f) => f.symptomCode), severityAssigned: fired ? r.severity : null, rationale: r.rationale });
    if (fired) {
      const raised: Severity = severity === null ? r.severity : maxSeverity(severity, r.severity);
      if (raised !== severity) { winningRuleId = r.id; winningRuleClass = 2; rationale = r.rationale; }
      severity = raised;
    }
  }

  for (const r of rules.rules.filter((r) => r.class === 3)) {
    const ev = predicateMatches(r, findings, phase.name, patient);
    const fired = ev.length > 0;
    evaluations.push({ ruleId: r.id, fired, evidenceFindingIds: ev.map((f) => f.symptomCode), severityAssigned: fired ? r.severity : null, rationale: r.rationale });
    if (fired) {
      const raised: Severity = severity === null ? r.severity : maxSeverity(raise(severity), r.severity);
      if (severity === null || severityRank(raised) > severityRank(severity)) { severity = raised; winningRuleId = r.id; winningRuleClass = 3; rationale = r.rationale; }
    }
  }

  const lowConfidence = (input.extractionConfidence ?? 1) < 0.6;
  const unmapped = (input.unmappedCount ?? 0) > 0;
  for (const r of rules.rules.filter((r) => r.class === 4)) {
    const cond = r.when.extraction ?? r.when.symptomCode ?? "";
    const fired =
      (/no_findings/.test(cond) && findings.length === 0) ||
      (/unmapped/.test(cond) && unmapped) ||
      (/low_extraction_confidence/.test(cond) && lowConfidence);
    evaluations.push({ ruleId: r.id, fired, evidenceFindingIds: [], severityAssigned: fired ? r.severity : null, rationale: r.rationale });
    if (fired && severity === null) { severity = r.severity; winningRuleId = r.id; winningRuleClass = 4; rationale = r.rationale; }
  }

  if (severity === null) {
    return { severity: CLASS_4_DEFAULT_SEVERITY, winningRuleId: null, winningRuleClass: null, rationale: "No rule matched; routing to a nurse rather than reassuring.", evaluations };
  }
  return { severity, winningRuleId, winningRuleClass, rationale, evaluations };
}
