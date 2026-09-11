import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { geminiTts, hasGemini } from "@/lib/gemini/client";

// Server-side TTS so Hindi/Gujarati work even when the device has no matching voice.
// Cached on disk (data/tts-cache) keyed by text+lang, so anything played once is instant forever after — including across restarts.
const CACHE_DIR = process.env.TTS_CACHE_DIR ?? path.join(process.cwd(), "data", "tts-cache");
const mem = (globalThis as unknown as { __ttsMem?: Map<string, Buffer> }).__ttsMem ??= new Map<string, Buffer>();
(globalThis as unknown as { __ttsMem?: Map<string, Buffer> }).__ttsMem = mem;
const inflight = new Map<string, Promise<Buffer>>();

export function ttsKey(text: string, lang: string) {
  return createHash("sha1").update(`${lang}|${text.trim()}`).digest("hex");
}

export async function getTts(text: string, lang: string): Promise<Buffer> {
  const key = ttsKey(text, lang);
  const hit = mem.get(key);
  if (hit) return hit;
  const file = path.join(CACHE_DIR, `${key}.wav`);
  if (fs.existsSync(file)) { const b = fs.readFileSync(file); mem.set(key, b); return b; }
  let p = inflight.get(key);
  if (!p) {
    p = geminiTts(text.slice(0, 1500), lang).then((wav) => {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(file, wav);
      mem.set(key, wav);
      return wav;
    }).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

export async function POST(request: Request) {
  const { text, lang, prefetch } = (await request.json()) as { text?: string; lang?: string; prefetch?: boolean };
  if (!text?.trim()) return new Response("text required", { status: 400 });
  if (!hasGemini()) return new Response("tts unavailable", { status: 503 });
  try {
    const wav = await getTts(text, lang ?? "en");
    if (prefetch) return new Response(null, { status: 204 });
    return new Response(new Uint8Array(wav), { headers: { "content-type": "audio/wav", "cache-control": "private, max-age=86400" } });
  } catch (err) {
    return new Response(`tts failed: ${(err as Error).message}`, { status: 502 });
  }
}
