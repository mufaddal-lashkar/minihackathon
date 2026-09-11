import { CheckCircle2, PhoneCall, AlertTriangle, Siren, type LucideIcon } from "lucide-react";
import type { Severity } from "@/lib/rules/types";
import { t, type Key } from "@/lib/i18n";

// Status palette validated with the dataviz validator (light surface): all four pass CVD + normal-vision separation.
export const SEVERITY_COLOR: Record<Severity, string> = { SELF_CARE: "#059669", CALL_CLINIC: "#ca8a04", URGENT_CARE: "#dc2626", EMERGENCY: "#6d28d9" };
export const CLASS_COLOR: Record<number, string> = { 1: "#0d9488", 2: "#6366f1", 3: "#d97706", 4: "#db2777" };

export const SEVERITY_META: Record<Severity, { short: Key; label: Key; action: Key; bg: string; ring: string; text: string; badge: string; Icon: LucideIcon }> = {
  SELF_CARE: { short: "sevSelf", label: "labelSelf", action: "actionSelf", bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-950", badge: "bg-emerald-600", Icon: CheckCircle2 },
  CALL_CLINIC: { short: "sevCall", label: "labelCall", action: "actionCall", bg: "bg-yellow-50", ring: "ring-yellow-200", text: "text-yellow-950", badge: "bg-yellow-600", Icon: PhoneCall },
  URGENT_CARE: { short: "sevUrgent", label: "labelUrgent", action: "actionUrgent", bg: "bg-red-50", ring: "ring-red-200", text: "text-red-950", badge: "bg-red-600", Icon: AlertTriangle },
  EMERGENCY: { short: "sevEmergency", label: "labelEmergency", action: "actionEmergency", bg: "bg-violet-50", ring: "ring-violet-300", text: "text-violet-950", badge: "bg-violet-700", Icon: Siren },
};

export function SeverityBadge({ severity, small, lang = "en" }: { severity: Severity; small?: boolean; lang?: string }) {
  const m = SEVERITY_META[severity];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold text-white ${m.badge} ${small ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"}`}>
      <m.Icon size={small ? 12 : 14} aria-hidden /> {t(lang, m.short)}
    </span>
  );
}
