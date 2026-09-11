import { StateSchema, ReducedValue } from "@langchain/langgraph";
import { z } from "zod";
import { FindingSchema, RuleEvaluationSchema, SeverityEnum } from "@/lib/rules/types";

export const HumanDecisionSchema = z.object({
  action: z.enum(["confirm", "override"]),
  severity: SeverityEnum.optional(),
  reason: z.string().optional(),
  decidedBy: z.string(),
  decidedAt: z.string(),
});

const append = <T>(schema: z.ZodType<T>) =>
  new ReducedValue(schema.array().default(() => []), { reducer: (x: T[], y: T[]) => x.concat(y) });

export const GraphState = new StateSchema({
  patientId: z.string(),
  reportId: z.string(),
  recoveryDay: z.number().default(0),
  procedureCode: z.string().default(""),

  modality: z.enum(["structured", "free_text", "voice"]).default("free_text"),
  rawText: z.string().default(""),

  findings: append(FindingSchema),
  extractionConfidence: z.number().default(1),
  unmappedSpans: append(z.string()),
  preFilterHit: z.any().optional(),
  usedLlm: z.boolean().default(false),

  ruleEvaluations: append(RuleEvaluationSchema),
  severity: SeverityEnum.optional(),
  proposedSeverity: SeverityEnum.optional(),
  winningRuleId: z.string().nullable().optional(),
  winningRuleClass: z.number().nullable().optional(),
  rationale: z.string().default(""),
  requiresHumanReview: z.boolean().default(false),

  humanDecision: HumanDecisionSchema.optional(),

  escalationRoute: z.string().optional(),
  explanation: z.string().optional(),
});

export type GraphStateType = typeof GraphState.State;
