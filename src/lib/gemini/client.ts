import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import type { Finding, Severity } from "@/lib/rules/types";
import { LANG_NAME, type Lang } from "@/lib/i18n";

export const SYMPTOM_CODES = [
  "serous_drainage", "wound_drainage", "mild_incisional_pain", "incisional_pain", "low_grade_temp",
  "wound_redness", "spreading_redness", "mild_swelling", "decreased_rom", "bleeding", "lochia_heavy",
  "breast_engorgement", "new_confusion", "nausea", "constipation", "fatigue", "poor_sleep", "reduced_appetite", "other",
] as const;

const ExtractionSchema = z.object({
  findings: z.array(
    z.object({
      symptomCode: z.enum(SYMPTOM_CODES).describe("Closest symptom code. Use 'other' only if nothing fits."),
      sourceSpan: z.string().describe("EXACT verbatim substring of the patient's text this finding came from. Must be copy-pasted, never paraphrased."),
      site: z.string().optional(),
      onset: z.string().optional(),
      duration: z.string().optional(),
    }),
  ),
  confidence: z.number().min(0).max(1).describe("0-1. Low (<0.6) when the text is vague, unrelated to post-op recovery, or you had to guess."),
});

export function hasGemini() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function model(temperature = 0) {
  return new ChatGoogleGenerativeAI({
    model: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
    apiKey: process.env.GEMINI_API_KEY,
    temperature,
    maxRetries: 2,
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("gemini_timeout")), ms))]);
}

export async function geminiExtract(rawText: string, procedureCode: string, recoveryDay: number): Promise<{ findings: Finding[]; confidence: number }> {
  if (!hasGemini()) throw new Error("gemini_not_configured");
  const llm = model().withStructuredOutput(ExtractionSchema, { name: "extract_findings" });
  const out = await withTimeout(
    llm.invoke([
      ["system", `You extract clinical findings from a post-operative patient's message. Procedure: ${procedureCode}, recovery day ${recoveryDay}.
Return one finding per distinct symptom. For each, sourceSpan MUST be an exact verbatim substring of the patient's text.
NEVER decide urgency or severity — only extract what the patient said. Map "pink/red/redder" wound descriptions to wound_redness; spreading/growing redness to spreading_redness; clear/watery fluid to serous_drainage; pus/cloudy/smelly fluid to wound_drainage; normal-sounding pain to mild_incisional_pain; strong pain to incisional_pain.`],
      ["human", rawText],
    ]),
    15000,
  );
  return { findings: out.findings, confidence: out.confidence };
}

export async function geminiExplain(input: {
  rawText: string; severity: Severity; rationale: string; procedureLabel: string; recoveryDay: number; language: string;
}): Promise<string> {
  if (!hasGemini()) throw new Error("gemini_not_configured");
  const res = await withTimeout(
    model(0.3).invoke([
      ["system", `You write a short, warm, plain-language message (max 3 sentences, reading age 12) to a patient recovering from ${input.procedureLabel}, day ${input.recoveryDay}.
The decision has ALREADY been made by a clinical rule engine: severity = ${input.severity}. Reason: ${input.rationale}.
Your job is ONLY to phrase this. Do not change, soften, or upgrade the advice. Do not add new medical advice. Do not diagnose.
Required action by severity: SELF_CARE = keep following your plan, check in tomorrow. CALL_CLINIC = call your clinic today. URGENT_CARE = be seen today at urgent care. EMERGENCY = call emergency services now.
Write in ${LANG_NAME[input.language as Lang] ?? "English"}. Output plain text only, no markdown.`],
      ["human", `Patient wrote: "${input.rawText}"`],
    ]),
    10000,
  );
  const text = typeof res.content === "string" ? res.content : res.content.map((c) => ("text" in c ? c.text : "")).join("");
  if (!text.trim()) throw new Error("gemini_empty");
  return text.trim();
}

const PlanSchema = z.object({
  procedureLabel: z.string().describe("Name of the surgery as written on the sheet"),
  surgeryDate: z.string().optional().describe("ISO date YYYY-MM-DD if present"),
  plan: z.array(z.object({ title: z.string(), items: z.array(z.string()).describe("Each item simplified to plain language, one short sentence"), sourceSpans: z.array(z.string()).optional().describe("For each item, the exact original wording from the sheet, same order") })).describe("Instruction groups, e.g. Wound care, Activity, Medication, Follow-up"),
});
export type PlanDraft = z.infer<typeof PlanSchema>;

export async function geminiExtractPlan(base64: string, mimeType: string): Promise<PlanDraft> {
  if (!hasGemini()) throw new Error("gemini_not_configured");
  const llm = model().withStructuredOutput(PlanSchema, { name: "extract_plan" });
  return withTimeout(
    llm.invoke([
      ["system", "You read a photo of a hospital discharge instruction sheet and transcribe it into a structured recovery plan. Copy instructions faithfully; do not invent items. Group under short titles. Return only what is on the sheet."],
      ["human", [{ type: "text", text: "Transcribe this discharge sheet." }, { type: "image_url", image_url: `data:${mimeType};base64,${base64}` }]],
    ]),
    45000,
  );
}
