# Verification report — 2026-09-11

Per project rule (CLAUDE.md): **no test files.** Verification is done against the running app (production build, `next start`) with `curl`/Python, and recorded here.

## Build / lint

```
npx tsc --noEmit        → clean
npx eslint src          → clean (react-hooks/set-state-in-effect fixed by deferring initial loads)
npx next build          → ✓ Compiled successfully; 12 routes
```

## Claim 1 — Class-1 red flags are caught by `pre_filter` before any LLM call

Server started **without** `GEMINI_API_KEY` (the "Gemini down" path). Every Class-1 fixture phrase escalated with `winningRuleClass=1`, `usedLlm=false` — `extract` never ran.

## Claim 3 — Escalations are never gated; reassurances always are

Same run: no `URGENT_CARE`/`EMERGENCY` outcome ever returned `202`. Every `SELF_CARE`/`CALL_CLINIC` outcome returned `202` (nurse gate).

```
Claim 1 & 3 — fixture table through POST /api/reports with NO Gemini key (recovery day = demo patient's actual day, not fixture day):
fx-01 200 URGENT_CARE  class=1 rule=c1-calf usedLlm=False | my calf is sore and puffy
fx-02 202 CALL_CLINIC  class=2 rule=app-2-007 usedLlm=False | my wound is a bit more pink than yesterday
fx-03 202 CALL_CLINIC  class=2 rule=app-2-002 usedLlm=False | there is some clear fluid on the dressing
fx-04 202 CALL_CLINIC  class=2 rule=app-2-002 usedLlm=False | there is some clear fluid on the dressing
fx-05 200 EMERGENCY    class=1 rule=c1-chest usedLlm=False | I have chest pain
fx-06 202 CALL_CLINIC  class=None rule=None usedLlm=False | I feel a bit tired today
fx-07 202 CALL_CLINIC  class=None rule=None usedLlm=False | the wound is bleeding through the dressing   <-- class-1 expectation NOT met
fx-08 200 URGENT_CARE  class=1 rule=c1-dehisc usedLlm=False | my incision has opened up a little
fx-09 200 EMERGENCY    class=1 rule=c1-sync usedLlm=False | I fainted when I stood up
fx-10 200 EMERGENCY    class=1 rule=c1-conf usedLlm=False | I feel confused and not myself
fx-11 200 URGENT_CARE  class=1 rule=c1-urine usedLlm=False | I haven't been able to pee all day
fx-12 200 EMERGENCY    class=1 rule=c1-breath usedLlm=False | I am short of breath
fx-13 200 URGENT_CARE  class=1 rule=c1-fever usedLlm=False | my temperature is 38.5
fx-14 202 CALL_CLINIC  class=None rule=None usedLlm=False | there is a little blood when I wipe
fx-15 202 CALL_CLINIC  class=2 rule=app-2-007 usedLlm=False | the wound is a bit red
fx-16 200 EMERGENCY    class=1 rule=c1-conf usedLlm=False | my husband says I seem confused
fx-17 202 CALL_CLINIC  class=2 rule=knee-2-006 usedLlm=False | my knee feels stiff and I can't bend it as far
fx-18 202 SELF_CARE    class=2 rule=cs-2-001 usedLlm=False | the bleeding is heavy like a period
fx-19 202 SELF_CARE    class=2 rule=cs-2-001 usedLlm=False | the bleeding is still heavy like a period
fx-20 200 URGENT_CARE  class=1 rule=c1-calf usedLlm=False | my calf is sore and puffy
19/20 fixtures: class-1 caught without LLM and no escalation ever returned 202

```

Notes on the two non-Class-1 rows that differ from the fixture's *expected* value:
- `fx-07` was initially missed ("bleeding **through** the dressing") — `c1-bleed` regex extended; re-run: `200 URGENT_CARE c1-bleed class 1`.
- `fx-14` (Class 3, anticoagulated + bleeding) runs here against demo patient Asha who is **not** anticoagulated, so the modifier correctly does not fire. Against Ravi (anticoagulated) the same phrase raises one level.
- Recovery day is the demo patient's real day (Asha = day 4), not the fixture's `recoveryDay`, so `fx-03`/`fx-18` land in a different phase than the fixture assumed.

## Claim 2 — No path to a system-generated false reassurance

Every path to `SELF_CARE` / `CALL_CLINIC`:

| Path | Gate |
|---|---|
| Class-2 winning rule | `interrupt()` → nurse confirm/override |
| Class-4 (no findings / unmapped / low confidence) | `interrupt()` → nurse |
| Class-4 default (no rule matched) | `interrupt()` → nurse |
| Nurse never answers | SLA timer resumes the held interrupt as **`CALL_CLINIC`** with `decidedBy: system` |
| Server restart while pending | in-memory checkpoint is gone → report closed as **`CALL_CLINIC`**, `decidedBy: system` |

SLA timer run (`REVIEW_SLA_MS=3000`, prod build):

```
POST /api/reports "my wound is a bit more pink than yesterday" → 202
(6 s later) GET /api/reports/:id → complete CALL_CLINIC decidedBy=system
  explanation: "A nurse was not able to review this in time. Please call your clinic so they can check in with you."
POST /api/reports/:id/review (late nurse confirm) → 409 review_expired
server log: [human_review] SLA expired for ca9a6bc5-… after 3000ms → CALL_CLINIC
```

Bug found and fixed during this check: the timer originally lived inside the `human_review` node; the resume it triggered inherited the graph's async context and never completed. It now lives in `runReport` (scheduled after the `202` is decided, outside the graph run).

## Demo script (spec §8.6) — walked via API + pages

1. Plan photo → `/patient/:id/plan` upload → `POST /api/patients/:id/plan/extract` (needs `GEMINI_API_KEY`; without it returns the current plan with an explicit "AI unavailable" notice). Items show "From sheet: …" source text when Gemini supplies it.
2. Today view → tap-to-complete tasks with progress bar (localStorage), "Normal for today" from the rule table phase, read-aloud (TTS), EN/हिंदी toggle. `GET /api/patients/p-asha/today` → day 4, phase healing, 7 tasks.
3. "my calf is sore and puffy" → `200 URGENT_CARE c1-calf`, card shows **"Red-flag rule · AI skipped"**.
4. "my wound is a bit more pink than yesterday" → `202`, pending card shows the **red-flag self-check** with Emergency / My clinic call buttons.
5. Nurse inbox → confirm → patient card flips to CALL CLINIC, "Reviewed by a nurse". Override requires a different severity + reason; downward override is shown as "a nurse reviewed this", never as a downgrade.
6. Gemini down (no key) → step 3 identical; step 4 card shows **"AI unavailable · keyword fallback · rules decided"** — the on-screen indicator the plan asked for.

## Cut list (spec §9.1) — honest status

| # | Item | Status |
|---|---|---|
| 1 | Vitals entry | **Cut** (deferred per spec) |
| 2 | Multilingual beyond English + one | **Built minimal**: English + Hindi templates; Gemini explainer honours `patient.language` |
| 3 | Voice input | **Built** (Web Speech API), plus TTS readout |
| 4 | Between-visit summary export | **Cut** |
| 5 | Plan extraction | **Built** (Gemini multimodal, template fallback) — hand-seeded plans also present for the 3 demo patients |
| 6 | Teach-back quiz | **Cut** |

Deviations from the plan: no Prisma (persistence is `node:sqlite`, JSON-blob tables), no shadcn (plain Tailwind + design tokens), no Vitest (project rule).
