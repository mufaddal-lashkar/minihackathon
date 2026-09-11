import type { Finding, Severity } from "./types";

type Class1Pattern = {
  ruleId: string;
  symptomCode: string;
  severity: Severity;
  require: RegExp[];
  minMatches: number;
  rationale: string;
};

export const CLASS1_PATTERNS: Class1Pattern[] = [
  { ruleId: "c1-chest", symptomCode: "chest_pain", severity: "EMERGENCY", rationale: "Chest pain after surgery may indicate pulmonary embolism or a cardiac event.",
    require: [/(chest pain|chest is tight|pressure in my chest|crushing chest|chest hurts)/i], minMatches: 1 },
  { ruleId: "c1-breath", symptomCode: "dyspnea", severity: "EMERGENCY", rationale: "Shortness of breath after surgery may indicate pulmonary embolism.",
    require: [/(can'?t breathe|cannot breathe|short of breath|trouble breathing|breathless|hard to breathe)/i], minMatches: 1 },
  { ruleId: "c1-sync", symptomCode: "syncope", severity: "EMERGENCY", rationale: "Loss of consciousness is an emergency.",
    require: [/(passed out|fainted|blacked out|lost consciousness|collapsed)/i], minMatches: 1 },
  { ruleId: "c1-calf", symptomCode: "calf_pain_with_swelling", severity: "URGENT_CARE", rationale: "Calf pain with swelling suggests deep vein thrombosis.",
    require: [/\bcalf\b/i, /(sore|swell|swollen|puffy|tender|hot|pain)/i], minMatches: 2 },
  { ruleId: "c1-bleed", symptomCode: "soaking_bleeding", severity: "URGENT_CARE", rationale: "Bleeding that soaks a dressing needs same-day assessment.",
    // Needs an actual bleeding word AND a "won't stop / soaking / through the dressing" qualifier.
    require: [/(blood|bleed\w*)/i, /(soak\w*|dripping|won'?t stop|keeps? (coming|bleeding)|running|pouring|through the (dressing|bandage|gauze|pad))/i], minMatches: 2 },
  { ruleId: "c1-dehisc", symptomCode: "wound_dehiscence", severity: "URGENT_CARE", rationale: "A wound that has opened needs same-day assessment.",
    require: [/(wound|incision|stitches|staples)/i, /\b(opened( up)?|is open|has opened|come apart|came apart|coming apart|gaping|split open)\b/i], minMatches: 2 },
  { ruleId: "c1-conf", symptomCode: "confusion", severity: "EMERGENCY", rationale: "New confusion after surgery is a hard red flag.",
    // "confused about the tablets" is a question, not a symptom.
    require: [/(\bconfus(ed|ion)\b(?!\s+(about|by|with|on|over|regarding|as to))|disorient\w*|not making (any )?sense|doesn'?t know where|don'?t know where I am)/i], minMatches: 1 },
  { ruleId: "c1-urine", symptomCode: "urinary_retention", severity: "URGENT_CARE", rationale: "Inability to pass urine needs same-day assessment.",
    require: [/(can'?t (pee|urinate|pass urine)|(unable|not been able|haven'?t been able) to (pee|urinate)|haven'?t (peed|urinated)|not (peed|urinated))/i], minMatches: 1 },
  { ruleId: "c1-fever", symptomCode: "fever_38", severity: "URGENT_CARE", rationale: "Fever of 38°C or higher after surgery suggests infection.",
    require: [/(\b3[89](\.\d+)?\s*(°\s*C|celsius|degrees|c\b)|fever of 3[89]|temp\w* (of|is) 3[89]|\b10[0-9](\.\d+)?\s*(°\s*F|fahrenheit|f\b)|high fever)/i], minMatches: 1 },
];

export type PreFilterResult =
  | { hit: true; finding: Finding; severity: Severity; ruleId: string; rationale: string }
  | { hit: false };

export function preFilter(rawText: string): PreFilterResult {
  for (const p of CLASS1_PATTERNS) {
    const matched = p.require.filter((re) => re.test(rawText));
    if (matched.length < p.minMatches) continue;
    const spanMatch = matched[0].exec(rawText);
    const sourceSpan = spanMatch ? spanMatch[0] : rawText.slice(0, 40);
    return { hit: true, ruleId: p.ruleId, severity: p.severity, rationale: p.rationale, finding: { symptomCode: p.symptomCode, sourceSpan } };
  }
  return { hit: false };
}
