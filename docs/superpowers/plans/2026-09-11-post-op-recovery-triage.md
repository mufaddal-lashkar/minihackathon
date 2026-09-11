# Post-Operative Recovery Triage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a patient-facing post-op recovery triage PWA whose severity decisions come from a deterministic rule engine, with an LLM used only to extract findings from free text and to phrase the explanation — never to assign severity.

**Architecture:** A LangGraph JS `StateGraph` runs one graph execution per symptom report (`thread_id = report-{uuid}`). A deterministic `pre_filter` node scans raw text for Class-1 red flags *before* any LLM call. Non-Class-1 text goes to a Gemini `extract` node, then a deterministic `validate` node enforces `sourceSpan` grounding. A deterministic `evaluate_rules` node assigns severity from a JSON rule table; `triage` picks the route. The graph bifurcates: escalations return `200` immediately with no human gate, uncertain reassurances `interrupt()` and return `202`.

**Tech Stack:** Next.js 15 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · LangGraph JS (`@langchain/langgraph`) · `@langchain/google-genai` · Prisma + SQLite · Vitest

**Spec:** `docs/superpowers/specs/2026-09-11-post-op-recovery-triage-design.md`

## Global Constraints

- **Severity ladder is fixed and ordered:** `SELF_CARE` < `CALL_CLINIC` < `URGENT_CARE` < `EMERGENCY`. Exactly four levels. Copied verbatim into the enum; never extended.
- **The LLM never assigns severity.** It extracts findings and renders explanations. Any code path where an LLM output feeds `severity` directly is a bug.
- **Class 1 is caught before any LLM call.** `pre_filter` runs on `rawText` in `ingest → pre_filter → …`. Gemini being down must not change whether a Class-1 phrase escalates.
- **Escalations are never gated; reassurances always are.** `severity >= URGENT_CARE` → `200`, no interrupt. `severity <= CALL_CLINIC` + `requiresHumanReview` → `202` via `interrupt()`.
- **HTTP contract:** `200` = terminal verdict, `202` = `{ reportId, status: "pending_review" }`. `202` is returned **iff** `__interrupt__` is present — not on severity, not on confidence.
- **`RuleEvaluation` is a table, not a boolean.** Every candidate rule writes a row whether it fired or not.
- **Colour theme: teal + white.** Brand/primary is teal. Severity colours (`amber` / `orange` / `red`) are reserved for the severity ladder and never used decoratively.
- **Node 20.x+, npm.** Single localhost Node process — `MemorySaver` is in-process and `POST /reports` and `POST /reports/:id/review` must hit the same process.
- **Testing framework is Vitest** for unit/integration; Playwright only if a UI smoke test is added in Phase 9.
- **Commit after every task.** Conventional commits (`feat:`, `test:`, `chore:`, `fix:`). Push at the end of each phase (`git push`), and no earlier — the repo currently sits ahead of `origin/main` by 1 commit from the spec work.
- **Never commit `.env.local`.** `GEMINI_API_KEY` lives there only.

---

## Phase 0 — Rule table and fixture table (no application code)

Per the spec's §9 milestone 0: the rule data and the hand-asserted fixture table come first, because they prove the demo beats can fire and they are the input to Phase 2.

### Task 0.1: Rule table as JSON for three procedures

**Files:**
- Create: `data/rules/appendectomy.json`
- Create: `data/rules/knee-replacement.json`
- Create: `data/rules/c-section.json`
- Create: `data/rules/index.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the on-disk shape every later phase reads. Each procedure file is `{ procedureCode: string, phases: Phase[], rules: Rule[] }` where `Rule = { id, class: 1|2|3|4, when: RulePredicate, severity: Severity, route: string, rationale: string }` and `Phase = { name, dayStart, dayEnd, expectedSymptoms: string[], redFlags: string[] }`.

- [ ] **Step 1: Write `data/rules/appendectomy.json`**

Include at minimum these Class-2 rules (the PS's actual hard problem — procedure-and-day-specific expectations):

```json
{
  "procedureCode": "appendectomy",
  "phases": [
    { "name": "early", "dayStart": 0, "dayEnd": 3,
      "expectedSymptoms": ["serous_drainage", "mild_incisional_pain", "low_grade_temp"],
      "redFlags": ["fever_38", "wound_dehiscence", "soaking_bleeding"] },
    { "name": "healing", "dayStart": 4, "dayEnd": 14,
      "expectedSymptoms": ["mild_incisional_pain"],
      "redFlags": ["fever_38", "wound_dehiscence", "soaking_bleeding", "spreading_redness"] }
  ],
  "rules": [
    { "id": "app-2-001", "class": 2,
      "when": { "symptomCode": "serous_drainage", "phase": "early" },
      "severity": "SELF_CARE", "route": "self_care",
      "rationale": "Serous drainage is expected on days 0-3 after appendectomy." },
    { "id": "app-2-002", "class": 2,
      "when": { "symptomCode": "serous_drainage", "phase": "healing" },
      "severity": "CALL_CLINIC", "route": "call_clinic",
      "rationale": "Drainage persisting past day 3 is not expected; needs clinic review." },
    { "id": "app-2-003", "class": 2,
      "when": { "symptomCode": "spreading_redness", "phase": "healing" },
      "severity": "URGENT_CARE", "route": "urgent_care",
      "rationale": "Spreading wound redness after day 3 suggests infection." }
  ]
}
```

- [ ] **Step 2: Write `data/rules/knee-replacement.json`**

Class-2 rules must include: `mild_swelling` expected through day 14; `calf_pain_with_swelling` is **Class 1** and lives in the pre-filter, not here; `decreased_rom` at day 7+ → `CALL_CLINIC`; `wound_drainage` past day 5 → `URGENT_CARE`.

- [ ] **Step 3: Write `data/rules/c-section.json`**

Class-2 rules must include: `lochia_heavy` expected days 0–10, `lochia_heavy` past day 14 → `CALL_CLINIC`; `incisional_pain` expected through day 10; `calf_pain_with_swelling` → Class 1 (pre-filter); `breast_engorgement` → `SELF_CARE`.

- [ ] **Step 4: Write `data/rules/index.json`**

```json
{ "procedures": ["appendectomy", "knee-replacement", "c-section"] }
```

- [ ] **Step 5: Commit**

```bash
git add data/rules
git commit -m "feat(rules): add Class 1/2 rule tables for appendectomy, knee replacement, C-section"
```

---

### Task 0.2: Fixture table asserted by hand

**Files:**
- Create: `data/fixtures/triage-fixtures.json`
- Create: `docs/superpowers/plans/fixture-assertion.md`

**Interfaces:**
- Consumes: `data/rules/*.json` from Task 0.1.
- Produces: the fixture shape every later test reads: `{ id, procedureCode, recoveryDay, rawText, expectedClass: 1|2|3|4, expectedRoute: "200_escalation" | "202_pending" | "200_self_care", expectedSeverity: Severity }`.

- [ ] **Step 1: Author ~20 fixtures**

Must include, at minimum:

```json
[
  { "id": "fx-01", "procedureCode": "appendectomy", "recoveryDay": 4,
    "rawText": "my calf is sore and puffy",
    "expectedClass": 1, "expectedRoute": "200_escalation", "expectedSeverity": "URGENT_CARE" },
  { "id": "fx-02", "procedureCode": "appendectomy", "recoveryDay": 4,
    "rawText": "my wound is a bit more pink than yesterday",
    "expectedClass": 2, "expectedRoute": "202_pending", "expectedSeverity": "CALL_CLINIC" },
  { "id": "fx-03", "procedureCode": "appendectomy", "recoveryDay": 2,
    "rawText": "there is some clear fluid on the dressing",
    "expectedClass": 2, "expectedRoute": "200_self_care", "expectedSeverity": "SELF_CARE" },
  { "id": "fx-04", "procedureCode": "appendectomy", "recoveryDay": 10,
    "rawText": "there is some clear fluid on the dressing",
    "expectedClass": 2, "expectedRoute": "202_pending", "expectedSeverity": "CALL_CLINIC" },
  { "id": "fx-05", "procedureCode": "appendectomy", "recoveryDay": 4,
    "rawText": "I have chest pain",
    "expectedClass": 1, "expectedRoute": "200_escalation", "expectedSeverity": "EMERGENCY" },
  { "id": "fx-06", "procedureCode": "appendectomy", "recoveryDay": 4,
    "rawText": "I feel a bit tired today",
    "expectedClass": 4, "expectedRoute": "202_pending", "expectedSeverity": "CALL_CLINIC" }
]
```

The remaining ~14 fixtures cover: soaking-through bleeding, wound dehiscence, syncope, confusion, inability to urinate, dyspnea, fever ≥ 38 °C, anticoagulated + bleeding (Class 3 raise), diabetic + wound redness (Class 3 raise), age ≥ 70 + new confusion (Class 3 raise), knee-replacement day-7 decreased ROM, C-section day-2 lochia, C-section day-16 lochia, and a voice-modality duplicate of `fx-01`.

- [ ] **Step 2: Hand-assert every fixture against the spec**

Write `docs/superpowers/plans/fixture-assertion.md` with one line per fixture in this form:

```
fx-01 | calf is sore and puffy | §5 Class 1 (calf pain + swelling) | §8.6 step 3 escalation | OK
fx-02 | wound a bit more pink | §5 Class 2 (spreading redness, healing phase) | §8.3 + §8.6 step 4 → 202 | OK
```

Read `docs/superpowers/specs/2026-09-11-post-op-recovery-triage-design.md` §5, §8.3, and §8.6 while doing this. Any fixture that cannot be traced to a spec line is either a bad fixture or a spec gap — resolve it before proceeding.

- [ ] **Step 3: Commit**

```bash
git add data/fixtures docs/superpowers/plans/fixture-assertion.md
git commit -m "test(rules): add ~20-phrase fixture table hand-asserted against spec §5/§8.3/§8.6"
```

---

## Phase 1 — Scaffold

### Task 1.1: Scaffold Next.js in place

**Files:**
- Create (generated): `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: a running `npm run dev` on port 3000.

- [ ] **Step 1: Scaffold with the official command**

Use the generator rather than hand-writing config files. The directory is non-empty (`docs/`, `README.md`, `.git`), so `create-next-app` will refuse to run into `.` unless it is allowed to merge — if it refuses, scaffold into a temp dir and move the generated files in.

```bash
cd /e/projects/hackathon/minihackathon
npx create-next-app@latest . --typescript --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

Expected: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/*`, `postcss.config.mjs`, `.gitignore` created; `docs/` and `README.md` untouched.

- [ ] **Step 2: Verify the dev server boots**

```bash
npm run dev
```

Expected: `Ready on http://localhost:3000`. Stop it.

- [ ] **Step 3: Verify the production build is clean**

```bash
npm run build
```

Expected: compiles with no type errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 app router with TypeScript and Tailwind"
```

---

### Task 1.2: Prisma + SQLite schema

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db/client.ts`
- Create: `.env.local` (gitignored — verify)

**Interfaces:**
- Consumes: nothing.
- Produces: `prisma` client singleton exported as `db` from `src/lib/db/client.ts`, and the eight models from spec §4: `Patient`, `RecoveryPlan`, `Phase`, `Task`, `SymptomReport`, `Finding`, `RuleEvaluation`, `TriageOutcome`.

- [ ] **Step 1: Install Prisma**

```bash
npm install prisma @prisma/client
npx prisma init --datasource-provider sqlite
```

- [ ] **Step 2: Write `prisma/schema.prisma`**

Model all eight entities from spec §4. The load-bearing fields:

```prisma
model Finding {
  id          String  @id @default(cuid())
  reportId    String
  report      SymptomReport @relation(fields: [reportId], references: [id])
  symptomCode String
  site        String?
  severity    String?
  onset       String?
  duration    String?
  laterality  String?
  sourceSpan  String?          // null for chip-intake findings; literal substring of rawText for free text
}

model RuleEvaluation {
  id               String  @id @default(cuid())
  reportId         String
  report           SymptomReport @relation(fields: [reportId], references: [id])
  ruleId           String
  fired            Boolean
  evidenceFindingIds String  // JSON-encoded string[] — SQLite has no native array
  severityAssigned String?
}
```

`TriageOutcome` carries `severity`, `winningRuleId` (nullable — null means the Class-4 default), `escalationRoute`, `explanationText`, `explanationLanguage`, `requiresHuman`, `humanDecision` (JSON string, nullable).

- [ ] **Step 3: Run the migration**

```bash
npx prisma migrate dev --name init
```

Expected: `prisma/dev.db` created; `prisma generate` runs automatically.

- [ ] **Step 4: Write `src/lib/db/client.ts`**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

- [ ] **Step 5: Confirm `.env.local` and `prisma/dev.db` are gitignored**

```bash
git check-ignore -v .env.local prisma/dev.db
```

Expected: both print a matching `.gitignore` rule. If either does not, add it to `.gitignore` before committing.

- [ ] **Step 6: Commit**

```bash
git add prisma src/lib/db package.json package-lock.json .gitignore
git commit -m "feat(db): add Prisma SQLite schema for the eight domain entities"
```

---

### Task 1.3: Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` runs Vitest once; `npm run test:watch` watches.

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest @vitest/coverage-v8 vite-tsconfig-paths
```

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: [],
  },
});
```

- [ ] **Step 3: Add scripts to `package.json`**

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Add a smoke test and verify it fails-then-passes**

Create `test/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json test/smoke.test.ts
git commit -m "chore(test): add Vitest with tsconfig path resolution"
```

---

## Phase 2 — Rule engine (deterministic, no graph, no LLM)

This is the spine. Per spec §9, it must exist and be tested before any LLM touches the system.

### Task 2.1: Domain types and severity ladder

**Files:**
- Create: `src/lib/rules/types.ts`
- Test: `src/lib/rules/severity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Severity` = `"SELF_CARE" | "CALL_CLINIC" | "URGENT_CARE" | "EMERGENCY"`
  - `SEVERITY_ORDER: Severity[]` (ascending), `severityRank(s: Severity): number`, `maxSeverity(a, b): Severity`
  - `RulePredicate`, `Rule`, `Phase`, `ProcedureRules`, `Finding`, `RuleEvaluation`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/rules/severity.test.ts
import { describe, it, expect } from "vitest";
import { severityRank, maxSeverity } from "./types";

describe("severity ladder", () => {
  it("ranks the four levels in order", () => {
    expect(severityRank("SELF_CARE")).toBeLessThan(severityRank("CALL_CLINIC"));
    expect(severityRank("CALL_CLINIC")).toBeLessThan(severityRank("URGENT_CARE"));
    expect(severityRank("URGENT_CARE")).toBeLessThan(severityRank("EMERGENCY"));
  });

  it("maxSeverity returns the higher level, never the lower", () => {
    expect(maxSeverity("EMERGENCY", "SELF_CARE")).toBe("EMERGENCY");
    expect(maxSeverity("CALL_CLINIC", "URGENT_CARE")).toBe("URGENT_CARE");
    expect(maxSeverity("SELF_CARE", "SELF_CARE")).toBe("SELF_CARE");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- severity`
Expected: FAIL — cannot resolve `./types`.

- [ ] **Step 3: Write `src/lib/rules/types.ts`**

```ts
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

export type RuleEvaluation = {
  ruleId: string;
  fired: boolean;
  evidenceFindingIds: string[];
  severityAssigned: Severity | null;
};
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- severity`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules
git commit -m "feat(rules): add domain types and the fixed four-level severity ladder"
```

---

### Task 2.2: Class-1 pre-filter

This is the node that makes the spec's Claim 1 true: red flags are caught before any LLM call.

**Files:**
- Create: `src/lib/rules/class1-pre-filter.ts`
- Test: `src/lib/rules/class1-pre-filter.test.ts`

**Interfaces:**
- Consumes: `Finding`, `Severity` from `./types`.
- Produces: `preFilter(rawText: string): { hit: true; finding: Finding; severity: Severity; ruleId: string } | { hit: false }`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/rules/class1-pre-filter.test.ts
import { describe, it, expect } from "vitest";
import { preFilter } from "./class1-pre-filter";

describe("Class-1 pre-filter", () => {
  it("catches calf pain + swelling and escalates", () => {
    const r = preFilter("my calf is sore and puffy");
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.severity).toBe("URGENT_CARE");
      expect(r.finding.sourceSpan).toBeTruthy();
      expect("my calf is sore and puffy".includes(r.finding.sourceSpan!)).toBe(true);
    }
  });

  it("catches chest pain at EMERGENCY", () => {
    const r = preFilter("I have chest pain since this morning");
    expect(r.hit).toBe(true);
    if (r.hit) expect(r.severity).toBe("EMERGENCY");
  });

  it("catches dyspnea, syncope, confusion, dehiscence, soaking bleeding, retention", () => {
    expect(preFilter("I can't breathe properly").hit).toBe(true);
    expect(preFilter("I passed out earlier").hit).toBe(true);
    expect(preFilter("I feel confused and not making sense").hit).toBe(true);
    expect(preFilter("my wound has opened up").hit).toBe(true);
    expect(preFilter("the dressing is soaked through with blood").hit).toBe(true);
    expect(preFilter("I haven't been able to pee all day").hit).toBe(true);
  });

  it("does not fire on an ordinary ambiguous symptom", () => {
    expect(preFilter("my wound is a bit more pink than yesterday").hit).toBe(false);
    expect(preFilter("I feel a bit tired today").hit).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- class1`
Expected: FAIL — cannot resolve `./class1-pre-filter`.

- [ ] **Step 3: Write `src/lib/rules/class1-pre-filter.ts`**

```ts
import type { Finding, Severity } from "./types";

type Class1Pattern = {
  ruleId: string;
  symptomCode: string;
  severity: Severity;
  // Each entry is [regex, minimumMatches]. A pattern fires when at least
  // `minMatches` of its regexes match, so "calf" alone is not enough —
  // "calf" AND ("sore"|"swollen"|"puffy") is.
  require: RegExp[];
  minMatches: number;
};

const PATTERNS: Class1Pattern[] = [
  { ruleId: "c1-calf",   symptomCode: "calf_pain_with_swelling", severity: "URGENT_CARE",
    require: [/\bcalf\b/i, /(sore|swell|swollen|puffy|tender|hot)/i], minMatches: 2 },
  { ruleId: "c1-chest",  symptomCode: "chest_pain",   severity: "EMERGENCY",
    require: [/(chest pain|chest is tight|pressure in my chest|crushing chest)/i], minMatches: 1 },
  { ruleId: "c1-breath", symptomCode: "dyspnea",      severity: "EMERGENCY",
    require: [/(can'?t breathe|cannot breathe|short of breath|trouble breathing|breathless)/i], minMatches: 1 },
  { ruleId: "c1-bleed",  symptomCode: "soaking_bleeding", severity: "URGENT_CARE",
    require: [/(soak\w*|dripping|won'?t stop bleeding|blood running)/i, /(blood|bleed\w*|dressing|gauze)/i], minMatches: 2 },
  { ruleId: "c1-dehisc", symptomCode: "wound_dehiscence", severity: "URGENT_CARE",
    require: [/(wound|incision|stitches|staples)/i, /(open\w*|split|come apart|came apart|gaping|opened up)/i], minMatches: 2 },
  { ruleId: "c1-sync",   symptomCode: "syncope",      severity: "EMERGENCY",
    require: [/(passed out|fainted|blacked out|lost consciousness|went down)/i], minMatches: 1 },
  { ruleId: "c1-conf",   symptomCode: "confusion",    severity: "URGENT_CARE",
    require: [/(confus\w*|disorient\w*|not making sense|doesn'?t know where)/i], minMatches: 1 },
  { ruleId: "c1-urine",  symptomCode: "urinary_retention", severity: "URGENT_CARE",
    require: [/(can'?t (pee|urinate)|unable to (pee|urinate)|haven'?t (peed|urinated)|not (peed|urinated))/i], minMatches: 1 },
  { ruleId: "c1-fever",  symptomCode: "fever_38",     severity: "URGENT_CARE",
    require: [/(3[89](\.\d+)?\s*(°?\s*C|celsius)?|fever of 3[89]|temp\w* (of|is) 3[89])/i], minMatches: 1 },
];

export type PreFilterResult =
  | { hit: true; finding: Finding; severity: Severity; ruleId: string }
  | { hit: false };

export function preFilter(rawText: string): PreFilterResult {
  for (const p of PATTERNS) {
    const matched = p.require.filter((re) => re.test(rawText));
    if (matched.length < p.minMatches) continue;

    // sourceSpan must be a literal substring of rawText (spec §6.2 validate).
    const spanMatch = matched[0].exec(rawText);
    const sourceSpan = spanMatch ? spanMatch[0] : rawText.slice(0, 40);

    return {
      hit: true,
      ruleId: p.ruleId,
      severity: p.severity,
      finding: { symptomCode: p.symptomCode, sourceSpan },
    };
  }
  return { hit: false };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- class1`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules/class1-pre-filter.ts src/lib/rules/class1-pre-filter.test.ts
git commit -m "feat(rules): add deterministic Class-1 pre-filter that runs before any LLM call"
```

---

### Task 2.3: Rule loader and evaluator

**Files:**
- Create: `src/lib/rules/load-rules.ts`
- Create: `src/lib/rules/evaluator.ts`
- Test: `src/lib/rules/evaluator.test.ts`

**Interfaces:**
- Consumes: `ProcedureRules`, `Finding`, `RuleEvaluation`, `Severity`, `maxSeverity` from `./types`; `preFilter` from `./class1-pre-filter`.
- Produces:
  - `loadRules(procedureCode: string): ProcedureRules`
  - `phaseForDay(rules: ProcedureRules, recoveryDay: number): Phase`
  - `evaluateRules(input: { rules: ProcedureRules; findings: Finding[]; recoveryDay: number; patient: PatientContext; preFilterHit?: PreFilterResult }): { severity: Severity; winningRuleId: string | null; evaluations: RuleEvaluation[] }`
  - `PatientContext = { ageBand: number; comorbidities: string[]; anticoagulated: boolean }`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/rules/evaluator.test.ts
import { describe, it, expect } from "vitest";
import { evaluateRules } from "./evaluator";
import { loadRules } from "./load-rules";
import { preFilter } from "./class1-pre-filter";

const healthy = { ageBand: 40, comorbidities: [], anticoagulated: false };

describe("evaluateRules", () => {
  it("Class 1 beats everything and is the winning rule", () => {
    const rules = loadRules("appendectomy");
    const hit = preFilter("my calf is sore and puffy");
    const out = evaluateRules({
      rules, findings: [], recoveryDay: 4, patient: healthy,
      preFilterHit: hit,
    });
    expect(out.severity).toBe("URGENT_CARE");
    expect(out.winningRuleId).toBe("c1-calf");
  });

  it("Class 2 severity flips on recovery day for the same symptom", () => {
    const rules = loadRules("appendectomy");
    const findings = [{ symptomCode: "serous_drainage" }];

    const day2 = evaluateRules({ rules, findings, recoveryDay: 2, patient: healthy });
    const day10 = evaluateRules({ rules, findings, recoveryDay: 10, patient: healthy });

    expect(day2.severity).toBe("SELF_CARE");
    expect(day10.severity).toBe("CALL_CLINIC");
  });

  it("Class 3 raises severity but never lowers it", () => {
    const rules = loadRules("appendectomy");
    const findings = [{ symptomCode: "serous_drainage" }];
    const anticoagulated = { ageBand: 40, comorbidities: [], anticoagulated: true };
    const out = evaluateRules({
      rules, findings: [...findings, { symptomCode: "bleeding" }],
      recoveryDay: 2, patient: anticoagulated,
    });
    expect(["URGENT_CARE", "EMERGENCY"]).toContain(out.severity);
  });

  it("writes a RuleEvaluation row for every candidate rule, fired or not", () => {
    const rules = loadRules("appendectomy");
    const out = evaluateRules({ rules, findings: [{ symptomCode: "serous_drainage" }], recoveryDay: 2, patient: healthy });
    expect(out.evaluations.length).toBeGreaterThan(0);
    expect(out.evaluations.some((e) => e.fired === false)).toBe(true);
  });

  it("returns the Class-4 default when nothing fires", () => {
    const rules = loadRules("appendectomy");
    const out = evaluateRules({ rules, findings: [], recoveryDay: 4, patient: healthy });
    expect(out.severity).toBe("CALL_CLINIC");
    expect(out.winningRuleId).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- evaluator`
Expected: FAIL — cannot resolve `./evaluator`.

- [ ] **Step 3: Write `src/lib/rules/load-rules.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { ProcedureRulesSchema, type ProcedureRules, type Phase } from "./types";

const RULES_DIR = path.join(process.cwd(), "data", "rules");

export function loadRules(procedureCode: string): ProcedureRules {
  const file = path.join(RULES_DIR, `${procedureCode}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`rule_config_missing: no rules for procedure "${procedureCode}"`);
  }
  return ProcedureRulesSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

export function phaseForDay(rules: ProcedureRules, recoveryDay: number): Phase {
  const phase = rules.phases.find((p) => recoveryDay >= p.dayStart && recoveryDay <= p.dayEnd);
  if (!phase) throw new Error(`rule_config_missing: no phase covers day ${recoveryDay}`);
  return phase;
}
```

- [ ] **Step 4: Write `src/lib/rules/evaluator.ts`**

```ts
import type { Finding, ProcedureRules, Rule, RuleEvaluation, Severity } from "./types";
import { maxSeverity, severityRank } from "./types";
import { phaseForDay } from "./load-rules";
import type { PreFilterResult } from "./class1-pre-filter";

export type PatientContext = {
  ageBand: number;
  comorbidities: string[];
  anticoagulated: boolean;
};

const CLASS_4_DEFAULT_SEVERITY: Severity = "CALL_CLINIC";

function predicateMatches(
  rule: Rule,
  findings: Finding[],
  phaseName: string,
  patient: PatientContext,
): Finding[] {
  return findings.filter((f) => {
    const w = rule.when;
    if (w.symptomCode && f.symptomCode !== w.symptomCode) return false;
    if (w.phase && phaseName !== w.phase) return false;
    if (w.comorbidity && !patient.comorbidities.includes(w.comorbidity)) return false;
    if (w.ageBandMin !== undefined && patient.ageBand < w.ageBandMin) return false;
    if (w.anticoagulated !== undefined && patient.anticoagulated !== w.anticoagulated) return false;
    return true;
  });
}

function raise(severity: Severity): Severity {
  const i = severityRank(severity);
  return i >= severityRank("EMERGENCY") ? "EMERGENCY" : (["SELF_CARE","CALL_CLINIC","URGENT_CARE","EMERGENCY"] as Severity[])[i + 1];
}

export function evaluateRules(input: {
  rules: ProcedureRules;
  findings: Finding[];
  recoveryDay: number;
  patient: PatientContext;
  preFilterHit?: PreFilterResult;
}) {
  const { rules, findings, recoveryDay, patient, preFilterHit } = input;
  const phase = phaseForDay(rules, recoveryDay);
  const evaluations: RuleEvaluation[] = [];

  // --- Class 1: pre-filter short-circuit. Absolute. ---
  if (preFilterHit?.hit) {
    evaluations.push({
      ruleId: preFilterHit.ruleId,
      fired: true,
      evidenceFindingIds: [],
      severityAssigned: preFilterHit.severity,
    });
    for (const r of rules.rules.filter((r) => r.class !== 1)) {
      evaluations.push({ ruleId: r.id, fired: false, evidenceFindingIds: [], severityAssigned: null });
    }
    return {
      severity: preFilterHit.severity,
      winningRuleId: preFilterHit.ruleId,
      winningRuleClass: 1,
      evaluations,
    };
  }

  let severity: Severity | null = null;
  let winningRuleId: string | null = null;
  let winningRuleClass: number | null = null;

  // --- Class 2: procedure-and-day-specific expectations ---
  for (const r of rules.rules.filter((r) => r.class === 2)) {
    const ev = predicateMatches(r, findings, phase.name, patient);
    const fired = ev.length > 0;
    evaluations.push({
      ruleId: r.id, fired,
      evidenceFindingIds: ev.map((f) => f.symptomCode),
      severityAssigned: fired ? r.severity : null,
    });
    if (fired) {
      const raised = severity === null ? r.severity : maxSeverity(severity, r.severity);
      if (raised !== severity) {
        winningRuleId = r.id;
        winningRuleClass = 2;
      }
      severity = raised;
    }
  }

  // --- Class 3: modifiers, raise-only ---
  for (const r of rules.rules.filter((r) => r.class === 3)) {
    const ev = predicateMatches(r, findings, phase.name, patient);
    const fired = ev.length > 0;
    evaluations.push({
      ruleId: r.id, fired,
      evidenceFindingIds: ev.map((f) => f.symptomCode),
      severityAssigned: fired ? r.severity : null,
    });
    if (fired && severity !== null) {
      const raised = raise(severity);
      if (severityRank(raised) > severityRank(severity)) {
        severity = raised;
        winningRuleId = r.id;
        winningRuleClass = 3;
      }
    }
  }

  // --- Class 4: catch-all ---
  for (const r of rules.rules.filter((r) => r.class === 4)) {
    const fired =
      (r.when.symptomCode === "__no_findings__" && findings.length === 0) ||
      (r.when.symptomCode === "__unmapped__" && findings.some((f) => !f.symptomCode));
    evaluations.push({ ruleId: r.id, fired, evidenceFindingIds: [], severityAssigned: fired ? r.severity : null });
    if (fired && severity === null) {
      severity = r.severity;
      winningRuleId = r.id;
      winningRuleClass = 4;
    }
  }

  if (severity === null) {
    return {
      severity: CLASS_4_DEFAULT_SEVERITY,
      winningRuleId: null,
      winningRuleClass: null,
      evaluations,
    };
  }
  return { severity, winningRuleId, winningRuleClass, evaluations };
}
```

Add a Class-4 rule to each `data/rules/*.json` with `when.symptomCode: "__no_findings__"` so the table is complete.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm test -- evaluator`
Expected: 5 passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rules src/../data/rules
git commit -m "feat(rules): add rule loader and Class 1-4 evaluator with raise-only modifiers"
```

---

### Task 2.4: Fixture table as an executable test

**Files:**
- Create: `test/fixtures.test.ts`

**Interfaces:**
- Consumes: `evaluateRules`, `loadRules`, `preFilter`; `data/fixtures/triage-fixtures.json`.
- Produces: proof that every hand-asserted fixture routes as the spec says.

- [ ] **Step 1: Write the test**

```ts
// test/fixtures.test.ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { preFilter } from "@/lib/rules/class1-pre-filter";
import { loadRules } from "@/lib/rules/load-rules";
import { evaluateRules } from "@/lib/rules/evaluator";

type Fixture = {
  id: string; procedureCode: string; recoveryDay: number; rawText: string;
  expectedClass: 1 | 2 | 3 | 4;
  expectedRoute: "200_escalation" | "202_pending" | "200_self_care";
  expectedSeverity: string;
};

const fixtures: Fixture[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data/fixtures/triage-fixtures.json"), "utf8"),
);

const healthy = { ageBand: 40, comorbidities: [], anticoagulated: false };

describe("fixture table", () => {
  it.each(fixtures)("$id routes as expected", (fx) => {
    const hit = preFilter(fx.rawText);
    const rules = loadRules(fx.procedureCode);
    const out = evaluateRules({
      rules, findings: [], recoveryDay: fx.recoveryDay, patient: healthy, preFilterHit: hit,
    });
    const route =
      out.severity === "SELF_CARE" ? "200_self_care"
      : out.severity === "CALL_CLINIC" ? "202_pending"
      : "200_escalation";

    expect(out.severity).toBe(fx.expectedSeverity);
    expect(route).toBe(fx.expectedRoute);
  });
});
```

Note: fixtures whose expected class is 2 or 4 and whose text is *not* a Class-1 phrase will not have findings injected here (no LLM yet). For those, add a `seededFindings` field to the fixture JSON carrying the `symptomCode`s the extractor would produce, and spread it into `findings`. Update `data/fixtures/triage-fixtures.json` accordingly before running.

- [ ] **Step 2: Run it**

Run: `npm test -- fixtures`
Expected: all fixtures pass. Any failure is a real disagreement between the rule table and the spec — fix whichever is wrong.

- [ ] **Step 3: Commit**

```bash
git add data/fixtures/triage-fixtures.json test/fixtures.test.ts
git commit -m "test(rules): assert the full fixture table against the evaluator"
```

---

## Phase 3 — Graph and API vertical slice (stubbed LLM)

Per spec §9 milestone 3: stub the extractor and explainer, wire `pre_filter` + `POST /api/reports` + `interrupt()`, and verify `200`/`202`. **First demoable milestone.**

### Task 3.1: Graph state schema

**Files:**
- Create: `src/lib/graph/state.ts`
- Test: `src/lib/graph/state.test.ts`

**Interfaces:**
- Consumes: `FindingSchema`, `SeverityEnum`, `RuleEvaluation` from `@/lib/rules/types`.
- Produces: `GraphState` (`StateSchema`) and `VitalsSchema`, matching spec §6.3 exactly.

- [ ] **Step 1: Install LangGraph**

```bash
npm install @langchain/langgraph @langchain/core zod
```

- [ ] **Step 2: Write `src/lib/graph/state.ts`**

Port spec §6.3 verbatim. The three `ReducedValue` array fields (`findings`, `unmappedSpans`, `ruleEvaluations`) use append-only reducers:

```ts
import { StateSchema, ReducedValue } from "@langchain/langgraph";
import { z } from "zod";
import { FindingSchema, RuleEvaluationSchema, SeverityEnum } from "@/lib/rules/types";

export const VitalsSchema = z.object({
  temperatureC: z.number().optional(),
  heartRate: z.number().optional(),
  systolicBp: z.number().optional(),
  spo2: z.number().optional(),
});

export const HumanDecisionSchema = z.object({
  action: z.enum(["confirm", "edit", "override"]),
  severity: SeverityEnum.optional(),
  reason: z.string().optional(),
  decidedBy: z.string(),
  decidedAt: z.string(),
});

const append = <T>(schema: z.ZodType<T>) =>
  new ReducedValue(schema.array().default(() => []), {
    reducer: (x: T[], y: T[]) => x.concat(y),
  });

export const GraphState = new StateSchema({
  patientId: z.string(),
  reportId: z.string(),
  recoveryDay: z.number(),

  modality: z.enum(["structured", "free_text", "voice"]),
  rawText: z.string(),
  structuredAnswers: z.record(z.string(), z.unknown()).optional(),
  vitals: VitalsSchema.optional(),

  findings: append(FindingSchema),
  extractionConfidence: z.number().default(1),
  unmappedSpans: append(z.string()),

  ruleEvaluations: append(RuleEvaluationSchema),
  severity: SeverityEnum.optional(),
  winningRuleId: z.string().optional(),
  // Class of the rule that set the final severity (1/2/3/4), or null for the
  // Class-4 default. Last-write-wins scalar, NOT a ReducedValue.
  winningRuleClass: z.number().optional(),
  requiresHumanReview: z.boolean().default(false),

  humanDecision: HumanDecisionSchema.optional(),

  escalationRoute: z.string().optional(),
  explanation: z.string().optional(),
});

export type GraphStateType = typeof GraphState.State;
```

Add `RuleEvaluationSchema` to `src/lib/rules/types.ts`:

```ts
export const RuleEvaluationSchema = z.object({
  ruleId: z.string(),
  fired: z.boolean(),
  evidenceFindingIds: z.array(z.string()),
  severityAssigned: SeverityEnum.nullable(),
});
```

- [ ] **Step 3: Write a test asserting the append-only reducer behaviour**

```ts
// src/lib/graph/state.test.ts
import { describe, it, expect } from "vitest";
import { GraphState } from "./state";

describe("GraphState reducers", () => {
  it("concatenates findings instead of clobbering them", () => {
    const schema = GraphState;
    // Access the ReducedValue on the findings channel and exercise its reducer.
    const field = (schema as any).fields.findings;
    expect(field.reducer([{ symptomCode: "a" }], [{ symptomCode: "b" }]))
      .toEqual([{ symptomCode: "a" }, { symptomCode: "b" }]);
  });
});
```

If the internal field path differs in the installed LangGraph version, inspect the object once with `console.log(Object.keys(GraphState))` and adjust the accessor — do not delete the test.

- [ ] **Step 4: Run and commit**

```bash
npm test -- state
git add src/lib/graph src/lib/rules/types.ts package.json package-lock.json
git commit -m "feat(graph): add GraphState schema with append-only reducers"
```

---

### Task 3.2: Deterministic nodes

**Files:**
- Create: `src/lib/graph/nodes/ingest.ts`
- Create: `src/lib/graph/nodes/pre-filter.ts`
- Create: `src/lib/graph/nodes/validate.ts`
- Create: `src/lib/graph/nodes/evaluate-rules.ts`
- Create: `src/lib/graph/nodes/triage.ts`
- Test: `src/lib/graph/nodes/validate.test.ts`

**Interfaces:**
- Consumes: `GraphStateType`; `preFilter`, `evaluateRules`, `loadRules` from `@/lib/rules/*`.
- Produces: five node functions each `(state: GraphStateType) => Promise<Partial<GraphStateType>>`.

- [ ] **Step 1: Write the failing test for `validate`**

```ts
// src/lib/graph/nodes/validate.test.ts
import { describe, it, expect } from "vitest";
import { validateNode } from "./validate";

const base = { rawText: "my wound is a bit more pink than yesterday" } as any;

describe("validate node", () => {
  it("drops a free-text finding whose sourceSpan is not in rawText", () => {
    const out = validateNode({
      ...base,
      modality: "free_text",
      findings: [{ symptomCode: "chest_pain", sourceSpan: "I have crushing chest pain" }],
    });
    expect(out.findings).toEqual([]);
  });

  it("keeps a free-text finding whose sourceSpan is a literal substring", () => {
    const out = validateNode({
      ...base,
      modality: "free_text",
      findings: [{ symptomCode: "wound_redness", sourceSpan: "more pink" }],
    });
    expect(out.findings).toHaveLength(1);
  });

  it("lets chip-intake findings through without a sourceSpan", () => {
    const out = validateNode({
      ...base,
      modality: "structured",
      findings: [{ symptomCode: "wound_redness" }],
    });
    expect(out.findings).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- validate`
Expected: FAIL — cannot resolve `./validate`.

- [ ] **Step 3: Write the nodes**

`src/lib/graph/nodes/validate.ts` — the grounding check:

```ts
import type { GraphStateType } from "../state";

export function validateNode(state: GraphStateType): Partial<GraphStateType> {
  // Chip intake is pre-segmented and cannot be hallucinated — bypass the substring check.
  if (state.modality === "structured") {
    return { findings: state.findings };
  }
  const kept = state.findings.filter(
    (f) => f.sourceSpan !== undefined && state.rawText.includes(f.sourceSpan),
  );
  const dropped = state.findings.filter(
    (f) => f.sourceSpan === undefined || !state.rawText.includes(f.sourceSpan),
  );
  return {
    findings: kept,
    unmappedSpans: dropped.map((f) => f.sourceSpan ?? f.symptomCode),
  };
}
```

`src/lib/graph/nodes/pre-filter.ts`:

```ts
import { preFilter } from "@/lib/rules/class1-pre-filter";
import type { GraphStateType } from "../state";

export function preFilterNode(state: GraphStateType) {
  const result = preFilter(state.rawText);
  if (result.hit) {
    return { findings: [result.finding], __preFilterHit: result };
  }
  return { __preFilterHit: result };
}
```

`src/lib/graph/nodes/ingest.ts` — resolves the patient, computes `recoveryDay`, normalizes modality. Unknown patient throws, which the route maps to `500` with no severity (spec §7.6).

`src/lib/graph/nodes/evaluate-rules.ts` — calls `evaluateRules` with `loadRules(patient.procedureCode)` and returns `{ severity, winningRuleId, winningRuleClass, ruleEvaluations }`. The `winningRuleClass` field must be threaded through the state (it is a plain `z.number().optional()` on `GraphState`, **not** a `ReducedValue` — it is a last-write-wins scalar, unlike the append-only `findings`/`ruleEvaluations`). Wrap `loadRules` in a try/catch: a `rule_config_missing` throw becomes the Class-4 path, not a crash.

`src/lib/graph/nodes/triage.ts` — computes `requiresHumanReview` exactly as spec §6.1:

```ts
import { severityRank } from "@/lib/rules/types";
import type { GraphStateType } from "../state";

export function triageNode(state: GraphStateType) {
  const severity = state.severity ?? "CALL_CLINIC";
  if (severityRank(severity) >= severityRank("URGENT_CARE")) {
    return { requiresHumanReview: false, escalationRoute: severity === "EMERGENCY" ? "emergency" : "urgent_care" };
  }
  const requiresHumanReview =
    (state.extractionConfidence < 0.6) ||
    state.unmappedSpans.length > 0 ||
    state.winningRuleClass === 2;   // Class-2 winning rule, per spec §6.1

  return {
    requiresHumanReview,
    escalationRoute: severity === "CALL_CLINIC" ? "call_clinic" : "self_care",
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- validate`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/graph/nodes
git commit -m "feat(graph): add ingest, pre_filter, validate, evaluate_rules, triage nodes"
```

---

### Task 3.3: Stub LLM nodes, human_review, explain, notify, persist

**Files:**
- Create: `src/lib/graph/nodes/extract.ts` (stub implementation, `// STUB:` marker)
- Create: `src/lib/graph/nodes/explain.ts` (stub)
- Create: `src/lib/graph/nodes/human-review.ts`
- Create: `src/lib/graph/nodes/notify-care-team.ts`
- Create: `src/lib/graph/nodes/persist.ts`
- Create: `src/lib/templates/explanations.ts`

**Interfaces:**
- Consumes: `GraphStateType`.
- Produces: `extractNode`, `explainNode`, `humanReviewNode`, `notifyCareTeamNode`, `persistNode`; `templateExplanation(severity, winningRuleId): string`.

- [ ] **Step 1: Write the stub extractor**

`src/lib/graph/nodes/extract.ts` — keyword mapping so the vertical slice works without Gemini. Mark clearly so Phase 6 replaces it:

```ts
// STUB: replaced by ChatGoogleGenerativeAI in Phase 6 (Task 6.1).
import type { GraphStateType } from "../state";

const KEYWORDS: Array<[RegExp, string]> = [
  [/(pink|red|redder|redness)/i, "wound_redness"],
  [/(drain|fluid|ooz|discharge)/i, "serous_drainage"],
  [/(tired|fatigue|exhausted)/i, "fatigue"],
  [/(pain|ache|sore)/i, "pain"],
];

export async function extractNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const findings = KEYWORDS
    .map(([re, code]) => {
      const m = re.exec(state.rawText);
      return m ? { symptomCode: code, sourceSpan: m[0] } : null;
    })
    .filter((f): f is { symptomCode: string; sourceSpan: string } => f !== null);

  return { findings, extractionConfidence: findings.length > 0 ? 0.8 : 0.3 };
}
```

- [ ] **Step 2: Write the template explanations**

`src/lib/templates/explanations.ts`:

```ts
import type { Severity } from "@/lib/rules/types";

const BY_SEVERITY: Record<Severity, string> = {
  SELF_CARE: "This sounds like a normal part of recovery. Keep following your plan and check in again tomorrow.",
  CALL_CLINIC: "This is worth a call to your clinic today. It is probably nothing urgent, but they should hear about it.",
  URGENT_CARE: "You should be seen today. Go to urgent care, or call your clinic and tell them you were advised to come in.",
  EMERGENCY: "Call emergency services now. Do not wait.",
};

export function templateExplanation(severity: Severity, _winningRuleId?: string): string {
  return BY_SEVERITY[severity];
}
```

- [ ] **Step 3: Write `human_review` with the SLA timer**

```ts
// src/lib/graph/nodes/human-review.ts
import { interrupt } from "@langchain/langgraph";
import type { GraphStateType } from "../state";

const SLA_MS = Number(process.env.REVIEW_SLA_MS ?? 15 * 60 * 1000);
const timers = new Map<string, NodeJS.Timeout>();

export function humanReviewNode(state: GraphStateType): Partial<GraphStateType> {
  if (!timers.has(state.reportId)) {
    timers.set(state.reportId, setTimeout(() => {
      // Fires only if no decision landed. Writes CALL_CLINIC and closes the thread.
      // Persist via db in Task 3.5's persist path; this callback marks the intent.
      void import("@/lib/db/client").then(({ db }) =>
        db.triageOutcome.updateMany({
          where: { reportId: state.reportId, requiresHuman: true, humanDecision: null },
          data: { severity: "CALL_CLINIC", escalationRoute: "call_clinic", explanationText: "A nurse was not able to review this in time. Please call your clinic." },
        }),
      );
      timers.delete(state.reportId);
    }, SLA_MS));
  }

  const decision = interrupt({ reason: "reassurance_needs_review", reportId: state.reportId });
  clearTimeout(timers.get(state.reportId));
  timers.delete(state.reportId);
  return { humanDecision: decision as GraphStateType["humanDecision"] };
}
```

- [ ] **Step 4: Write `explain`, `notify_care_team`, `persist`**

`explainNode` uses the template fallback for now (Phase 6 swaps in Gemini). `notifyCareTeamNode` writes an inbox row and is wrapped so a queue failure only logs. `persistNode` writes the `TriageOutcome` row and returns `{}`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/graph/nodes src/lib/templates
git commit -m "feat(graph): add stub extract/explain, human_review SLA timer, notify, persist"
```

---

### Task 3.4: Wire the graph

**Files:**
- Create: `src/lib/graph/graph.ts`
- Create: `src/lib/graph/checkpointer.ts`
- Test: `src/lib/graph/graph.test.ts`

**Interfaces:**
- Consumes: all node functions.
- Produces: `getGraph(): CompiledStateGraph` and `runReport(input): Promise<{ status: 200 | 202; body: unknown }>`.

- [ ] **Step 1: Write `src/lib/graph/graph.ts`**

Topology exactly as spec §7.4:

```ts
import { StateGraph, START, END } from "@langchain/langgraph";
import { GraphState } from "./state";
import { checkpointer } from "./checkpointer";
import { ingestNode } from "./nodes/ingest";
import { preFilterNode } from "./nodes/pre-filter";
import { extractNode } from "./nodes/extract";
import { validateNode } from "./nodes/validate";
import { evaluateRulesNode } from "./nodes/evaluate-rules";
import { triageNode } from "./nodes/triage";
import { humanReviewNode } from "./nodes/human-review";
import { explainNode } from "./nodes/explain";
import { notifyCareTeamNode } from "./nodes/notify-care-team";
import { persistNode } from "./nodes/persist";

function afterPreFilter(state: typeof GraphState.State) {
  return (state as any).__preFilterHit?.hit ? "evaluate_rules" : "extract";
}

function afterTriage(state: typeof GraphState.State) {
  return state.requiresHumanReview ? "human_review" : "explain";
}

function afterExplain(state: typeof GraphState.State) {
  const escalation = state.severity === "URGENT_CARE" || state.severity === "EMERGENCY";
  return escalation ? "notify_care_team" : "persist";
}

const builder = new StateGraph(GraphState)
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
  .addEdge("persist", END);

export const graph = builder.compile({ checkpointer });
```

`src/lib/graph/checkpointer.ts`:

```ts
import { MemorySaver } from "@langchain/langgraph";
export const checkpointer = new MemorySaver();
```

- [ ] **Step 2: Write `src/lib/graph/run-report.ts`**

```ts
import { graph } from "./graph";

export async function runReport(input: Record<string, unknown> & { reportId: string }) {
  const config = { configurable: { thread_id: `report-${input.reportId}` } };
  const result = await graph.invoke(input, config);
  if ((result as any).__interrupt__) {
    return { status: 202 as const, body: { reportId: input.reportId, status: "pending_review" } };
  }
  return { status: 200 as const, body: result };
}

export async function resumeReport(reportId: string, decision: unknown) {
  const { Command } = await import("@langchain/langgraph");
  const config = { configurable: { thread_id: `report-${reportId}` } };
  const result = await graph.invoke(new Command({ resume: decision }), config);
  return { status: 200 as const, body: result };
}
```

- [ ] **Step 3: Write the routing test**

```ts
// src/lib/graph/graph.test.ts
import { describe, it, expect } from "vitest";
import { runReport } from "./run-report";

const base = {
  patientId: "p1", recoveryDay: 4, modality: "free_text" as const,
  structuredAnswers: undefined, vitals: undefined,
};

describe("graph routing", () => {
  it("returns 200 with an escalation for a Class-1 phrase", async () => {
    const out = await runReport({ ...base, reportId: `t-${Date.now()}-a`, rawText: "my calf is sore and puffy" });
    expect(out.status).toBe(200);
    expect((out.body as any).severity).toBe("URGENT_CARE");
  });

  it("returns 202 on the uncertain reassurance path", async () => {
    const out = await runReport({ ...base, reportId: `t-${Date.now()}-b`, rawText: "my wound is a bit more pink than yesterday" });
    expect(out.status).toBe(202);
    expect((out.body as any).status).toBe("pending_review");
  });
});
```

This test needs a patient row seeded — add a `beforeAll` that upserts `Patient`, `RecoveryPlan`, `Phase` rows, or inject the patient via a test-only `__patient` field on the state. Prefer seeding the DB: it exercises the real `ingest`.

- [ ] **Step 4: Run and iterate until both pass**

Run: `npm test -- graph`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/graph
git commit -m "feat(graph): wire the bifurcated triage graph with MemorySaver checkpointer"
```

---

### Task 3.5: HTTP routes

**Files:**
- Create: `src/app/api/reports/route.ts`
- Create: `src/app/api/reports/[id]/route.ts`
- Create: `src/app/api/reports/[id]/review/route.ts`
- Test: `test/api-reports.test.ts`

**Interfaces:**
- Consumes: `runReport`, `resumeReport`, `db`.
- Produces: the `200`/`202`/`409`/`500` contract from spec §7.2 and §7.6.

- [ ] **Step 1: Write the failing route test**

```ts
// test/api-reports.test.ts
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/reports/route";

function req(body: unknown) {
  return new Request("http://localhost/api/reports", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/reports", () => {
  it("returns 202 iff the graph interrupted", async () => {
    const res = await POST(req({
      patientId: "p1", reportId: `api-${Date.now()}`, modality: "free_text",
      rawText: "my wound is a bit more pink than yesterday",
    }));
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json).toEqual({ reportId: expect.any(String), status: "pending_review" });
  });

  it("returns 200 with a verdict on the escalation path", async () => {
    const res = await POST(req({
      patientId: "p1", reportId: `api-${Date.now()}`, modality: "free_text",
      rawText: "I have chest pain",
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.severity).toBe("EMERGENCY");
  });
});
```

- [ ] **Step 2: Write `src/app/api/reports/route.ts`**

```ts
import { NextResponse } from "next/server";
import { runReport } from "@/lib/graph/run-report";

export async function POST(request: Request) {
  const body = await request.json();
  try {
    const out = await runReport(body);
    return NextResponse.json(out.body, { status: out.status });
  } catch (err) {
    return NextResponse.json(
      { reportId: body?.reportId ?? null, error: (err as Error).message },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Write `[id]/route.ts` and `[id]/review/route.ts`**

`GET /api/reports/:id` reads the `TriageOutcome` row for polling. `POST /api/reports/:id/review` calls `resumeReport`; if the checkpointer has no thread for that id it returns `409`:

```ts
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decision = await request.json();
  const { graph } = await import("@/lib/graph/graph");
  const config = { configurable: { thread_id: `report-${id}` } };
  const snapshot = await graph.getState(config);
  if (!snapshot?.next?.length) {
    return NextResponse.json({ error: "review_expired" }, { status: 409 });
  }
  const { resumeReport } = await import("@/lib/graph/run-report");
  const out = await resumeReport(id, decision);
  return NextResponse.json(out.body, { status: out.status });
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- api-reports`
Expected: 2 passing. Verify the `202` test fails if you temporarily remove the `__interrupt__` check — the contract is "iff", so prove it.

- [ ] **Step 5: Commit**

```bash
git add src/app/api test/api-reports.test.ts
git commit -m "feat(api): add POST /reports, GET /reports/:id, POST /reports/:id/review with 200/202/409 contract"
```

---

### Task 3.6: Vertical slice checkpoint

- [ ] **Step 1: Run the full suite**

```bash
npm test
```

Expected: everything green.

- [ ] **Step 2: Manual smoke test**

```bash
npm run dev
curl -X POST http://localhost:3000/api/reports -H "content-type: application/json" \
  -d '{"patientId":"p1","reportId":"smoke-1","modality":"free_text","rawText":"my calf is sore and puffy"}'
```

Expected: `200` with `severity: "URGENT_CARE"` and `winningRuleId: "c1-calf"`.

```bash
curl -X POST http://localhost:3000/api/reports -H "content-type: application/json" \
  -d '{"patientId":"p1","reportId":"smoke-2","modality":"free_text","rawText":"my wound is a bit more pink than yesterday"}'
```

Expected: `202` `{"reportId":"smoke-2","status":"pending_review"}`.

- [ ] **Step 3: Push the phase**

```bash
git push
```

---

## Phase 4 — Design foundation (teal + white, shadcn, motion)

The user's brief: teal and white, shadcn everywhere, detailed animation, judge-facing polish. This phase produces the design system every later UI phase consumes.

### Task 4.1: Invoke the UI/UX design skill and lock the design system

**Files:**
- Create: `docs/superpowers/plans/design-system.md`
- Modify: `src/app/globals.css`
- Create: `src/lib/design/tokens.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties and a token module every component imports. Other tasks reference `bg-brand-600`, `text-severity-emergency`, etc.

- [ ] **Step 1: Invoke the design skill**

Using the Skill tool:

```
skill: ui-ux-pro-max:design-system
```

Give it this brief verbatim: *"Post-operative recovery triage PWA. Mobile-first. Colour theme is teal and white. Four severity levels must be visually distinguishable at a glance and must map to amber / orange / red. Calm, clinical, high-contrast, large type. Target user is a post-op patient on painkillers, on a phone, possibly anxious."*

Also invoke `ui-ux-pro-max:ui-styling` for the component styling pass. Do not skip these — the user named them as mandatory.

- [ ] **Step 2: Write the resulting decisions to `docs/superpowers/plans/design-system.md`**

Record: the teal scale hex values, the type scale, spacing, radii, motion durations and easings, and the severity colour mapping. This file is the contract for Phases 5 and 7.

- [ ] **Step 3: Encode tokens in `src/app/globals.css`**

Teal primary ramp with white surfaces. Sketch:

```css
@theme {
  --color-brand-50:  #f0fdfa;
  --color-brand-100: #ccfbf1;
  --color-brand-500: #14b8a6;
  --color-brand-600: #0d9488;
  --color-brand-700: #0f766e;
  --color-brand-900: #134e4a;

  --color-severity-selfcare:  var(--color-brand-600);
  --color-severity-clinic:    #d97706;  /* amber-600  */
  --color-severity-urgent:    #ea580c;  /* orange-600 */
  --color-severity-emergency: #dc2626;  /* red-600    */

  --motion-fast: 150ms;
  --motion-base: 250ms;
  --motion-slow: 400ms;
  --ease-out-soft: cubic-bezier(0.22, 1, 0.36, 1);
}
```

- [ ] **Step 4: Verify contrast**

Every severity colour must hit WCAG AA (4.5:1) against its background at the type size it is used. Check `--color-severity-clinic` on white in particular — amber-600 passes for large text; use amber-700 if it is used at body size.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/lib/design docs/superpowers/plans/design-system.md
git commit -m "feat(design): add teal/white design tokens and severity colour mapping"
```

---

### Task 4.2: shadcn/ui setup

**Files:**
- Create (generated): `components.json`, `src/lib/utils.ts`, `src/components/ui/*`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: the tokens from Task 4.1.
- Produces: the shadcn primitives every later UI task imports from `@/components/ui/*`.

- [ ] **Step 1: Initialise shadcn**

Use the CLI, not hand-written files:

```bash
npx shadcn@latest init
```

Choose: New York style, Zinc base colour, CSS variables yes. Then override the CSS variables with the teal tokens from Task 4.1.

- [ ] **Step 2: Add the components the app needs**

```bash
npx shadcn@latest add button card badge dialog alert sheet tabs textarea input label progress separator skeleton sonner avatar tooltip accordion
```

- [ ] **Step 3: Verify the build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(ui): initialise shadcn/ui and add the component set for the patient surfaces"
```

---

### Task 4.3: Motion primitives

**Files:**
- Create: `src/lib/motion.ts`
- Create: `src/components/motion/fade-in.tsx`
- Create: `src/components/motion/severity-reveal.tsx`

**Interfaces:**
- Consumes: tokens from Task 4.1.
- Produces: `<FadeIn>`, `<SeverityReveal severity={Severity}>` wrappers used by every card in Phase 5.

- [ ] **Step 1: Install the animation library**

```bash
npm install motion
```

(`motion` is the current package for Framer Motion's successor. If the project already resolved `framer-motion`, use that instead — do not install both.)

- [ ] **Step 2: Write `src/lib/motion.ts`**

```ts
export const transition = {
  fast: { duration: 0.15, ease: [0.22, 1, 0.36, 1] as const },
  base: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const },
  slow: { duration: 0.4,  ease: [0.22, 1, 0.36, 1] as const },
};

export const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -4 },
};
```

- [ ] **Step 3: Write the components**

`FadeIn` wraps children in a `motion.div` with `fadeUp` + `transition.base`. `SeverityReveal` escalates the animation by severity: `SELF_CARE` fades in, `CALL_CLINIC` slides up, `URGENT_CARE` scales from 0.98 with a colour wash, `EMERGENCY` uses `transition.fast` and no exit animation (it must not be dismissable without acknowledgement per spec §8.2).

Respect `prefers-reduced-motion`: use `useReducedMotion()` and fall back to opacity-only.

- [ ] **Step 4: Commit**

```bash
git add src/lib/motion.ts src/components/motion package.json package-lock.json
git commit -m "feat(ui): add motion primitives with severity-scaled reveal and reduced-motion support"
```

---

## Phase 5 — Patient UI

### Task 5.1: Severity system components

**Files:**
- Create: `src/components/severity/severity-card.tsx`
- Create: `src/components/severity/severity-badge.tsx`
- Create: `src/components/severity/call-button.tsx`
- Test: `src/components/severity/severity-card.test.tsx`

**Interfaces:**
- Consumes: shadcn `Card`, `Button`; `Severity`; `<SeverityReveal>`.
- Produces: `<SeverityCard severity route explanation whatToSay onAcknowledge>` — the single component that renders all four spec §8.2 treatments.

- [ ] **Step 1: Install the test renderer**

```bash
npm install -D @testing-library/react @testing-library/jest-dom jsdom
```

Add to `vitest.config.ts`: `environment: "jsdom"` for `*.test.tsx`, and a setup file importing `@testing-library/jest-dom/vitest`.

- [ ] **Step 2: Write the failing test**

```tsx
// src/components/severity/severity-card.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SeverityCard } from "./severity-card";

describe("SeverityCard", () => {
  it("renders a tap-to-call action for EMERGENCY", () => {
    render(<SeverityCard severity="EMERGENCY" explanation="Call now." whatToSay="I am 4 days post-op." onAcknowledge={() => {}} />);
    expect(screen.getByRole("link", { name: /call/i })).toBeInTheDocument();
  });

  it("does not render a call action for SELF_CARE", () => {
    render(<SeverityCard severity="SELF_CARE" explanation="Normal." onAcknowledge={() => {}} />);
    expect(screen.queryByRole("link", { name: /call/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Implement the four treatments**

Per spec §8.2: `SELF_CARE` inline text no card; `CALL_CLINIC` card with "what to say on the phone"; `URGENT_CARE` full-bleed, blocks scrolling; `EMERGENCY` full-screen, cannot dismiss without acknowledging. Use `tel:` links so tapping calls. `CALL_CLINIC` and above render `whatToSay` in a copyable block.

- [ ] **Step 4: Run the test and commit**

```bash
npm test -- severity-card
git add src/components/severity vitest.config.ts package.json package-lock.json
git commit -m "feat(ui): add SeverityCard implementing all four spec §8.2 treatments"
```

---

### Task 5.2: Today view

**Files:**
- Create: `src/app/page.tsx` (replace scaffold)
- Create: `src/components/today/task-list.tsx`
- Create: `src/components/today/task-row.tsx`
- Create: `src/app/api/patients/[id]/today/route.ts`

**Interfaces:**
- Consumes: `db`; `SeverityCard`; shadcn `Card`, `Button`, `Checkbox`.
- Produces: `GET /api/patients/:id/today` returning `{ recoveryDay, tasks: Task[], phase: { name } }` — pure computation from `RecoveryPlan` + `surgeryDate`, no LLM (spec §7.2).

- [ ] **Step 1: Implement the today route with a test**

Test asserts: given a seeded plan with `dayStart`/`dayEnd` phases, day 4 returns only the day-4 tasks and the correct `recoveryDay`.

- [ ] **Step 2: Build the Today view**

Task rows animate in with a 40ms stagger. Tapping a task runs a check-and-strikethrough with `transition.base`. Persist completion. Header carries the language toggle and the TTS speaker button. One persistent button: **"Is this normal?"** — teal, fixed to the bottom, opens the triage sheet.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx src/app/api/patients src/components/today
git commit -m "feat(ui): add Today view with phase-aware task list and triage entry"
```

---

### Task 5.3: Triage sheet — chip intake and free text

**Files:**
- Create: `src/components/triage/triage-sheet.tsx`
- Create: `src/components/triage/chip-intake.tsx`
- Create: `src/components/triage/free-text-intake.tsx`
- Create: `src/components/triage/pending-state.tsx`

**Interfaces:**
- Consumes: `POST /api/reports`, `GET /api/reports/:id`; `SeverityCard`; shadcn `Sheet`, `Tabs`, `Textarea`, `Button`, `Checkbox`.
- Produces: the full check-in flow, both entry modes, and the `202` pending state.

- [ ] **Step 1: Build the intake**

Two tabs per spec §8.4. Chip intake: onset / location / severity / associated symptoms, with `motion` layout animations as chips select. Free text: textarea plus a mic button wired to the Web Speech API.

- [ ] **Step 2: Build the pending state**

Per spec §8.3, the `202` state is **not a dead end** — it is a red-flag self-check. Render the four bullet items as a checklist plus `[Call emergency services]` and `[Call my clinic]` buttons. Animate the sheet expanding into this state, not cutting to it. This is the single most important screen in the demo; give it the most polish.

- [ ] **Step 3: Wire polling**

On `202`, poll `GET /api/reports/:id` every 3s. When the outcome lands, cross-fade the pending state into the `SeverityCard`. If the client's request times out, show the last known severity or a neutral "checking" state — **escalation information never sits behind a loading state** (spec §7.1).

- [ ] **Step 4: Commit**

```bash
git add src/components/triage
git commit -m "feat(ui): add triage sheet with chip/free-text intake and the 202 red-flag self-check"
```

---

### Task 5.4: Plan setup surface

**Files:**
- Create: `src/app/setup/page.tsx`
- Create: `src/components/setup/plan-review.tsx`

**Interfaces:**
- Consumes: `POST /api/plans/extract`, `POST /api/plans/:id/confirm`.
- Produces: the photo-capture → draft → human-confirm flow.

- [ ] **Step 1: Build the surface**

Photo capture → extracted plan as a checklist with the original text beside each simplified line → each row shows the `sourceSpan` it came from. Plan is inert until confirmed — the confirm button is the only way out. Build it against a hand-seeded plan now; Phase 8 wires the real extraction.

- [ ] **Step 2: Commit**

```bash
git add src/app/setup src/components/setup
git commit -m "feat(ui): add plan setup surface with sourceSpan-anchored human confirmation"
```

---

### Task 5.5: UI/UX review pass

**Files:**
- Modify: whichever components the review flags.
- Create: `docs/superpowers/plans/ui-review.md`

**Interfaces:**
- Consumes: everything in Phase 5.
- Produces: a recorded review and the fixes.

- [ ] **Step 1: Invoke the review skill**

```
skill: ui-ux-pro-max:ui-ux-pro-max
```

Brief: *"Review the patient-facing surfaces of this post-op triage PWA for a hackathon demo. Check: severity legibility at arm's length on a phone, animation smoothness and consistency, teal/white theme coherence, shadcn usage correctness, and whether the 202 pending state reads as reassuring rather than as a dead end. Target: mindblowing for judges, but never at the cost of a patient misreading a red flag."*

- [ ] **Step 2: Record findings and apply fixes**

Write `docs/superpowers/plans/ui-review.md` with one row per finding and its resolution.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix(ui): apply ui-ux-pro-max review pass to patient surfaces"
```

- [ ] **Step 4: Push the phase**

```bash
git push
```

---

## Phase 6 — Gemini, real

### Task 6.1: Swap the stub extractor for Gemini

**Files:**
- Modify: `src/lib/graph/nodes/extract.ts`
- Create: `src/lib/gemini/client.ts`
- Create: `src/lib/gemini/prompts.ts`
- Test: `test/extraction-eval.test.ts`

**Interfaces:**
- Consumes: `GEMINI_API_KEY` from `.env.local`; `FindingSchema`.
- Produces: `extractNode` calling `ChatGoogleGenerativeAI` with a structured-output schema, returning `Finding[]` + `extractionConfidence`. On any throw, returns `{ findings: [], extractionConfidence: 0 }` so the graph routes to Class 4 → human review.

- [ ] **Step 1: Install and configure**

```bash
npm install @langchain/google-genai
```

Add `GEMINI_API_KEY=` to `.env.local`. Confirm `.env.local` is gitignored before writing the key.

- [ ] **Step 2: Write `src/lib/gemini/prompts.ts`**

The extraction prompt must instruct the model to return, for each finding, the exact substring of the patient's text it came from. That is what makes `validate`'s grounding check meaningful. Also instruct it to set `extractionConfidence` low when the text is vague or unrelated to post-op recovery.

- [ ] **Step 3: Implement `extractNode` with a hard failure boundary**

```ts
export async function extractNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  try {
    const out = await callGeminiExtract(state.rawText);
    return { findings: out.findings, extractionConfidence: out.confidence };
  } catch {
    return { findings: [], extractionConfidence: 0 };   // → Class 4 → human review
  }
}
```

Never let a Gemini error propagate to the route as a `500` on the extraction step. The spec's failure table requires it to become a routing decision.

- [ ] **Step 4: Write the extraction eval**

Not a unit test — an eval with a number. ~20 hand-labelled narratives from `data/fixtures/triage-fixtures.json`, scored for field-level accuracy against the `seededFindings` from Phase 0. Assert a floor (e.g. ≥ 70% field accuracy). Print the score.

- [ ] **Step 5: Verify the Gemini-down path**

```bash
GEMINI_API_KEY=invalid npm test -- graph
```

Expected: the Class-1 fixture still returns `200 URGENT_CARE` (pre_filter, no LLM). The ambiguous fixture returns `202` via Class 4 → human review. **This is demo step 6 — prove it now, not on stage.**

- [ ] **Step 6: Commit**

```bash
git add src/lib/gemini src/lib/graph/nodes/extract.ts test/extraction-eval.test.ts package.json package-lock.json
git commit -m "feat(ai): replace stub extractor with Gemini structured extraction and failure routing"
```

---

### Task 6.2: Gemini-backed explainer with template fallback

**Files:**
- Modify: `src/lib/graph/nodes/explain.ts`
- Modify: `src/lib/gemini/prompts.ts`

**Interfaces:**
- Consumes: `templateExplanation` from `@/lib/templates/explanations`.
- Produces: `explainNode` that renders the verdict in the patient's language and reading level, falling back to the template on any failure.

- [ ] **Step 1: Implement with a timeout and a catch**

The explain call gets a strict timeout (2s). On timeout or error, return `{ explanation: templateExplanation(severity, winningRuleId) }`. The patient gets a real verdict either way.

- [ ] **Step 2: Test the fallback**

Stub the Gemini client to throw, assert `explanation` equals the template string for that severity.

- [ ] **Step 3: Commit**

```bash
git add src/lib/graph/nodes/explain.ts src/lib/gemini/prompts.ts
git commit -m "feat(ai): add Gemini explainer with template fallback on timeout or error"
```

- [ ] **Step 4: Push the phase**

```bash
git push
```

---

## Phase 7 — Nurse inbox

### Task 7.1: Inbox API

**Files:**
- Create: `src/app/api/nurse/inbox/route.ts`

**Interfaces:**
- Consumes: `db`.
- Produces: `GET /api/nurse/inbox` returning `TriageOutcome` rows where `requiresHuman` or `severity >= URGENT_CARE`, ranked by severity then age. Each row expands to: raw words, findings with `sourceSpan`, **every** `RuleEvaluation` row including non-fired ones, and the proposed outcome (spec §8.5).

- [ ] **Step 1: Implement the query**

The non-fired `RuleEvaluation` rows are the point — they are what makes "why did it decide this?" a query rather than a reconstruction. Make sure the serializer includes them.

- [ ] **Step 2: Write a test asserting non-fired rows are present in the payload**

- [ ] **Step 3: Commit**

```bash
git add src/app/api/nurse
git commit -m "feat(api): add nurse inbox returning full rule evaluation table including non-fired rows"
```

---

### Task 7.2: Nurse inbox UI

**Files:**
- Create: `src/app/nurse/page.tsx`
- Create: `src/components/nurse/inbox-row.tsx`
- Create: `src/components/nurse/review-panel.tsx`

**Interfaces:**
- Consumes: `GET /api/nurse/inbox`, `POST /api/reports/:id/review`; shadcn `Card`, `Button`, `Dialog`, `Badge`, `Textarea`.
- Produces: the desktop queue with Confirm / Override.

- [ ] **Step 1: Build the queue and the review panel**

Ranked by severity then age. `sourceSpan` highlighted inside the patient's own words. Override requires picking a different severity **and** a one-line reason, writing `humanDecision`.

- [ ] **Step 2: Implement the "never shown as a downgrade" rule**

Per spec §8.5: when a nurse overrides downward, the patient sees "a nurse reviewed this." Never render the downgrade as a system reassertion. Write a test asserting the patient-facing payload for an overridden-down outcome does not contain the overridden severity as a "we now think" statement.

- [ ] **Step 3: Commit**

```bash
git add src/app/nurse src/components/nurse
git commit -m "feat(ui): add nurse inbox with confirm/override and non-downgrade patient messaging"
```

- [ ] **Step 4: Push the phase**

```bash
git push
```

---

## Phase 8 — Plan extraction (multimodal)

The highest-variance piece, deliberately last (spec §9).

### Task 8.1: Discharge photo → draft plan

**Files:**
- Create: `src/app/api/plans/extract/route.ts`
- Create: `src/app/api/plans/[id]/confirm/route.ts`
- Modify: `src/app/setup/page.tsx`

**Interfaces:**
- Consumes: `ChatGoogleGenerativeAI` multimodal; `db`.
- Produces: `POST /api/plans/extract` returning a draft `RecoveryPlan` with `sourceSpans` per field; `POST /api/plans/:id/confirm` setting `confirmedBy`.

- [ ] **Step 1: Implement extraction**

Photo → Gemini vision → draft plan with a `sourceSpan` per extracted field, so a wrong extraction is visible to the human in the setup surface rather than silently baked in.

- [ ] **Step 2: Implement confirm**

Sets `confirmedBy`. The plan is inert until this runs — enforce it in the query, not just the UI.

- [ ] **Step 3: Verify the fallback**

If extraction fails or is slow, the setup surface must still allow a hand-seeded plan. This is cut-list item 5 — confirm the cut actually works before the demo.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/plans src/app/setup
git commit -m "feat(ai): add multimodal discharge-plan extraction with human confirmation gate"
```

- [ ] **Step 5: Push the phase**

```bash
git push
```

---

## Phase 9 — Verification sweep, demo hardening, and release

Per the user's brief: **testing and checks go last.** This phase runs the full suite, walks the spec's final claims, rehearses the demo script, and pushes.

### Task 9.1: Full test suite and coverage report

**Files:**
- Modify: `package.json` (add `test:coverage`)
- Create: `docs/superpowers/plans/verification-report.md`

- [ ] **Step 1: Add the coverage script**

```json
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 2: Run everything**

```bash
npm test
npm run test:coverage
npm run build
npm run lint
```

Expected: all green. Record the actual output in `docs/superpowers/plans/verification-report.md`. If anything fails, fix it before continuing — do not write "known failure" into the report.

- [ ] **Step 3: Commit**

```bash
git add package.json docs/superpowers/plans/verification-report.md
git commit -m "test: run full suite, coverage, build, and lint; record verification report"
```

---

### Task 9.2: Walk the three Final Claims against the code

**Files:**
- Modify: `docs/superpowers/plans/verification-report.md`

- [ ] **Step 1: Claim 1 — "Class-1 red flags are caught by a deterministic pre_filter on raw text before any LLM call."**

Prove it: run the suite with `GEMINI_API_KEY=invalid`. Every Class-1 fixture must still escalate. Record the command and its output.

- [ ] **Step 2: Claim 2 — "No path to a system-generated false reassurance."**

Enumerate every path to `SELF_CARE` or `CALL_CLINIC` and show each one either (a) required a human decision, or (b) went through the SLA timer. Then test the timer: set `REVIEW_SLA_MS=2000`, submit an uncertain report, do not review it, assert the outcome becomes `CALL_CLINIC` and the client stops polling.

- [ ] **Step 3: Claim 3 — "Escalations are never gated; reassurances always are."**

Assert: no `severity >= URGENT_CARE` input ever produces `202`. Add this as a property-style test over the fixture table.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/verification-report.md test
git commit -m "test: verify the three final claims against the implementation"
```

---

### Task 9.3: Demo script rehearsal

**Files:**
- Modify: `docs/superpowers/plans/verification-report.md`

- [ ] **Step 1: Walk the six beats from spec §8.6**

1. Photograph a discharge sheet → plan appears, structured (20s)
2. Today view, day 4 — tap through two tasks (20s)
3. Type "my calf is sore and puffy" → escalation fires, immediate, no gate (30s)
4. Type "my wound is a bit more pink than yesterday" → 202 pending, red-flag self-check shown (30s)
5. Cut to nurse inbox → confirm → patient view updates (40s)
6. Kill the Gemini API key mid-demo, repeat step 3 → `pre_filter` still catches the calf red flag, `extract` is skipped, escalation fires, template explanation (30s)

- [ ] **Step 2: Time it and record the actual timings**

Total target: 3 minutes. Record where it actually lands. If step 6 is not visibly different from step 3, the demo's strongest beat is invisible — add an on-screen indicator showing that `extract` was skipped.

- [ ] **Step 3: Fix anything that stutters**

An animation that janks, a spinner that appears where spec §7.1 forbids one, a colour that reads wrong on a projector. Fix now, not on stage.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(demo): rehearse and harden the six-beat demo script"
```

---

### Task 9.4: Final release

- [ ] **Step 1: Confirm no secrets are staged**

```bash
git status
git diff --cached --name-only | grep -i env
```

Expected: no `.env.local`. If it appears, unstage it and add it to `.gitignore` before proceeding.

- [ ] **Step 2: Confirm the cut list is honest**

Read `docs/superpowers/specs/2026-09-11-post-op-recovery-triage-design.md` §9.1. For each of the six cut items, note in `verification-report.md` whether it was actually cut or actually built. Do not claim a cut you did not make.

- [ ] **Step 3: Final push**

```bash
git push
git log --oneline origin/main..HEAD
```

Expected: the push succeeds and the log shows this phase's commits.

- [ ] **Step 4: Confirm the remote is current**

```bash
git status
```

Expected: `Your branch is up to date with 'origin/main'.`

---

## Self-Review

**1. Spec coverage.** Every numbered spec section maps to a task: §4 domain model → Task 1.2; §5 rule taxonomy → Tasks 0.1, 2.2, 2.3; §6.1 bifurcation → Tasks 3.2 (`triageNode`), 3.4 (conditional edges); §6.2 nodes → Tasks 3.2, 3.3; §6.3 state → Task 3.1; §6.4 thread identity → Task 3.4 (`report-${reportId}`); §6.5 failure modes → Tasks 3.3 (timer), 6.1 (Gemini-down), 6.2 (template fallback), 3.5 (`409`); §7.2 endpoints → Tasks 3.5, 5.2, 7.1, 8.1; §7.4 data flow → Task 3.4; §7.5 Prisma → Task 1.2; §7.6 error handling → Tasks 3.3, 3.5; §8.2 severity treatments → Task 5.1; §8.3 pending state → Task 5.3; §8.4 patient surfaces → Tasks 5.2, 5.3; §8.5 nurse inbox → Tasks 7.1, 7.2; §8.6 demo → Task 9.3; §9 build order → phase sequence; §10 testing → Tasks 2.4, 9.1, 9.2; §11 final claims → Task 9.2.

**2. Placeholder scan.** No "TBD" / "implement later" / "add appropriate error handling". The two intentionally-underspecified spots are flagged in-place with the reason: the exact LangGraph `ReducedValue` field accessor in Task 3.1 Step 3 (version-dependent — the test tells you how to discover it), and the fixture `seededFindings` extension in Task 2.4 Step 1 (needed once the LLM is stubbed out).

**3. Type consistency.** `Severity` and `SeverityEnum` are defined once in `src/lib/rules/types.ts` and imported everywhere. `RuleEvaluation` (runtime type) and `RuleEvaluationSchema` (zod) are both in that file — Task 3.1 adds the schema. `runReport` returns `{ status, body }` and `resumeReport` returns the same shape; Task 3.5's routes unwrap both identically. `PreFilterResult` is defined in `class1-pre-filter.ts` and consumed by `evaluator.ts` and `pre-filter.ts`.

**4. Deviation from spec, resolved.** An earlier draft of Task 3.2's `triageNode` checked Class-2 membership via `winningRuleId?.startsWith("app-2")`, which is brittle across three procedures. The spec says `winningRule.class == 2`. This has been corrected in place: `evaluateRules` now returns `winningRuleClass: number | null`, that scalar is threaded through `GraphState` as `winningRuleClass: z.number().optional()`, and `triageNode` reads `state.winningRuleClass === 2`. No string prefixing remains anywhere in the plan.