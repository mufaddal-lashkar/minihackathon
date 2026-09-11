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
      symptomCode: z.enum(SYMPTOM_CODES).describe("Symptom code. Use 'other' when the patient describes something that is not clearly one of the listed symptoms."),
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

// Free-tier quotas are per model. Try the configured model first, then fall through the chain;
// a model that returned 429/404 is skipped for a cooldown so the next request goes straight to a working one.
const FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const COOLDOWN_MS = 10 * 60 * 1000;
const g = globalThis as unknown as { __geminiCooldown?: Map<string, number> };
const cooldown = (g.__geminiCooldown ??= new Map<string, number>());

function modelChain(): string[] {
  const primary = process.env.GEMINI_MODEL ?? FALLBACK_MODELS[0];
  return [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];
}

function llm(modelName: string, temperature = 0) {
  return new ChatGoogleGenerativeAI({ model: modelName, apiKey: process.env.GEMINI_API_KEY, temperature, maxRetries: 0 });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("gemini_timeout")), ms))]);
}

async function withFallback<T>(fn: (modelName: string) => Promise<T>, timeoutMs: number): Promise<T> {
  if (!hasGemini()) throw new Error("gemini_not_configured");
  let lastErr: unknown = new Error("no_model");
  for (const m of modelChain()) {
    const until = cooldown.get(m) ?? 0;
    if (until > Date.now()) continue;
    try {
      return await withTimeout(fn(m), timeoutMs);
    } catch (err) {
      lastErr = err;
      const msg = String((err as Error).message ?? err);
      if (/429|404|503|quota|not found|not available|high demand/i.test(msg)) {
        cooldown.set(m, Date.now() + COOLDOWN_MS);
        console.warn(`[gemini] ${m} unavailable (${msg.slice(0, 80)}…) — trying next model`);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function geminiExtract(rawText: string, procedureCode: string, recoveryDay: number): Promise<{ findings: Finding[]; confidence: number }> {
  const out = await withFallback((m) =>
    llm(m).withStructuredOutput(ExtractionSchema, { name: "extract_findings" }).invoke([
      ["system", `You extract clinical findings from a post-operative patient's message. Procedure: ${procedureCode}, recovery day ${recoveryDay}.
The message may be in English, Hindi or Gujarati (any script). Return one finding per distinct symptom the patient CLEARLY describes.
For each, sourceSpan MUST be an exact verbatim substring of the patient's text.
NEVER decide urgency or severity — only extract what the patient said.
Be conservative: greetings, jokes, questions about medication, or general statements ("feeling okay", "walked today") are NOT symptoms — return an empty findings list with confidence >= 0.8 in that case.
Only use new_confusion when the patient (or a relative) reports actual disorientation or confusion as a symptom, not when they say they are "confused about" instructions.
Map: pink/red/redder wound → wound_redness; spreading/growing redness → spreading_redness; clear/watery fluid → serous_drainage; pus/cloudy/smelly fluid → wound_drainage; normal-sounding pain → mild_incisional_pain; strong/worsening pain → incisional_pain.`],
      ["human", rawText],
    ]), 15000);
  return { findings: out.findings, confidence: out.confidence };
}

export async function geminiExplain(input: { rawText: string; severity: Severity; rationale: string; procedureLabel: string; recoveryDay: number; language: string }): Promise<string> {
  const res = await withFallback((m) =>
    llm(m, 0.3).invoke([
      ["system", `You write a short, warm, plain-language message (max 3 sentences, reading age 12) to a patient recovering from ${input.procedureLabel}, day ${input.recoveryDay}.
The decision has ALREADY been made by a clinical rule engine: severity = ${input.severity}. Reason: ${input.rationale}.
Your job is ONLY to phrase this. Do not change, soften, or upgrade the advice. Do not add new medical advice. Do not diagnose.
Required action by severity: SELF_CARE = keep following your plan, check in tomorrow. CALL_CLINIC = call your clinic today. URGENT_CARE = be seen today at urgent care. EMERGENCY = call emergency services now.
Write in ${LANG_NAME[input.language as Lang] ?? "English"}. Output plain text only, no markdown.`],
      ["human", `Patient wrote: "${input.rawText}"`],
    ]), 10000);
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
  return withFallback((m) =>
    llm(m).withStructuredOutput(PlanSchema, { name: "extract_plan" }).invoke([
      ["system", "You read a photo of a hospital discharge instruction sheet and transcribe it into a structured recovery plan. Copy instructions faithfully; do not invent items. Group under short titles. Return only what is on the sheet."],
      ["human", [{ type: "text", text: "Transcribe this discharge sheet." }, { type: "image_url", image_url: `data:${mimeType};base64,${base64}` }]],
    ]), 45000);
}

const TranslationSchema = z.object({
  procedureLabel: z.string(),
  plan: z.array(z.object({ title: z.string(), items: z.array(z.string()) })),
});
export type PlanTranslation = z.infer<typeof TranslationSchema>;

export async function geminiTranslatePlan(input: { procedureLabel: string; plan: { title: string; items: string[] }[]; language: string }): Promise<PlanTranslation> {
  return withFallback((m) =>
    llm(m).withStructuredOutput(TranslationSchema, { name: "translate_plan" }).invoke([
      ["system", `Translate this patient's post-operative recovery plan into ${LANG_NAME[input.language as Lang] ?? "English"}. Keep the same structure, order and number of items. Keep medication names, doses and numbers unchanged. Use simple everyday words a patient would understand. Output only the translation.`],
      ["human", JSON.stringify({ procedureLabel: input.procedureLabel, plan: input.plan })],
    ]), 20000);
}

// Text-to-speech via the Gemini TTS model (raw 16-bit PCM @ 24 kHz), wrapped into a WAV so browsers can play it directly.
export async function geminiTts(text: string, language: string): Promise<Buffer> {
  if (!hasGemini()) throw new Error("gemini_not_configured");
  const modelName = process.env.GEMINI_TTS_MODEL ?? "gemini-3.1-flash-tts-preview";
  const langName = LANG_NAME[language as Lang] ?? "English";
  const body = {
    contents: [{ parts: [{ text: `Read the following ${langName} text aloud clearly and calmly for a patient, at a slightly slow pace:\n\n${text}` }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.GEMINI_TTS_VOICE ?? "Kore" } } } },
  };
  const res = await withTimeout(
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }),
    30000,
  );
  if (!res.ok) throw new Error(`tts_${res.status}`);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[] };
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!part) throw new Error("tts_no_audio");
  const rate = Number(/rate=(\d+)/.exec(part.mimeType)?.[1] ?? 24000);
  return pcmToWav(Buffer.from(part.data, "base64"), rate);
}

function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1, bits = 16): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bits) / 8;
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(byteRate, 28); header.writeUInt16LE((channels * bits) / 8, 32); header.writeUInt16LE(bits, 34);
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
