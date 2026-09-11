import { store, type ReportRecord } from "./store";
import { SEVERITY_ORDER, type Severity } from "@/lib/rules/types";

export function dayKey(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function computeStats(reports: ReportRecord[]) {
  const now = Date.now();
  const last7 = [...Array(7)].map((_, i) => { const d = new Date(now - (6 - i) * 86400000); return d.toISOString().slice(0, 10); });
  const byDay = last7.map((iso) => {
    const row = { day: dayKey(iso), SELF_CARE: 0, CALL_CLINIC: 0, URGENT_CARE: 0, EMERGENCY: 0 } as { day: string } & Record<Severity, number>;
    for (const r of reports) if (r.createdAt.slice(0, 10) === iso && r.severity) row[r.severity]++;
    return row;
  });
  const bySeverity = SEVERITY_ORDER.map((s) => ({ severity: s, count: reports.filter((r) => r.severity === s).length }));
  const byClass = [1, 2, 3, 4].map((c) => ({ cls: c, label: ["", "Class 1 · Red flag", "Class 2 · Expectation", "Class 3 · Modifier", "Class 4 · Catch-all"][c], count: reports.filter((r) => (r.winningRuleClass ?? 4) === c).length }));
  const pending = reports.filter((r) => r.status === "pending_review").length;
  const escalated = reports.filter((r) => r.severity === "URGENT_CARE" || r.severity === "EMERGENCY").length;
  const reviewed = reports.filter((r) => r.humanDecision && r.humanDecision.decidedBy !== "system");
  const overrides = reviewed.filter((r) => r.humanDecision?.action === "override").length;
  const decisionMins = reviewed.map((r) => (new Date(r.humanDecision!.decidedAt).getTime() - new Date(r.createdAt).getTime()) / 60000).filter((m) => m >= 0);
  const medianDecision = decisionMins.length ? decisionMins.sort((a, b) => a - b)[Math.floor(decisionMins.length / 2)] : null;
  const today = reports.filter((r) => r.createdAt.slice(0, 10) === new Date(now).toISOString().slice(0, 10)).length;
  const llmShare = reports.length ? Math.round((reports.filter((r) => r.usedLlm).length / reports.length) * 100) : 0;
  return { byDay, bySeverity, byClass, pending, escalated, reviewed: reviewed.length, overrides, medianDecision, today, total: reports.length, llmShare };
}

export function reportsFor(patientId?: string) {
  const all = [...store().reports.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return patientId ? all.filter((r) => r.patientId === patientId) : all;
}
