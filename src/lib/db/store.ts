import type { Finding, RuleEvaluation, Severity } from "@/lib/rules/types";

export type Patient = {
  id: string;
  name: string;
  procedureCode: string;
  procedureLabel: string;
  surgeryDate: string; // ISO date
  ageBand: number;
  comorbidities: string[];
  anticoagulated: boolean;
  language: string;
  plan: { title: string; items: string[] }[];
};

export type HumanDecision = {
  action: "confirm" | "override";
  severity?: Severity;
  reason?: string;
  decidedBy: string;
  decidedAt: string;
};

export type ReportRecord = {
  id: string;
  patientId: string;
  recoveryDay: number;
  modality: "structured" | "free_text" | "voice";
  rawText: string;
  createdAt: string;
  status: "complete" | "pending_review";
  severity?: Severity;
  proposedSeverity?: Severity;
  winningRuleId?: string | null;
  winningRuleClass?: number | null;
  rationale?: string;
  escalationRoute?: string;
  explanation?: string;
  findings: Finding[];
  unmappedSpans: string[];
  extractionConfidence: number;
  ruleEvaluations: RuleEvaluation[];
  requiresHuman: boolean;
  humanDecision?: HumanDecision;
  usedLlm: boolean;
};

type Store = { patients: Map<string, Patient>; reports: Map<string, ReportRecord> };

const g = globalThis as unknown as { __triageStore?: Store };

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function seed(): Store {
  const patients: Patient[] = [
    {
      id: "p-asha", name: "Asha Mehta", procedureCode: "appendectomy", procedureLabel: "Laparoscopic appendectomy",
      surgeryDate: daysAgo(4), ageBand: 34, comorbidities: [], anticoagulated: false, language: "en",
      plan: [
        { title: "Wound care", items: ["Keep dressing dry for 48h", "Shower from day 2, pat dry", "No baths or swimming for 2 weeks"] },
        { title: "Activity", items: ["Short walks 3× daily", "No lifting over 5 kg for 2 weeks"] },
        { title: "Medication", items: ["Paracetamol 1 g every 6h as needed", "Ibuprofen 400 mg with food if needed"] },
      ],
    },
    {
      id: "p-ravi", name: "Ravi Iyer", procedureCode: "knee-replacement", procedureLabel: "Total knee replacement (right)",
      surgeryDate: daysAgo(6), ageBand: 72, comorbidities: ["diabetes"], anticoagulated: true, language: "en",
      plan: [
        { title: "Mobility", items: ["Physio exercises 3× daily", "Walk with frame, weight-bear as tolerated", "Ice 20 min after exercise"] },
        { title: "Medication", items: ["Apixaban 2.5 mg twice daily (blood thinner)", "Paracetamol 1 g every 6h"] },
        { title: "Wound care", items: ["Keep dressing on until clinic visit day 10", "Report any leaking"] },
      ],
    },
    {
      id: "p-fatima", name: "Fatima Khan", procedureCode: "c-section", procedureLabel: "Caesarean section",
      surgeryDate: daysAgo(3), ageBand: 29, comorbidities: [], anticoagulated: false, language: "en",
      plan: [
        { title: "Wound care", items: ["Keep incision clean and dry", "Wear loose high-waisted clothing"] },
        { title: "Recovery", items: ["Rest when baby rests", "No driving for 6 weeks", "No lifting heavier than baby"] },
        { title: "Medication", items: ["Paracetamol 1 g every 6h", "Ibuprofen 400 mg every 8h with food"] },
      ],
    },
  ];
  return { patients: new Map(patients.map((p) => [p.id, p])), reports: new Map() };
}

export function store(): Store {
  if (!g.__triageStore) g.__triageStore = seed();
  return g.__triageStore;
}

export function recoveryDayFor(p: Patient): number {
  const ms = Date.now() - new Date(p.surgeryDate).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}
