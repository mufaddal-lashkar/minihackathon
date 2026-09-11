import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
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

type Store = { patients: Map<string, Patient>; reports: Map<string, ReportRecord>; db: DatabaseSync };

const g = globalThis as unknown as { __triageStore?: Store };

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export const SEED_PATIENTS: Patient[] = [
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

function openDb(): DatabaseSync {
  const file = process.env.RECOVERWELL_DB ?? path.join(process.cwd(), "data", "recoverwell.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, json TEXT NOT NULL);
  `);
  return db;
}

function init(): Store {
  const db = openDb();
  const patients = new Map<string, Patient>();
  for (const row of db.prepare("SELECT json FROM patients").all() as { json: string }[]) {
    const p = JSON.parse(row.json) as Patient;
    patients.set(p.id, p);
  }
  if (patients.size === 0) {
    const ins = db.prepare("INSERT OR REPLACE INTO patients (id, json) VALUES (?, ?)");
    for (const p of SEED_PATIENTS) { ins.run(p.id, JSON.stringify(p)); patients.set(p.id, p); }
  }
  const reports = new Map<string, ReportRecord>();
  for (const row of db.prepare("SELECT json FROM reports ORDER BY created_at").all() as { json: string }[]) {
    const r = JSON.parse(row.json) as ReportRecord;
    // A report interrupted for review cannot be resumed after a restart (checkpointer is in-memory); close it safely.
    if (r.status === "pending_review") {
      r.status = "complete";
      r.severity = "CALL_CLINIC";
      r.escalationRoute = "call_clinic";
      r.explanation = "A nurse was not able to review this in time. Please call your clinic.";
      r.humanDecision = { action: "override", severity: "CALL_CLINIC", reason: "Review window expired (server restart)", decidedBy: "system", decidedAt: new Date().toISOString() };
    }
    reports.set(r.id, r);
  }
  return { patients, reports, db };
}

export function store(): Store {
  if (!g.__triageStore) g.__triageStore = init();
  return g.__triageStore;
}

export function savePatient(p: Patient) {
  const s = store();
  s.patients.set(p.id, p);
  s.db.prepare("INSERT OR REPLACE INTO patients (id, json) VALUES (?, ?)").run(p.id, JSON.stringify(p));
}

export function saveReport(r: ReportRecord) {
  const s = store();
  s.reports.set(r.id, r);
  s.db.prepare("INSERT OR REPLACE INTO reports (id, created_at, json) VALUES (?, ?, ?)").run(r.id, r.createdAt, JSON.stringify(r));
}

export function recoveryDayFor(p: Patient): number {
  const ms = Date.now() - new Date(p.surgeryDate).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}
