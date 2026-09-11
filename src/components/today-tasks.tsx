"use client";

import { useEffect, useState } from "react";
import { Check, Volume2, Square } from "lucide-react";
import { t } from "@/lib/i18n";
import { useSpeech } from "@/lib/speech";

type Group = { title: string; items: string[] };

export function TodayTasks({ patientId, day, plan, lang }: { patientId: string; day: number; plan: Group[]; lang: string }) {
  const key = `rw-done-${patientId}-${day}`;
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const tm = setTimeout(() => { try { setDone(JSON.parse(localStorage.getItem(key) ?? "{}")); } catch {} }, 0);
    return () => clearTimeout(tm);
  }, [key]);
  const toggle = (id: string) => setDone((d) => { const n = { ...d, [id]: !d[id] }; try { localStorage.setItem(key, JSON.stringify(n)); } catch {} return n; });
  const total = plan.reduce((n, g) => n + g.items.length, 0);
  const completed = Object.values(done).filter(Boolean).length;

  return (
    <div className="stagger mt-2 space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-fg" aria-live="polite">
        <span>{t(lang, "doneToday", { done: completed, total })}</span>
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

// Read-aloud with a real stop. Speaks in the patient's language when the device has a matching voice;
// the plan text itself is in the language it was written in, so the UI strings are what get localised.
export function ReadAloud({ text, lang, compact }: { text: string; lang: string; compact?: boolean }) {
  const { speak, stop, speaking, supported } = useSpeech();
  if (!supported) return null;
  return speaking ? (
    <button onClick={stop} className={`press inline-flex min-h-11 items-center gap-2 rounded-full bg-red-50 font-semibold text-red-800 ring-1 ring-red-200 ${compact ? "px-3 text-xs" : "px-4 text-sm"}`} aria-label={t(lang, "stopReading")}>
      <Square size={compact ? 14 : 16} aria-hidden /> {t(lang, "stopReading")}
    </button>
  ) : (
    <button onClick={() => speak(text, lang)} className={`press inline-flex min-h-11 items-center gap-2 rounded-full bg-surface font-semibold text-primary ring-1 ring-border hover:bg-muted ${compact ? "px-3 text-xs" : "px-4 text-sm"}`} aria-label={t(lang, "readAloud")}>
      <Volume2 size={compact ? 14 : 18} aria-hidden /> {t(lang, "readAloud")}
    </button>
  );
}
