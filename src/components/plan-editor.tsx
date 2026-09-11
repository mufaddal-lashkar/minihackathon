"use client";

import { useState } from "react";
import { Camera, Loader2, Plus, Save, Trash2, Check, Bot, AlertCircle } from "lucide-react";

type Group = { title: string; items: string[] };
type P = { id: string; procedureCode: string; procedureLabel: string; surgeryDate: string; plan: Group[] };

export function PlanEditor({ patient, procedures }: { patient: P; procedures: string[] }) {
  const [plan, setPlan] = useState<Group[]>(patient.plan);
  const [procedureCode, setProcedureCode] = useState(patient.procedureCode);
  const [procedureLabel, setProcedureLabel] = useState(patient.procedureLabel);
  const [surgeryDate, setSurgeryDate] = useState(patient.surgeryDate);
  const [busy, setBusy] = useState<"extract" | "save" | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);

  async function extract(file: File) {
    setBusy("extract");
    setNotice(null);
    const fd = new FormData();
    fd.append("photo", file);
    const res = await fetch(`/api/patients/${patient.id}/plan/extract`, { method: "POST", body: fd }).then((r) => r.json());
    if (res.draft) {
      setPlan(res.draft.plan);
      if (res.draft.procedureLabel) setProcedureLabel(res.draft.procedureLabel);
      if (res.draft.surgeryDate) setSurgeryDate(res.draft.surgeryDate);
      setNotice(res.source === "gemini" ? { kind: "ok", text: "Draft read from your photo by Gemini. Please check every line before saving." } : { kind: "warn", text: "AI reading isn’t available right now (no Gemini key or it failed), so we kept your current plan. You can still edit it by hand." });
    }
    setBusy(null);
  }

  async function save() {
    setBusy("save");
    await fetch(`/api/patients/${patient.id}/plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan, procedureCode, procedureLabel, surgeryDate }) });
    setBusy(null);
    setNotice({ kind: "ok", text: "Plan saved. Your Today view now uses it." });
  }

  const update = (gi: number, fn: (g: Group) => Group) => setPlan((p) => p.map((g, i) => (i === gi ? fn(g) : g)));

  return (
    <div className="mt-5 space-y-5">
      <label className={`press flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface px-4 font-semibold text-primary transition-colors hover:bg-muted ${busy === "extract" ? "opacity-60" : ""}`}>
        {busy === "extract" ? <Loader2 className="animate-spin" size={20} aria-hidden /> : <Camera size={20} aria-hidden />}
        {busy === "extract" ? "Reading your discharge sheet…" : "Photograph discharge sheet"}
        <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy !== null} onChange={(e) => e.target.files?.[0] && extract(e.target.files[0])} />
      </label>

      {notice && (
        <p role="status" className={`flex items-start gap-2 rounded-xl p-3 text-sm ${notice.kind === "ok" ? "bg-emerald-50 text-emerald-950" : "bg-amber-50 text-amber-950"}`}>
          {notice.kind === "ok" ? <Bot size={16} className="mt-0.5 shrink-0" aria-hidden /> : <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />} {notice.text}
        </p>
      )}

      <div className="grid gap-3 rounded-2xl bg-surface p-4 ring-1 ring-border">
        <div>
          <label htmlFor="proc" className="text-sm font-semibold">Procedure (rule table)</label>
          <select id="proc" value={procedureCode} onChange={(e) => setProcedureCode(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base">
            {procedures.map((p) => <option key={p} value={p}>{p.replace(/-/g, " ")}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="label" className="text-sm font-semibold">Procedure name</label>
          <input id="label" value={procedureLabel} onChange={(e) => setProcedureLabel(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base" />
        </div>
        <div>
          <label htmlFor="date" className="text-sm font-semibold">Surgery date</label>
          <input id="date" type="date" value={surgeryDate} onChange={(e) => setSurgeryDate(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base" />
          <p className="mt-1 text-xs text-muted-fg">Recovery day is counted from here — it changes which rules apply.</p>
        </div>
      </div>

      {plan.map((g, gi) => (
        <div key={gi} className="rounded-2xl bg-surface p-4 ring-1 ring-border">
          <div className="flex items-center gap-2">
            <input aria-label="Group title" value={g.title} onChange={(e) => update(gi, (x) => ({ ...x, title: e.target.value }))} className="min-h-11 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-base font-semibold hover:border-border focus:border-primary" />
            <button aria-label="Remove group" onClick={() => setPlan((p) => p.filter((_, i) => i !== gi))} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-fg hover:bg-red-50 hover:text-destructive"><Trash2 size={18} aria-hidden /></button>
          </div>
          <ul className="mt-1 space-y-1">
            {g.items.map((it, ii) => (
              <li key={ii} className="flex items-center gap-1">
                <input aria-label={`${g.title} item ${ii + 1}`} value={it} onChange={(e) => update(gi, (x) => ({ ...x, items: x.items.map((v, j) => (j === ii ? e.target.value : v)) }))} className="min-h-11 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm hover:border-border focus:border-primary" />
                <button aria-label="Remove item" onClick={() => update(gi, (x) => ({ ...x, items: x.items.filter((_, j) => j !== ii) }))} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-fg hover:text-destructive"><Trash2 size={16} aria-hidden /></button>
              </li>
            ))}
          </ul>
          <button onClick={() => update(gi, (x) => ({ ...x, items: [...x.items, ""] }))} className="mt-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary hover:bg-muted"><Plus size={16} aria-hidden /> Add item</button>
        </div>
      ))}
      <button onClick={() => setPlan((p) => [...p, { title: "New section", items: [""] }])} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary hover:bg-muted"><Plus size={16} aria-hidden /> Add section</button>

      <button onClick={save} disabled={busy !== null} className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40">
        {busy === "save" ? <Loader2 className="animate-spin" size={18} aria-hidden /> : notice?.text.startsWith("Plan saved") ? <Check size={18} aria-hidden /> : <Save size={18} aria-hidden />} Save plan
      </button>
    </div>
  );
}
