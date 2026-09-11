import { z } from "zod";

export const SeverityEnum = z.enum(["SELF_CARE", "CALL_CLINIC", "URGENT_CARE", "EMERGENCY"]);
export type Severity = z.infer<typeof SeverityEnum>;

export const SEVERITY_ORDER: Severity[] = ["SELF_CARE", "CALL_CLINIC", "URGENT_CARE", "EMERGENCY"];

export function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

export function maxSeverity(a: Severity, b: Severity): Severity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

export const FindingSchema = z.object({
  symptomCode: z.string(),
  site: z.string().optional(),
  severity: z.string().optional(),
  onset: z.string().optional(),
  duration: z.string().optional(),
  laterality: z.string().optional(),
  sourceSpan: z.string().optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const RulePredicateSchema = z.object({
  symptomCode: z.string().optional(),
  phase: z.string().optional(),
  regex: z.string().optional(),
  patientFlag: z.string().optional(),
  extraction: z.string().optional(),
  comorbidity: z.string().optional(),
  ageBandMin: z.number().optional(),
  anticoagulated: z.boolean().optional(),
});
export type RulePredicate = z.infer<typeof RulePredicateSchema>;

export const RuleSchema = z.object({
  id: z.string(),
  class: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  when: RulePredicateSchema,
  severity: SeverityEnum,
  route: z.string(),
  rationale: z.string(),
});
export type Rule = z.infer<typeof RuleSchema>;

export const PhaseSchema = z.object({
  name: z.string(),
  dayStart: z.number(),
  dayEnd: z.number(),
  expectedSymptoms: z.array(z.string()),
  redFlags: z.array(z.string()),
});
export type Phase = z.infer<typeof PhaseSchema>;

export const ProcedureRulesSchema = z.object({
  procedureCode: z.string(),
  phases: z.array(PhaseSchema),
  rules: z.array(RuleSchema),
});
export type ProcedureRules = z.infer<typeof ProcedureRulesSchema>;

export const RuleEvaluationSchema = z.object({
  ruleId: z.string(),
  fired: z.boolean(),
  evidenceFindingIds: z.array(z.string()),
  severityAssigned: SeverityEnum.nullable(),
  rationale: z.string().optional(),
});
export type RuleEvaluation = z.infer<typeof RuleEvaluationSchema>;
