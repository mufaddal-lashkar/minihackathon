"use client";

import { useEffect, useState } from "react";
import { Check, Volume2, Languages } from "lucide-react";

type Group = { title: string; items: string[] };

export function TodayTasks({ patientId, day, plan }: { patientId: string; day: number; plan: Group[] }) {
  const key = `rw-done-${patientId}-${day}`;
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const t = setTimeout(() => { try { setDone(JSON.parse(localStorage.getItem(key) ?? "{}")); } catch {} }, 0);
    return () => clearTimeout(t);
  }, [key]);
  const toggle = (id: string) => setDone((d) => { const n = { ...d, [id]: !d[id] }; try { localStorage.setItem(key, JSON.stringify(n)); } catch {} return n; });
  const total = plan.reduce((n, g) => n + g.items.length, 0);
  const completed = Object.values(done).filter(Boolean).length;

  return (
    <div className="stagger mt-2 space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-fg" aria-live="polite">
        <span>{completed} of {total} done today</span>
        <span className="h-1.5 w-32 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${total ? (completed / total) * 100 : 0}%` }} /></span>
      </div>
      {plan.map((g) => (
        <div key={g.title} className="rounded-2xl bg-surface p-4 ring-1 ring-border">
          <h3 className="text-sm font-semibold">{g.title}</h3>
          <ul className="mt-2 space-y-1">
            {g.items.map((it, i) => {
              const id = `${g.title}-${i}`;
              const on = Boolean(done[id]);
              return (
                <li key={id}>
                  <button onClick={() => toggle(id)} aria-pressed={on} className="press flex min-h-11 w-full items-start gap-3 rounded-lg px-1 py-2 text-left text-sm transition-colors hover:bg-muted">
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${on ? "border-primary bg-primary text-on-primary" : "border-border bg-surface"}`} aria-hidden>{on && <Check size={14} />}</span>
                    <span className={on ? "text-muted-fg line-through" : ""}>{it}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function HeaderTools({ patientId, language, readout }: { patientId: string; language: string; readout: string }) {
  const [lang, setLang] = useState(language);
  const [saving, setSaving] = useState(false);
  async function toggleLang() {
    const next = lang === "hi" ? "en" : "hi";
    setSaving(true);
    await fetch(`/api/patients/${patientId}/plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ language: next }) });
    setLang(next);
    setSaving(false);
  }
  function speak() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(readout);
    u.lang = "en-US";
    window.speechSynthesis.speak(u);
  }
  return (
    <div className="flex items-center gap-1">
      <button onClick={speak} aria-label="Read today's plan aloud" className="flex h-11 w-11 items-center justify-center rounded-full text-primary hover:bg-muted"><Volume2 size={20} aria-hidden /></button>
      <button onClick={toggleLang} disabled={saving} aria-label={`Answer language: ${lang === "hi" ? "Hindi" : "English"}. Tap to switch.`} className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-primary hover:bg-muted disabled:opacity-50">
        <Languages size={18} aria-hidden /> {lang === "hi" ? "हिंदी" : "EN"}
      </button>
    </div>
  );
}
