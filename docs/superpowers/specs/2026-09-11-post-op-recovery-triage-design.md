# Post-Operative Recovery Triage — Design Spec

**Problem statement:** Kalpvruksh 2.0, P10 — Adherence and Complication Recognition During Post-Operative Recovery (HealthTech, MEDIUM)
**Date:** 2026-09-11
**Status:** Approved design, pre-implementation
**Stack:** Next.js (App Router) + LangGraph JS + Gemini API + Prisma/SQLite

---

## 1. Problem framing

The PS names four failure modes and one hard technical core:

| # | Failure mode | Root cause named in PS |
|---|---|---|
| 1 | Tasks forgotten | Dense written guidance, given while tired/medicated/anxious |
| 2 | Tasks done incorrectly | Comprehension fails, not just recall |
| 3 | Tasks stopped early when symptoms improve | No feedback loop |
| 4 | Complication signs missed or dismissed | Patient cannot distinguish normal recovery from a warning sign |

**Hard core:** #4. "Normal recovery symptoms may be difficult to distinguish from warning signs such as infection, blood clots, uncontrolled pain, bleeding, dehydration, or wound separation." This is a discrimination problem under uncertainty with real stakes.

Three PS constraints that shape the design:

- Instructions vary **by procedure and by recovery stage** — a static checklist is disqualified by the PS text itself.
- Personalization axes are explicitly named: age, existing conditions, caregiver availability, transport/follow-up access. Equity is in scope.
- The care team is a stakeholder: "Care teams may receive incomplete or late information about changes occurring between scheduled appointments."

### Research caveat

Web tooling was largely unavailable during design. The only real sources retrieved were four PubMed records on app-based post-op recovery (PMIDs 31087175, 41747252, 41709331, 41762649). Notably, **none reported RCT evidence on complication detection** — a genuine gap. All other clinical grounding in this document is domain knowledge, not citation, and must be validated by a clinician before any real-world use.

---

## 2. Scope decisions

| Decision | Choice | Rationale |
|---|---|---|
| Primary user | **Patient/caregiver-first** (mobile PWA) | Patient is the one at risk between visits; directly answers the PS's opening framing. Nurse side is a secondary surface. |
| MVP focus | **Complication recognition depth** | The PS's stated hard problem. A mini hackathon rewards one column done convincingly. |
| Detection modes | Structured symptom chat + rule engine, **and** free-text/voice narrative | Both patient-reported. Objective signals (vitals) deferred — see below. |
| Equity scope | Multilingual + reading-level adaptation + voice (TTS in, STT optional) | Best effort-to-credit ratio; visible in a 30-second demo. |
| Deployment | **Localhost, single Node process** | `MemorySaver` checkpointer. Postgres checkpointer is a conditional swap (see §9). |

### Accepted limitation: no objective signal channel

Vitals (temperature, HR, BP, SpO2) were deliberately excluded. Consequence: every escalation decision rests on patient-reported subjective data, shaped by the same anxiety the PS describes. Fever + rising HR with falling BP is the strongest early signal for both sepsis and post-op bleeding, and the system cannot see it.

**The honest claim is therefore:** "we detect *reported* warning signs and route them," not "we detect complications." The `vitals` field exists in the state schema and extractor schema but is unused, so it can be added later without a migration.

---

## 3. Architecture decision: Approach A — deterministic core, LLM at the edges

Three approaches were considered (deterministic core + LLM edges; LLM reasoning core with rule-engine veto; multi-agent specialist panel). **Approach A chosen.**

The rule engine is the spine. Every symptom path flows through it, and it alone assigns severity. The LLM does three narrow, bounded jobs:

1. **Extract** structured findings from free text/voice
2. **Explain** the rule engine's verdict in plain language
3. **Translate/simplify** to the patient's language and reading level

Severity is a rule-engine output the LLM can *render* but never *override*.

**Why A over B/C:**

- **Testable.** The rule engine has real unit tests. This is the only part of the system that can be verified rather than demoed.
- **Deterministic demo.** The escalation path can be guaranteed to fire on stage.
- **Best failure mode.** If Gemini is slow, rate-limited, or down, the rule engine still works — you lose the plain-language explanation, not the product. Approaches B and C go dark.
- **Auditable.** "Why did it escalate?" is answered by a rule ID, not a paragraph of prose.

**Known cost:** the LLM reads as a translator rather than a reasoner. Mitigation is making the extraction step visible in the demo.

**Recovering B's advantage inside A:** an `unclassified_symptom` rule routes anything the extractor cannot map into a category to human review. This is still a rule, so it stays deterministic and auditable.

---

## 4. Domain model

Eight entities. Kept separate rather than collapsed into a single patient record, because the audit story depends on being able to point at *which* rule fired on *which* reported observation.

| Entity | Purpose | Key fields |
|---|---|---|
| **Patient** | Who is recovering | `id`, `procedureCode`, `surgeryDate`, `ageBand`, `comorbidities[]`, `anticoagulated`, `language`, `readingLevel`, `caregiverId?` |
| **RecoveryPlan** | Phase structure for one patient | `id`, `patientId`, `templateId`, `phases[]`, `source` (extracted \| template \| edited), `confirmedBy` |
| **Phase** | A dated window of recovery | `id`, `name`, `dayStart`, `dayEnd`, `tasks[]`, `expectedSymptoms[]`, `redFlags[]` |
| **Task** | One actionable item | `id`, `phaseId`, `kind` (medication \| wound_care \| mobility \| diet \| follow_up), `dueRule`, `instructionsSimple`, `instructionsOriginal` |
| **SymptomReport** | One patient check-in | `id`, `patientId`, `reportedAt`, `recoveryDay`, `modality` (structured \| free_text \| voice), `rawText?`, `findings[]`, `vitals?` |
| **Finding** | One extracted observation | `id`, `reportId`, `symptomCode`, `site?`, `severity?`, `onset?`, `duration?`, `laterality?`, `sourceSpan` |
| **RuleEvaluation** | One rule's verdict on one report | `id`, `reportId`, `ruleId`, `fired`, `evidenceFindingIds[]`, `severityAssigned` |
| **TriageOutcome** | Final decision for a report | `id`, `reportId`, `severity`, `winningRuleId` \| `default`, `escalationRoute`, `explanationText`, `explanationLanguage`, `requiresHuman`, `humanDecision?` |

### Two fields that carry the safety claim

**`Finding.sourceSpan`** — every extracted finding stores the literal substring of the patient's own words it came from. This is the answer to "the LLM hallucinated a symptom": you can point at the text. It also enables a cheap eval harness (feed N synthetic narratives, score extracted findings against hand-labeled ground truth).

**`RuleEvaluation` is a table, not a boolean.** Every rule gets a row whether it fired or not. "Why did it send me to the ER?" is a query, not a reconstruction. This is also what makes the unclassified-symptom fallback work — it is just another rule that fires on `findings.length == 0`.

### Explicitly not modelled

No diagnosis entity. No medication interaction checking. No risk score. All three are tempting and all three expand the clinical claim beyond what a hackathon can defend.

---

## 5. Rule taxonomy

Four rule classes, evaluated in strict priority order. First match wins for severity; lower classes can add context but cannot lower a severity already assigned.

**Class 1 — Hard red flags (absolute, no LLM involvement at any point)**
Fever ≥ 38 °C, chest pain, dyspnea, unilateral calf pain + swelling, soaking-through bleeding, wound dehiscence, syncope, confusion, inability to urinate. Escalate unconditionally. Severity: `EMERGENCY` or `URGENT_CARE`.

**Class 2 — Procedure-and-day-specific expectations**
The PS's actual hard problem. Each rule states: on day N of procedure P, symptom S is `expected` / `watch` / `escalate`. Serous drainage on day 2 post-appendectomy is expected; the same on day 10 is not. This is the only class that cannot work from a static list — it requires the phase model.

**Class 3 — Modifier rules (raise severity, never lower it)**
Comorbidity and medication adjustments, firing on `Patient` fields crossed with findings: anticoagulated + any bleeding → escalate one level; diabetic + wound redness → escalate one level; age ≥ 70 + new confusion → escalate.

**Class 4 — Catch-all / unclassified**
`no_findings_extracted` → human review. `finding_unmapped_to_symptom_code` → human review. `low_extraction_confidence` → human review. This class turns "the LLM couldn't parse it" from a silent failure into a routing decision.

**Severity ladder (fixed, four levels):** `SELF_CARE` → `CALL_CLINIC` → `URGENT_CARE` → `EMERGENCY`. Every escalation route maps to exactly one level. The LLM's only role is choosing the words.

---

## 6. LangGraph topology

### 6.1 The load-bearing decision: gates protect against under-triage, never over-triage

The obvious HITL design puts the interrupt after triage and before the patient sees anything. **That is clinically wrong for this problem.** If a class-1 rule fires, the patient needs to be told now, in seconds. Making them wait for a nurse to click approve is a worse outcome than the thing being prevented.

The graph therefore **bifurcates by direction of error**:

| Path | Patient-facing output | Interrupt? | Latency budget |
|---|---|---|---|
| **Escalation** (severity ≥ `URGENT_CARE`) | Shown immediately | **No.** Human review opens as a *parallel* branch notifying the care team. | seconds |
| **Reassurance** (severity ≤ `CALL_CLINIC`) | **Held** pending review | **Yes**, conditionally | minutes |

The interrupt fires only when the system is genuinely unsure:

```
requiresHumanReview =
    severity ∈ { SELF_CARE, CALL_CLINIC }
    AND ( lowExtractionConfidence
        OR unmappedFindings.length > 0
        OR winningRule.class == 2 )
```

Class-1 rules can never trigger it, because they never land on the reassurance path. Class 2 is the inclusion that matters: "this drainage is expected on day 2" is exactly the judgment a human should confirm before the app tells someone they are fine.

**Summary statement:** the system never waits for permission to escalate, and always waits for permission to reassure.

### 6.2 Nodes

| Node | Kind | Does | On failure |
|---|---|---|---|
| `ingest` | deterministic | Resolve patient, compute `recoveryDay`, normalize modality | unknown patient → hard fail, no thread |
| `extract` | **Gemini** | raw text/voice → `Finding[]` + confidence + `sourceSpan` | → `extraction_failed` (class 4) → human review |
| `validate` | deterministic | Schema check **+ grounding check**: every `sourceSpan` must be a literal substring of `rawText`. Ungrounded findings dropped. | all findings dropped → class 4 → human review |
| `evaluate_rules` | deterministic | Class 1→4 in strict priority; writes a `RuleEvaluation` row per rule, fired or not | → `rule_config_missing` → human review |
| `triage` | deterministic | Severity = max over fired rules; pick route + `winningRuleId` | no rule fired → class-4 default |
| `human_review` | **`interrupt()`** | Pause. Nurse approves / edits / overrides. | timeout → severity **floors at `CALL_CLINIC`** |
| `explain` | **Gemini** | Render verdict in patient's language + reading level | → **template fallback** (pre-written per severity+rule) |
| `notify_care_team` | deterministic | Push to inbox; runs in parallel on the escalation path | queue failure → logged, patient unaffected |
| `persist` | deterministic | Write `TriageOutcome`, close thread | — |

**`validate` is what makes `sourceSpan` load-bearing.** If Gemini invents a symptom, it cannot produce a span that appears in the patient's text, so the finding is dropped before it can influence any rule. Hallucination is contained at the boundary, deterministically.

**`explain`'s template fallback is the demo-survival mechanism.** If Gemini is slow, rate-limited, or dead, the patient gets a pre-written explanation instead of a generated one. Rule engine, severity, and escalation route are unaffected.

### 6.3 State schema

Current JS API (`StateGraph` / `StateSchema` / `ReducedValue`), Gemini bound via `ChatGoogleGenerativeAI`:

```ts
const State = new StateSchema({
  // identity
  patientId: z.string(),
  reportId: z.string(),
  recoveryDay: z.number(),

  // input
  modality: z.enum(["structured", "free_text", "voice"]),
  rawText: z.string(),
  structuredAnswers: z.record(z.string(), z.unknown()).optional(),
  vitals: VitalsSchema.optional(),        // optional, unused in MVP

  // extraction
  findings: new ReducedValue(Finding.array().default(() => []),
    { reducer: (x, y) => x.concat(y) }),
  extractionConfidence: z.number(),
  unmappedSpans: new ReducedValue(z.array(z.string()).default(() => []),
    { reducer: (x, y) => x.concat(y) }),

  // evaluation
  ruleEvaluations: new ReducedValue(RuleEvaluation.array().default(() => []),
    { reducer: (x, y) => x.concat(y) }),
  severity: SeverityEnum.optional(),
  winningRuleId: z.string().optional(),
  requiresHumanReview: z.boolean().default(false),

  // human
  humanDecision: HumanDecisionSchema.optional(),

  // output
  escalationRoute: z.string().optional(),
  explanation: z.string().optional(),
});
```

`ReducedValue` on the three array fields rather than plain arrays: `notify_care_team` and `explain` run in parallel off the escalation branch, and append-only reducers make concurrent writes safe instead of last-writer-wins. It also means a retried `extract` appends rather than clobbers.

### 6.4 Checkpointer and thread identity

`MemorySaver`, `config.configurable.thread_id`. **`thread_id` is per *report*, not per patient** — `report-{uuid}`.

A per-patient thread would mean every check-in resumes the same long-lived paused graph, requiring the graph to loop back to a waiting state after `persist` and leaving dormant threads alive. Per-report threads are one graph run per check-in, and the patient timeline becomes a plain DB query over `TriageOutcome` ordered by `reportedAt`. Same outcome, materially less graph complexity.

**Honest limitation:** `MemorySaver` is in-process. A paused nurse review does not survive a server restart. Invisible within one demo session; not production-shaped.

### 6.5 Failure modes, exhaustively

| Failure | Behaviour | Safe direction? |
|---|---|---|
| Gemini down / rate-limited | `extraction_failed` → human review; `explain` → template | Yes — escalates |
| Gemini invents a symptom | `validate` drops it | Yes — contained |
| Gemini returns malformed JSON | `extraction_failed` → human review | Yes — escalates |
| No rule fires | class-4 default → human review | Yes — escalates |
| Nurse does not respond in N minutes | severity floors at `CALL_CLINIC` | Yes — never auto-reassures |
| Rule config missing for procedure | class 4 → human review | Yes — escalates |

Every row fails toward more human involvement, never less. There is no path where the system degrades into telling someone they are fine.

---

## 7. API surface and data flow

### 7.1 The bifurcation must survive to the HTTP layer

- **Escalation path** — no interrupt fires; `POST /api/reports` completes inside the request and returns the `TriageOutcome`. `200`.
- **Reassurance, confident** — same. `200`, direct.
- **Reassurance, uncertain** — `interrupt()` fires; no verdict exists yet. Return `202` with `{ reportId, status: "pending_review" }` and let the client subscribe.

If a network hiccup or slow LLM pushes an escalation past the client's timeout, the client does **not** retry-into-a-spinner. It shows the last known severity, or a neutral "checking" state with the one-tap call button still live. **Escalation information never sits behind a loading state.**

### 7.2 Endpoints

| Method | Route | Purpose | Notes |
|---|---|---|---|
| `POST` | `/api/plans/extract` | Discharge photo → draft `RecoveryPlan` | Gemini multimodal. Returns draft + `sourceSpans` per field. |
| `POST` | `/api/plans/:id/confirm` | Human confirms/corrects extracted plan | Sets `confirmedBy`. Plan inert until this runs. |
| `GET` | `/api/patients/:id/today` | Phase-aware task list for today | Pure computation from `RecoveryPlan` + `surgeryDate`. No LLM. |
| `POST` | `/api/reports` | Submit symptom check-in → runs the graph | `200` = verdict, `202` = pending review |
| `GET` | `/api/reports/:id` | Poll outcome / subscribe via SSE | Used by the `202` client |
| `POST` | `/api/reports/:id/review` | Nurse approve / edit / override | Calls `Command({ resume })` |
| `GET` | `/api/nurse/inbox` | Escalation queue | `TriageOutcome` where `requiresHuman` or `severity ≥ URGENT_CARE` |

`POST /api/reports` invokes the graph once; if `result.__interrupt__` is present, the route returns `202` and does not block. `POST .../review` invokes the *same* graph with `new Command({ resume })` and the same `thread_id`, resuming from the checkpoint.

### 7.3 Deployment constraint

`MemorySaver` lives in the process that created the checkpoint. `POST /api/reports` and `POST /api/reports/:id/review` **must hit the same Node process**, or the resume finds no checkpoint and the review silently fails.

- Localhost / single long-lived Node server — fine. **This is the chosen target.**
- Vercel serverless — not fine without a persistent checkpointer. See §9 conditional.

### 7.4 Data flow

```
discharge PDF/photo ──► /api/plans/extract ──► Gemini vision ──► draft plan
                                                                     │
                                                    /confirm ◄───────┘  (human gate)
                                                         │
                                              RecoveryPlan + Phase[]
                                                         │
        ┌────────────────────────────────────────────────┘
        ▼
   /api/patients/:id/today  ──► task list (deterministic)

   patient check-in ──► POST /api/reports
                              │
                        graph: ingest → extract → validate → evaluate_rules → triage
                              │
                    ┌─────────┴──────────┐
          severity ≥ URGENT_CARE   severity ≤ CALL_CLINIC
                    │                    │
             explain (fast)        requiresHumanReview?
             notify_care_team           │        │
                    │                 yes        no
                 persist ◄─────────────┤         │
                    │            interrupt()    │
                    │                  │        │
                200 ◄─────────────────┼────────┘
                                      ▼
                            202 { pending_review }
                                      │
                          /api/reports/:id/review  (nurse)
                                      │
                              Command({ resume })
                                      │
                              explain → persist → 200
```

`notify_care_team` runs **concurrently** with `explain` on the escalation branch, not before it. The patient gets their answer at the same time the nurse gets notified — neither waits on the other.

### 7.5 Persistence

**Prisma + SQLite.** The model is genuinely relational — `RuleEvaluation` rows keyed to `SymptomReport`, findings keyed to rules, a timeline query for the between-visit summary. Reconstructing that from a JSON blob to answer "which rule fired and on what evidence" is exactly the query a judge will ask for. SQLite keeps it to a single file with no service to run.

Bonus: the patient timeline becomes `SELECT ... ORDER BY reported_at` over `TriageOutcome`, not a graph traversal. That is the payoff from dropping per-patient threads.

### 7.6 Error handling

| Condition | Response | Client behaviour |
|---|---|---|
| Graph throws | `500` + `reportId`, no severity | Show call button + "couldn't check, call your clinic" |
| Gemini timeout in `extract` | Graph routes to class 4 → human review → `202` | "A nurse will review this" |
| Gemini timeout in `explain` | Template fallback → `200` with real verdict | Normal, invisible |
| `POST /review` with no checkpoint | `409` + reason | Nurse sees "review expired, re-open report" |
| Check-in submitted twice | Idempotency key on `reportId` → returns first outcome | No duplicate escalation |

---

## 8. UI surfaces

### 8.1 Surfaces

| Surface | Route | Who | Built for |
|---|---|---|---|
| Plan setup | `/setup` | Patient or caregiver | One-time, at discharge |
| Today + triage | `/` | Patient or caregiver | Daily, 30 seconds |
| Nurse inbox | `/nurse` | Nurse / care team | Event-driven |

Mobile-first throughout. The nurse inbox is the only desktop layout, and it is a stretch goal.

### 8.2 The severity ladder is the entire visual system

| Severity | Colour | Treatment | Primary action |
|---|---|---|---|
| `SELF_CARE` | Calm neutral | Inline text, no card | "Got it" |
| `CALL_CLINIC` | Amber | Card + what to say on the phone | Tap-to-call, prefilled context |
| `URGENT_CARE` | Orange | Full-bleed card, blocks scrolling | Tap-to-call + directions |
| `EMERGENCY` | Red | Full-screen, cannot dismiss without acknowledging | Tap-to-call |

The prefilled "what to say on the phone" matters: an anxious patient calling a clinic at 11pm should not have to reconstruct their history. The app hands them the sentence — *"I'm 4 days post-appendectomy, I have a fever of 38.4 and my wound is more red than yesterday."*

### 8.3 The `202` pending state

A patient submits "my calf is sore and puffy" and gets back *a nurse is reviewing this.* They are anxious, possibly deteriorating, and the app just went quiet. This is the worst moment in the product.

**Design answer: the pending state is not a dead end, it is a red-flag self-check.**

```
A nurse is reviewing your check-in.

While you wait — if ANY of these are true, call emergency
services now. Do not wait for us:

  □ Chest pain or trouble breathing
  □ You cannot put weight on the leg at all
  □ The area is hot, red, and spreading fast
  □ You feel faint or confused

       [ Call emergency services ]   [ Call my clinic ]
```

The bullets are class-1 rules rendered as patient-readable text — the same rule set that would have escalated, shown directly to the patient. So even on the path where the system is uncertain, the patient is not left with less information than the deterministic layer would have given them.

**Uncertainty never reduces what the patient knows.**

**Accepted trade-off:** this shows red flags to every patient on the interrupted path, including ones whose symptoms resemble none of them. That will make some people anxious who did not need to be. The trade is judged correct here — it is a safety net, not a diagnosis — but it is a deliberate choice, not an oversight.

### 8.4 Patient surfaces

**Plan setup** — photo capture → extracted plan as a checklist with the original text beside each simplified line → caregiver confirmation. Each row shows the `sourceSpan` it came from, so a wrong extraction is visible to the human rather than silently baked in. Plan is inert until confirmed.

**Today** — ordered task list for `recoveryDay`, generated deterministically from the plan. Each task: plain-language instruction, tap to complete. Header carries language toggle and speaker button (TTS readout). One persistent button: **"Is this normal?"**

**Triage** — two entry modes:
- *Chip intake* — tap through onset / location / severity / associated symptoms. Fast, comparable structured data.
- *Free text or voice* — "my calf's been sore and puffy since yesterday." Voice via Web Speech API to text.

Both land in the same `extract` node. The chip path is pre-segmented, which raises confidence and usually skips the interrupt.

### 8.5 Nurse inbox

Queue ranked by severity then age. Each row expands to: the patient's own words, the extracted findings with `sourceSpan` highlighted, every `RuleEvaluation` row including the ones that **did not** fire, and the proposed outcome.

Two buttons: **Confirm** and **Override**. Override requires picking a different severity and a one-line reason, writing a `humanDecision`. Critically, **an override is never shown to the patient as a downgrade** — the patient sees "a nurse reviewed this." A human overriding downward is a clinical act with a clinician's name on it, not a system reassertion.

### 8.6 Demo script (3 minutes)

1. Photograph a discharge sheet → plan appears, structured (20s)
2. Today view, day 4 — tap through two tasks (20s)
3. Type "my calf is sore and puffy" → **escalation fires, immediate, no gate** (30s)
4. Type "my wound is a bit pink" → **202 pending, red-flag self-check shown** (30s)
5. Cut to nurse inbox → confirm → patient view updates (40s)
6. Kill the Gemini API key mid-demo, repeat step 3 → **still escalates, template explanation** (30s)

Step 6 is the difference between "we built an LLM app" and "we built a system that survives its LLM."

---

## 9. Build order

Sequenced so that every checkpoint is demoable, and the safety-critical deterministic core exists before any LLM touches it.

| # | Milestone | Deliverable | Demoable at end? |
|---|---|---|---|
| 1 | Scaffold | `create-next-app`, Prisma + SQLite, schema from §4 | No |
| 2 | Rule engine | Rules as data, evaluator, table-driven tests. No graph, no LLM. | No — but this is the spine |
| 3 | Graph, stubbed LLM | Full topology from §6 with a fake extractor/explainer. Interrupt verified. | **Yes** |
| 4 | API layer | §7 endpoints against the stubbed graph | **Yes** |
| 5 | Patient UI | Today + triage + severity ladder + pending state | **Yes** |
| 6 | Gemini, real | Swap stub for `ChatGoogleGenerativeAI` in `extract` and `explain`; template fallback | **Yes** |
| 7 | Nurse inbox | Queue, confirm/override, resume | **Yes** |
| 8 | Plan extraction | Discharge photo → draft plan, multimodal node | **Yes** |

**Why Gemini comes at milestone 6, after the entire UI is built:** if the model integration goes in first, every downstream bug is ambiguous — is it the prompt, the graph, or the component? Stubbing first means when the real model goes in, it is the only variable that changed. And if Gemini is still flaky late in the build, there is a fully working product with a stub and a demo that shows the architecture honestly.

**Why plan extraction is last:** it is the highest-variance piece. Multimodal extraction from a photographed document either works in an hour or eats four. It is also the most cuttable without hurting the core claim.

**Accepted trade-off:** the first half of the build contains no AI. If judges watch the repo rather than the demo, that is visible.

### 9.1 Cut list (cut from the top)

1. Vitals entry (already deferred)
2. Multilingual beyond English + one other (pick one)
3. Voice input (keep TTS readout — cheaper, higher impact for elderly patients)
4. Nurse inbox → read-only list, no override
5. Between-visit summary export
6. Plan extraction → hand-seeded plans for the 3 demo procedures
7. Teach-back quiz

**Never cut:** the rule engine, the bifurcated interrupt, the grounding check in `validate`, the template fallback. Those four are the product.

### 9.2 Conditional: if deployment is added later

Insert between milestones 1 and 3: **swap `MemorySaver` for the Postgres checkpointer.** Same LangGraph API — the compile call changes and nothing else does. Budget ~2 hours including provisioning. Without it, `POST /review` returns `409` whenever the resume lands on a different instance, and demo step 5 breaks in a way that looks like a logic bug but is not.

---

## 10. Testing

The deterministic core is where tests live, and it is the only part worth claiming coverage on.

**Rule engine** — table-driven, one case per rule, plus precedence tests (class 1 beats class 3 beats class 2; class 3 can raise but never lower).

**`validate` grounding** — feed findings with fabricated `sourceSpan` values, assert they are dropped.

**Graph routing** — inject a stub LLM, assert every severity routes correctly and that `interrupt()` fires on exactly the reassurance cases and never on escalation.

**Route handlers** — tested with the graph stubbed, so the HTTP contract is verified independently of the LLM:
- `202` returned **iff** `__interrupt__` is present — not on severity, not on confidence
- Escalation path returns `200` with a verdict under a simulated 3s LLM stall
- `POST /review` with a stale `thread_id` returns `409`, does not throw
- Idempotent double-submit returns identical outcome, one `SymptomReport` row

**Extraction** — not unit-tested. ~20 hand-labeled narratives scored for field-level accuracy. This is an eval with a number attached, not a test suite.

---

## 11. Final claims

Three sentences that must remain true through implementation. If any stops being true, that is a bug worth stopping for.

1. Every symptom check-in is classified by a deterministic rule engine; the LLM extracts findings and writes the explanation, and cannot alter severity.
2. Every failure mode — LLM down, LLM hallucinating, no rule matching, nurse unresponsive — degrades toward *more* human involvement, never less. There is no path to a false reassurance.
3. Escalations are never gated behind human approval; reassurances always are.

## 12. Clinical disclaimer

This is a hackathon prototype. It is not a medical device, does not diagnose, does not prescribe, and does not replace clinical judgment. The rule set is unvalidated domain knowledge, not clinician-reviewed protocol. Any real deployment requires clinician authorship of the rules, regulatory review (FDA SaMD / EU AI Act high-risk classification), and a prospective safety evaluation. Demo data must be synthetic and labelled as such.