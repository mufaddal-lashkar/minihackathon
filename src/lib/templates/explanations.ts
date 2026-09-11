import type { Severity } from "@/lib/rules/types";

const BY_SEVERITY: Record<Severity, string> = {
  SELF_CARE: "This sounds like a normal part of recovery. Keep following your plan and check in again tomorrow.",
  CALL_CLINIC: "This is worth a call to your clinic today. It is probably nothing urgent, but they should hear about it.",
  URGENT_CARE: "You should be seen today. Go to urgent care, or call your clinic and tell them you were advised to come in.",
  EMERGENCY: "Call emergency services now. Do not wait.",
};

export function templateExplanation(severity: Severity): string {
  return BY_SEVERITY[severity];
}

export const STUB_KEYWORDS: Array<[RegExp, string]> = [
  [/(spread|growing|bigger|getting worse).{0,20}(red|pink)|(red|pink).{0,30}(spread|growing|bigger)/i, "spreading_redness"],
  [/(pink|redder|redness|\bred\b)/i, "wound_redness"],
  [/(pus|cloudy|smelly|yellow|green).{0,20}(fluid|drain|ooz|discharge)|(fluid|drain|ooz|discharge).{0,20}(pus|cloudy|smelly)/i, "wound_drainage"],
  [/(clear|watery|some) (fluid|drain\w*|ooz\w*)|(fluid|drainage|oozing|discharge)/i, "serous_drainage"],
  [/(heavy|soaking|clots?).{0,20}(bleed|blood|pad)|(bleed|blood|pad).{0,20}(heavy|clots?)/i, "lochia_heavy"],
  [/(bleed\w*|blood)/i, "bleeding"],
  [/(swell|swollen|puffy)/i, "mild_swelling"],
  [/(stiff|can'?t bend|hard to bend|not bending)/i, "decreased_rom"],
  [/(confus\w*|forgetful|foggy)/i, "new_confusion"],
  [/(warm|slightly warm|bit warm|low.?grade|37\.\d)/i, "low_grade_temp"],
  [/(breast|engorg)/i, "breast_engorgement"],
  [/(severe|really bad|unbearable|worse) (pain|ache)|(pain|ache).{0,20}(severe|really bad|unbearable|10\/10)/i, "incisional_pain"],
  [/(pain|ache|sore|tender|hurts)/i, "mild_incisional_pain"],
  [/(tired|fatigue|exhausted|sleepy)/i, "fatigue"],
  [/(nause\w*|sick to my stomach|vomit\w*)/i, "nausea"],
  [/(constipat\w*|haven'?t pooped|no bowel)/i, "constipation"],
  [/(sleep|insomnia)/i, "poor_sleep"],
  [/(appetite|not hungry|not eating)/i, "reduced_appetite"],
];
