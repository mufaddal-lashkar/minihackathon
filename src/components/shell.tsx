import Link from "next/link";
import { HeartPulse, Inbox, Users } from "lucide-react";

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2 rounded-lg" aria-label="RecoverWell home">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary"><HeartPulse size={18} aria-hidden /></span>
      {!compact && <span className="font-heading text-lg font-semibold">RecoverWell</span>}
    </Link>
  );
}

export function TopBar({ active }: { active?: "patients" | "nurse" }) {
  const item = (href: string, label: string, Icon: typeof Users, key: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${active === key ? "bg-muted text-primary" : "text-muted-fg hover:bg-muted hover:text-foreground"}`}
    >
      <Icon size={16} aria-hidden /> {label}
    </Link>
  );
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav aria-label="Primary" className="flex items-center gap-1">
          {item("/", "Patients", Users, "patients")}
          {item("/nurse", "Nurse inbox", Inbox, "nurse")}
        </nav>
      </div>
    </header>
  );
}
