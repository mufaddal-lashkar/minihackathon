"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { HeartPulse, LayoutDashboard, Inbox, Users, FileBarChart2, CalendarCheck, History, ClipboardList, Menu, X, Stethoscope, User, Languages, MessageCircleWarning } from "lucide-react";
import { LANGS, t } from "@/lib/i18n";

export type ShellPatient = { id: string; name: string; procedureLabel: string; language: string };
type Props = { role: "nurse" | "patient"; patients: ShellPatient[]; patientId?: string; pendingCount?: number; children: ReactNode };

export function AppShell({ role, patients, patientId, pendingCount = 0, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const current = patients.find((p) => p.id === patientId) ?? patients[0];
  const lang = current?.language ?? "en";
  const [savingLang, setSavingLang] = useState(false);

  useEffect(() => { const tm = setTimeout(() => setOpen(false), 0); return () => clearTimeout(tm); }, [pathname]);
  useEffect(() => { try { localStorage.setItem("rw-role", role); } catch {} }, [role]);

  async function setLang(code: string) {
    if (!current || code === lang) return;
    setSavingLang(true);
    await fetch(`/api/patients/${current.id}/plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ language: code }) });
    // Translate the plan itself (Gemini) so the whole page switches, not just the chrome. Cached per language.
    if (code !== "en") await fetch(`/api/patients/${current.id}/translate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ language: code }) }).catch(() => null);
    setSavingLang(false);
    router.refresh();
  }

  const nurseNav = [
    { href: "/nurse", label: "Dashboard", Icon: LayoutDashboard, exact: true },
    { href: "/nurse/inbox", label: "Inbox", Icon: Inbox, badge: pendingCount },
    { href: "/nurse/patients", label: "Patients", Icon: Users },
    { href: "/nurse/reports", label: "Reports", Icon: FileBarChart2 },
  ];
  const pid = current?.id ?? "";
  const patientNav = [
    { href: `/patient/${pid}`, label: t(lang, "navToday"), Icon: CalendarCheck, exact: true },
    { href: `/patient/${pid}?checkin=1`, label: t(lang, "checkIn"), Icon: MessageCircleWarning, accent: true },
    { href: `/patient/${pid}/history`, label: t(lang, "navHistory"), Icon: History },
    { href: `/patient/${pid}/plan`, label: t(lang, "navPlan"), Icon: ClipboardList },
  ];
  const nav = role === "nurse" ? nurseNav : patientNav;
  const isActive = (href: string, exact?: boolean) => {
    const path = href.split("?")[0];
    return exact ? pathname === path : pathname.startsWith(path);
  };

  const sidebar = (
    <div className="flex h-full flex-col gap-5 p-4">
      <Link href="/" className="flex items-center gap-2 rounded-lg px-1" aria-label="RecoverWell home">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-on-primary"><HeartPulse size={20} aria-hidden /></span>
        <span className="font-heading text-lg font-semibold">RecoverWell</span>
      </Link>

      <div role="radiogroup" aria-label="Role" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {([["nurse", role === "patient" ? t(lang, "roleNurse") : "Nurse", Stethoscope], ["patient", role === "patient" ? t(lang, "rolePatient") : "Patient", User]] as const).map(([r, label, Icon]) => (
          <button key={r} role="radio" aria-checked={role === r} onClick={() => router.push(r === "nurse" ? "/nurse" : `/patient/${pid}`)}
            className={`press flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors ${role === r ? "bg-surface text-primary shadow-sm" : "text-muted-fg hover:text-foreground"}`}>
            <Icon size={16} aria-hidden /> {label}
          </button>
        ))}
      </div>

      {role === "patient" && current && (
        <div>
          <label htmlFor="patient-switch" className="text-xs font-semibold uppercase tracking-wide text-muted-fg">{t(lang, "viewingAs")}</label>
          <select id="patient-switch" value={current.id} onChange={(e) => router.push(`/patient/${e.target.value}`)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm font-medium">
            {patients.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.procedureLabel}</option>)}
          </select>
        </div>
      )}

      <nav aria-label="Primary" className="flex flex-col gap-1">
        {nav.map(({ href, label, Icon, exact, ...rest }) => {
          const active = isActive(href, exact) && !("accent" in rest);
          const accent = "accent" in rest && rest.accent;
          const badge = "badge" in rest ? rest.badge : 0;
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${accent ? "bg-primary text-on-primary hover:bg-primary-hover" : active ? "bg-muted text-primary" : "text-foreground/80 hover:bg-muted"}`}>
              <Icon size={18} aria-hidden /> <span className="flex-1">{label}</span>
              {badge ? <span className="rounded-full bg-sky-600 px-2 py-0.5 text-xs font-bold text-white">{badge}</span> : null}
            </Link>
          );
        })}
      </nav>

      {role === "patient" && current && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-fg"><Languages size={14} aria-hidden /> {t(lang, "language")}</div>
          {savingLang && <p className="mt-1 text-xs text-primary" role="status">{t(lang, "translating")}</p>}
          <div role="radiogroup" aria-label="Language" className="mt-1 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
            {LANGS.map((l) => (
              <button key={l.code} role="radio" aria-checked={lang === l.code} disabled={savingLang} onClick={() => setLang(l.code)} lang={l.bcp47}
                className={`press min-h-10 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 ${lang === l.code ? "bg-surface text-primary shadow-sm" : "text-muted-fg hover:text-foreground"}`}>
                {l.native}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto rounded-xl bg-muted p-3 text-xs text-muted-fg">
        {role === "nurse" ? "Signed in as Nurse Priya · Ward 4" : `${current?.name ?? ""} · ${current?.procedureLabel ?? ""}`}
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="hidden border-r border-border bg-surface lg:sticky lg:top-0 lg:block lg:h-dvh">{sidebar}</aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur lg:hidden">
        <Link href="/" className="flex items-center gap-2" aria-label="RecoverWell home"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary"><HeartPulse size={18} aria-hidden /></span><span className="font-heading font-semibold">RecoverWell</span></Link>
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="flex h-11 w-11 items-center justify-center rounded-full text-primary hover:bg-muted"><Menu size={22} aria-hidden /></button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)}>
          <div className="sheet-up h-full w-80 max-w-[85vw] bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Menu">
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-fg hover:bg-muted"><X size={20} aria-hidden /></button>
            {sidebar}
          </div>
        </div>
      )}

      <div className={role === "patient" ? "pb-20 lg:pb-0" : ""}>{children}</div>

      {role === "patient" && current && (
        <nav aria-label="Patient navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {patientNav.map(({ href, label, Icon, exact, ...rest }) => {
            const accent = "accent" in rest && rest.accent;
            const active = isActive(href, exact) && !accent;
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${accent ? "text-primary" : active ? "text-primary" : "text-muted-fg"}`}>
                <span className={accent ? "flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary" : ""}><Icon size={accent ? 18 : 20} aria-hidden /></span>
                <span className="max-w-[80px] truncate">{label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
