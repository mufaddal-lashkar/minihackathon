import { createHash } from "node:crypto";
import { geminiTts, hasGemini } from "@/lib/gemini/client";

// Server-side TTS so Hindi/Gujarati work even when the device has no matching voice. Cached by text+lang.
const g = globalThis as unknown as { __ttsCache?: Map<string, Buffer> };
const cache = (g.__ttsCache ??= new Map<string, Buffer>());

export async function POST(request: Request) {
  const { text, lang } = (await request.json()) as { text?: string; lang?: string };
  if (!text?.trim()) return new Response("text required", { status: 400 });
  if (!hasGemini()) return new Response("tts unavailable", { status: 503 });
  const key = createHash("sha1").update(`${lang}|${text}`).digest("hex");
  let wav = cache.get(key);
  if (!wav) {
    try {
      wav = await geminiTts(text.slice(0, 1500), lang ?? "en");
    } catch (err) {
      return new Response(`tts failed: ${(err as Error).message}`, { status: 502 });
    }
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    cache.set(key, wav);
  }
  return new Response(new Uint8Array(wav), { headers: { "content-type": "audio/wav", "cache-control": "private, max-age=3600" } });
}
