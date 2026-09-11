import { type Patient, recoveryDayFor, localizedPlan } from "@/lib/db/store";
import { loadRules, phaseForDay } from "@/lib/rules/load-rules";
import { t } from "@/lib/i18n";

export const NICE: Record<string, Record<string, string>> = {
  serous_drainage: { en: "a little clear fluid on the dressing", hi: "पट्टी पर थोड़ा साफ़ तरल", gu: "પાટા પર થોડું સ્વચ્છ પ્રવાહી" },
  mild_incisional_pain: { en: "mild pain around the wound", hi: "घाव के आसपास हल्का दर्द", gu: "ઘા આસપાસ હળવો દુખાવો" },
  low_grade_temp: { en: "a slightly raised temperature", hi: "हल्का बुखार", gu: "થોડો તાવ" },
  mild_swelling: { en: "some swelling", hi: "थोड़ी सूजन", gu: "થોડો સોજો" },
  decreased_rom: { en: "stiffness and limited bending", hi: "जकड़न और कम मुड़ना", gu: "જકડન અને ઓછું વળવું" },
  incisional_pain: { en: "pain at the incision", hi: "चीरे पर दर्द", gu: "ચીરા પર દુખાવો" },
  lochia_heavy: { en: "bleeding like a heavy period", hi: "भारी माहवारी जैसा खून", gu: "ભારે માસિક જેવું લોહી" },
  breast_engorgement: { en: "breast fullness", hi: "स्तनों में भारीपन", gu: "સ્તનોમાં ભારેપણું" },
  wound_redness: { en: "faint pinkness at the edges", hi: "किनारों पर हल्की गुलाबी", gu: "કિનારે હળવી ગુલાબી" },
};

// Everything the Today page needs, in one place, so the read-aloud text is byte-identical between the page and the prewarm job.
export function todayModel(p: Patient, lang = p.language) {
  const { procedureLabel, plan } = localizedPlan(p, lang);
  const day = recoveryDayFor(p);
  let expected: string[] = [];
  try { expected = phaseForDay(loadRules(p.procedureCode), day).expectedSymptoms.map((s) => NICE[s]?.[lang] ?? NICE[s]?.en ?? s.replace(/_/g, " ")); } catch {}
  const readout = [
    t(lang, "dayAfter", { day, procedure: procedureLabel }),
    expected.length ? t(lang, "mayNotice", { list: expected.join(", "), day }) : "",
    t(lang, "planToday"),
    ...plan.map((g) => `${g.title}. ${g.items.join(". ")}`),
  ].filter(Boolean).join(". ");
  return { procedureLabel, plan, day, expected, readout };
}
