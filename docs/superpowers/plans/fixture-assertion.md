# Fixture assertion — hand-checked against the spec

Each fixture below is traced to the spec line that mandates its expected outcome.
Format: `id | raw text | spec basis for class | spec basis for route | verdict`.

Source spec: `docs/superpowers/specs/2026-09-11-post-op-recovery-triage-design.md`.

```
fx-01 | my calf is sore and puffy | §5 Class 1 (unilateral calf pain + swelling) | §8.6 step 3 escalation | OK
fx-02 | my wound is a bit more pink than yesterday | §5 Class 2 (new wound redness, healing phase) | §8.3 + §8.6 step 4 → 202 | OK
fx-03 | there is some clear fluid on the dressing | §5 Class 2 (serous drainage expected, day 2) | §8.6 step 3 self-care | OK
fx-04 | there is some clear fluid on the dressing | §5 Class 2 (drainage past day 3 is not expected) | §8.3 + §8.6 step 4 → 202 | OK
fx-05 | I have chest pain | §5 Class 1 (chest pain) | §8.6 step 3 escalation | OK
fx-06 | I feel a bit tired today | §5 Class 4 (catch-all, nothing matched) | §8.3 + §8.6 step 4 → 202 | OK
fx-07 | the wound is bleeding through the dressing | §5 Class 1 (soaking-through bleeding) | §8.6 step 3 escalation | OK
fx-08 | my incision has opened up a little | §5 Class 1 (wound dehiscence) | §8.6 step 3 escalation | OK
fx-09 | I fainted when I stood up | §5 Class 1 (syncope) | §8.6 step 3 escalation | OK
fx-10 | I feel confused and not myself | §5 Class 1 (confusion) | §8.6 step 3 escalation | OK
fx-11 | I haven't been able to pee all day | §5 Class 1 (inability to urinate) | §8.6 step 3 escalation | OK
fx-12 | I am short of breath | §5 Class 1 (dyspnea) | §8.6 step 3 escalation | OK
fx-13 | my temperature is 38.5 | §5 Class 1 (fever ≥ 38 °C) | §8.6 step 3 escalation | OK
fx-14 | there is a little blood when I wipe | §5 Class 3 (anticoagulated + bleeding raises one level) | §8.6 step 3 escalation | OK
fx-15 | the wound is a bit red | §5 Class 3 (diabetic + wound redness raises one level) | §8.6 step 3 escalation | OK
fx-16 | my husband says I seem confused | §5 Class 1 (confusion — precedes the Class-3 age modifier) | §8.6 step 3 escalation | OK, see ruling A
fx-17 | my knee feels stiff and I can't bend it as far | §5 Class 2 (decreased ROM at day 7+) | §8.3 + §8.6 step 4 → 202 | OK
fx-18 | the bleeding is heavy like a period | §5 Class 2 (heavy lochia expected, days 0-10) | §8.6 step 3 self-care | OK
fx-19 | the bleeding is still heavy like a period | §5 Class 2 (heavy lochia past day 14 is not expected) | §8.3 + §8.6 step 4 → 202 | OK
fx-20 | my calf is sore and puffy (voice) | §5 Class 1, same phrase as fx-01 via the voice modality | §8.6 step 3 escalation | OK
```

## Rulings made while asserting

**Ruling A — fx-16 resolves as Class 1, not Class 3.** The plan lists "age ≥ 70 + new confusion" as a Class-3 raise fixture, but the spec's Class-1 list includes confusion outright and §5 states that classes are evaluated in strict priority order with first match winning. A Class-1 hit therefore short-circuits before any Class-3 modifier can be the winning class. The fixture is kept as a Class-1 case; the Class-3 rule `app-3-003` still exists and still matters for a patient aged 70+ whose confusion the pre-filter misses (e.g. phrased as "mum is not making sense"). Cost if wrong: one fixture's `expectedClass` is off by two, and the Class-3 age band is under-covered by the table.

**Ruling B — fx-02 needs a rule the plan did not name.** §8.3 (post-fix) uses "my wound is a bit more pink than yesterday" as *the* example that returns `202` pending review. The plan's Task 0.1 sample only defines `spreading_redness` in the healing phase as `URGENT_CARE` (route `200`), which would make §8.3's own demo beat unreachable. Rule `app-2-007` was added: `wound_redness` in the healing phase → `CALL_CLINIC` → `call_clinic`. The more severe `spreading_redness` rule is unchanged. Cost if wrong: one extra Class-2 rule that the reviewer may judge redundant.

**Ruling C — the fixture shape gains an optional `modality` field.** The plan's declared shape omits it, but Task 0.2 explicitly asks for "a voice-modality duplicate of fx-01". Without a modality field that fixture is byte-identical to fx-01 and asserts nothing new. `modality` defaults to `"text"` and is `"voice"` on fx-20. Cost if wrong: one extra optional key in a JSON file that nothing yet parses.

**Ruling D — fx-15 is day 1, not day 6.** In the healing phase, Class-2 `spreading_redness` fires first and reaches `URGENT_CARE` on its own, so a Class-3 fixture placed there would prove nothing about modifiers. Day 1 (early phase) has no Class-2 redness rule, so the Class-3 diabetic modifier is genuinely load-bearing. Cost if wrong: the modifier's interaction with an already-escalated Class-2 rule goes untested.