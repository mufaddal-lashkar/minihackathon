import type { Severity } from "@/lib/rules/types";

const BY_SEVERITY: Record<Severity, string> = {
  SELF_CARE: "This sounds like a normal part of recovery. Keep following your plan and check in again tomorrow.",
  CALL_CLINIC: "This is worth a call to your clinic today. It is probably nothing urgent, but they should hear about it.",
  URGENT_CARE: "You should be seen today. Go to urgent care, or call your clinic and tell them you were advised to come in.",
  EMERGENCY: "Call emergency services now. Do not wait.",
};

const BY_SEVERITY_HI: Record<Severity, string> = {
  SELF_CARE: "यह रिकवरी का सामान्य हिस्सा लगता है। अपनी योजना का पालन करते रहें और कल फिर से जाँच करें।",
  CALL_CLINIC: "आज अपने क्लिनिक को फ़ोन करें। शायद यह गंभीर नहीं है, लेकिन उन्हें पता होना चाहिए।",
  URGENT_CARE: "आज ही डॉक्टर को दिखाएँ। अर्जेंट केयर जाएँ, या क्लिनिक को फ़ोन करके बताएँ कि आपको आने की सलाह दी गई है।",
  EMERGENCY: "अभी आपातकालीन सेवा को फ़ोन करें। इंतज़ार न करें।",
};

const BY_SEVERITY_GU: Record<Severity, string> = {
  SELF_CARE: "આ રિકવરીનો સામાન્ય ભાગ લાગે છે. તમારી યોજનાનું પાલન કરતા રહો અને કાલે ફરી તપાસ કરો.",
  CALL_CLINIC: "આજે તમારા ક્લિનિકને ફોન કરો. કદાચ ગંભીર નથી, પણ તેમને જાણ હોવી જોઈએ.",
  URGENT_CARE: "આજે જ ડૉક્ટરને બતાવો. અર્જન્ટ કેરમાં જાઓ, અથવા ક્લિનિકને ફોન કરીને કહો કે તમને આવવાની સલાહ અપાઈ છે.",
  EMERGENCY: "હમણાં જ ઇમરજન્સી સેવાને ફોન કરો. રાહ ન જુઓ.",
};

export function templateExplanation(severity: Severity, language = "en"): string {
  if (language === "hi") return BY_SEVERITY_HI[severity];
  if (language === "gu") return BY_SEVERITY_GU[severity];
  return BY_SEVERITY[severity];
}

export const NURSE_REVIEWED: Record<string, string> = {
  en: "A nurse reviewed your message.",
  hi: "एक नर्स ने आपका संदेश देखा है।",
  gu: "એક નર્સે તમારો સંદેશ જોયો છે.",
};
export const SLA_EXPIRED: Record<string, string> = {
  en: "A nurse was not able to review this in time. Please call your clinic so they can check in with you.",
  hi: "नर्स समय पर इसे नहीं देख पाईं। कृपया अपने क्लिनिक को फ़ोन करें ताकि वे आपसे बात कर सकें।",
  gu: "નર્સ સમયસર આ જોઈ શક્યા નહીં. કૃપા કરીને તમારા ક્લિનિકને ફોન કરો જેથી તેઓ તમારી સાથે વાત કરી શકે.",
};

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
