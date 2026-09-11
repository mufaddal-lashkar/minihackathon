import { CheckCircle2, PhoneCall, AlertTriangle, Siren, type LucideIcon } from "lucide-react";
import type { Severity } from "@/lib/rules/types";

export const SEVERITY_META: Record<Severity, { label: string; short: string; action: string; bg: string; ring: string; text: string; badge: string; Icon: LucideIcon }> = {
  SELF_CARE: { label: "Looks normal for today", short: "Self care", action: "Keep following your plan", bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-950", badge: "bg-emerald-700", Icon: CheckCircle2 },
  CALL_CLINIC: { label: "Call your clinic today", short: "Call clinic", action: "Not urgent, but they should know", bg: "bg-amber-50", ring: "ring-amber-200", text: "text-amber-950", badge: "bg-amber-600", Icon: PhoneCall },
  URGENT_CARE: { label: "Be seen today", short: "Urgent care", action: "Go to urgent care now", bg: "bg-orange-50", ring: "ring-orange-300", text: "text-orange-950", badge: "bg-orange-700", Icon: AlertTriangle },
  EMERGENCY: { label: "Call emergency services", short: "Emergency", action: "Do not wait", bg: "bg-red-50", ring: "ring-red-300", text: "text-red-950", badge: "bg-red-700", Icon: Siren },
};

export function SeverityBadge({ severity, small }: { severity: Severity; small?: boolean }) {
  const m = SEVERITY_META[severity];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold text-white ${m.badge} ${small ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"}`}>
      <m.Icon size={small ? 12 : 14} aria-hidden /> {m.short}
    </span>
  );
}
