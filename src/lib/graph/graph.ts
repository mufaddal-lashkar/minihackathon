import { StateGraph, START, END, MemorySaver, Command } from "@langchain/langgraph";
import { GraphState, type GraphStateType } from "./state";
import {
  ingestNode, preFilterNode, extractNode, validateNode, evaluateRulesNode, triageNode,
  humanReviewNode, explainNode, notifyCareTeamNode, persistNode,
} from "./nodes";
import { store, type HumanDecision } from "@/lib/db/store";

const g = globalThis as unknown as { __triageCheckpointer?: MemorySaver };
const checkpointer = (g.__triageCheckpointer ??= new MemorySaver());

const afterPreFilter = (s: GraphStateType) => (s.preFilterHit?.hit ? "evaluate_rules" : "extract");
const afterTriage = (s: GraphStateType) => (s.requiresHumanReview ? "human_review" : "explain");
const afterExplain = (s: GraphStateType) => (s.severity === "URGENT_CARE" || s.severity === "EMERGENCY" ? "notify_care_team" : "persist");

export const graph = new StateGraph(GraphState)
  .addNode("ingest", ingestNode)
  .addNode("pre_filter", preFilterNode)
  .addNode("extract", extractNode)
  .addNode("validate", validateNode)
  .addNode("evaluate_rules", evaluateRulesNode)
  .addNode("triage", triageNode)
  .addNode("human_review", humanReviewNode)
  .addNode("explain", explainNode)
  .addNode("notify_care_team", notifyCareTeamNode)
  .addNode("persist", persistNode)
  .addEdge(START, "ingest")
  .addEdge("ingest", "pre_filter")
  .addConditionalEdges("pre_filter", afterPreFilter, ["evaluate_rules", "extract"])
  .addEdge("extract", "validate")
  .addEdge("validate", "evaluate_rules")
  .addEdge("evaluate_rules", "triage")
  .addConditionalEdges("triage", afterTriage, ["human_review", "explain"])
  .addEdge("human_review", "explain")
  .addConditionalEdges("explain", afterExplain, ["notify_care_team", "persist"])
  .addEdge("notify_care_team", "persist")
  .addEdge("persist", END)
  .compile({ checkpointer });

const cfg = (reportId: string) => ({ configurable: { thread_id: `report-${reportId}` } });

export async function runReport(input: { patientId: string; reportId: string; rawText: string; modality?: "structured" | "free_text" | "voice" }) {
  const result = await graph.invoke({ ...input, modality: input.modality ?? "free_text" }, cfg(input.reportId));
  const rec = store().reports.get(input.reportId)!;
  const interrupted = Boolean((result as Record<string, unknown>).__interrupt__);
  return { status: interrupted ? (202 as const) : (200 as const), report: rec };
}

export async function resumeReport(reportId: string, decision: HumanDecision) {
  const snapshot = await graph.getState(cfg(reportId));
  if (!snapshot?.next?.length) return null;
  await graph.invoke(new Command({ resume: decision }), cfg(reportId));
  return store().reports.get(reportId)!;
}
