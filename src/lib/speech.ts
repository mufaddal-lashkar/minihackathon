"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bcp47 } from "./i18n";

// Read-aloud: server TTS (Gemini, any of our three languages) first; the browser's own speechSynthesis as fallback.
// Exposes a real stop() that halts whichever path is playing.
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const want = bcp47(lang).toLowerCase();
  return voices.find((v) => v.lang.toLowerCase() === want) ?? voices.find((v) => v.lang.toLowerCase().startsWith(want.slice(0, 2))) ?? null;
}

// Prefetched audio, keyed by lang|text, shared across components on the page.
const blobCache = new Map<string, Promise<string | null>>();
export function prefetchSpeech(text: string, lang: string): Promise<string | null> {
  const key = `${lang}|${text.trim()}`;
  if (!text.trim()) return Promise.resolve(null);
  let p = blobCache.get(key);
  if (!p) {
    p = fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, lang }) })
      .then(async (res) => (res.ok ? URL.createObjectURL(await res.blob()) : null))
      .catch(() => null);
    blobCache.set(key, p);
    p.then((u) => { if (!u) blobCache.delete(key); });
  }
  return p;
}

export function useSpeech() {
  const [state, setState] = useState<"idle" | "loading" | "speaking">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seq = useRef(0);

  const stop = useCallback(() => {
    seq.current++;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setState("idle");
  }, []);

  useEffect(() => () => { if (audioRef.current) audioRef.current.pause(); if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);

  const speakBrowser = useCallback((text: string, lang: string) => {
    if (!("speechSynthesis" in window)) { setState("idle"); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = bcp47(lang);
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.rate = 0.95;
    u.onend = () => setState("idle");
    u.onerror = () => setState("idle");
    setState("speaking");
    window.speechSynthesis.speak(u);
  }, []);

  const speak = useCallback(async (text: string, lang: string) => {
    if (!text.trim()) return;
    stop();
    const my = ++seq.current;
    setState("loading");
    try {
      const url = await prefetchSpeech(text, lang);
      if (!url) throw new Error("tts unavailable");
      if (my !== seq.current) return;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { if (my === seq.current) setState("idle"); };
      audio.onerror = () => { if (my === seq.current) speakBrowser(text, lang); };
      await audio.play();
      if (my === seq.current) setState("speaking");
    } catch {
      if (my === seq.current) speakBrowser(text, lang);
    }
  }, [stop, speakBrowser]);

  return { speak, stop, state, speaking: state !== "idle", supported: true };
}
