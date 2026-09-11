import fs from "node:fs";
import path from "node:path";
import { ProcedureRulesSchema, type ProcedureRules, type Phase } from "./types";

const RULES_DIR = path.join(process.cwd(), "data", "rules");

export function loadRules(procedureCode: string): ProcedureRules {
  const file = path.join(RULES_DIR, `${procedureCode}.json`);
  if (!fs.existsSync(file)) throw new Error(`rule_config_missing: no rules for procedure "${procedureCode}"`);
  return ProcedureRulesSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

export function listProcedures(): string[] {
  return JSON.parse(fs.readFileSync(path.join(RULES_DIR, "index.json"), "utf8")).procedures;
}

export function phaseForDay(rules: ProcedureRules, recoveryDay: number): Phase {
  const phase = rules.phases.find((p) => recoveryDay >= p.dayStart && recoveryDay <= p.dayEnd);
  return phase ?? rules.phases[rules.phases.length - 1];
}
