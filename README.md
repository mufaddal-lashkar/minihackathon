# RecoverWell — post-operative recovery triage

Patient-facing symptom triage where **severity is always decided by a deterministic rule table**, never by the LLM.
Gemini is used only to (1) extract findings from free text with verbatim `sourceSpan` grounding and (2) phrase the
explanation. Class-1 red flags are caught by a regex pre-filter **before any LLM call**, so Gemini being down never
changes whether "I have chest pain" escalates.

## Run

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY (optional — falls back to keyword extractor + templates)
npm run dev
```

- `/` — pick a demo patient (appendectomy day 4, knee replacement day 6 on anticoagulants + diabetic, C-section day 3)
- `/patient/:id` — Today view + "Something feels off?" sheet (chips, free text, voice)
- `/nurse` — inbox: pending reassurances (interrupted graph, awaiting confirm/override) and auto-sent escalations, with the full fired / not-fired rule table

## Pipeline (LangGraph JS)

`ingest → pre_filter → (Class-1 hit ? evaluate_rules : extract → validate → evaluate_rules) → triage → (human_review ⏸ | explain) → (notify_care_team | persist)`

- `pre_filter` — regex Class-1 red flags (chest pain, dyspnea, syncope, calf pain+swelling, soaking bleed, dehiscence, confusion, urinary retention, fever ≥38)
- `extract` — Gemini structured output (or keyword stub). Never outputs severity.
- `validate` — drops any finding whose `sourceSpan` is not a literal substring of the patient's words
- `evaluate_rules` — `data/rules/<procedure>.json`: Class 2 (procedure+day expectations), Class 3 (patient-flag modifiers, raise-only), Class 4 (catch-all → human review)
- `triage` — URGENT_CARE/EMERGENCY return `200` immediately. SELF_CARE/CALL_CLINIC from a Class-2/4 rule `interrupt()` → `202 pending_review` until a nurse confirms/overrides.

## API

- `POST /api/reports {patientId, rawText, modality?}` → `200` outcome or `202 pending_review`
- `GET /api/reports/:id` — poll
- `POST /api/reports/:id/review {action: confirm | override, severity?, reason?}` — resumes the graph
- `GET /api/nurse/inbox`

## Demo script

1. Asha (appendectomy, day 4): chip **"My wound looks a bit red"** → 202, nurse sees rule `app-2-007` fired, confirms → patient card flips to CALL CLINIC "a nurse reviewed this".
2. Same patient: type **"I have chest pain"** → instant EMERGENCY, no nurse gate, extraction shows *keyword/none* — the LLM was never called.
3. Ravi (knee, anticoagulated, 72): **"my calf is sore and puffy"** → URGENT CARE via Class-1 pre-filter.
4. Kill `GEMINI_API_KEY` → repeat 2 & 3: identical outcomes.
