"use client";

import { useCallback, useEffect, useState } from "react";
import { bcp47 } from "./i18n";

// Web Speech synthesis with language-aware voice selection and a real stop().
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const want = bcp47(lang).toLowerCase();
  const short = want.slice(0, 2);
  return (
    voices.find((v) => v.lang.toLowerCase() === want) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(short)) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en-in")) ??
    null
  );
}

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) { const tm = setTimeout(() => setSupported(false), 0); return () => clearTimeout(tm); }
    const sync = () => setSpeaking(window.speechSynthesis.speaking);
    const id = setInterval(sync, 300);
    window.speechSynthesis.getVoices();
    return () => { clearInterval(id); };
  }, []);

  const stop = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string, lang: string) => {
    if (!("speechSynthesis" in window) || !text.trim()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = bcp47(lang);
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.rate = 0.95;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }, []);

  const hasVoiceFor = useCallback((lang: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
    const v = pickVoice(lang);
    return Boolean(v && v.lang.toLowerCase().startsWith(lang === "en" ? "en" : lang));
  }, []);

  return { speak, stop, speaking, supported, hasVoiceFor };
}
