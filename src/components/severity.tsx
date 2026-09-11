import type { Severity } from "@/lib/rules/types";

export const SEVERITY_META: Record<Severity, { label: string; action: string; bg: string; ring: string; text: string; badge: string; icon: string }> = {
  SELF_CARE: { label: "Looks normal", action: "Keep following your plan", bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-900", badge: "bg-emerald-600", icon: "✓" },
  CALL_CLINIC: { label: "Call your clinic today", action: "Not urgent, but they should know", bg: "bg-amber-50", ring: "ring-amber-200", text: "text-amber-900", badge: "bg-amber-500", icon: "☎" },
  URGENT_CARE: { label: "Be seen today", action: "Go to urgent care now", bg: "bg-orange-50", ring: "ring-orange-300", text: "text-orange-950", badge: "bg-orange-600", icon: "!" },
  EMERGENCY: { label: "Call emergency services", action: "Do not wait", bg: "bg-red-50", ring: "ring-red-300", text: "text-red-950", badge: "bg-red-600", icon: "!!" },
};

export function SeverityBadge({ severity, small }: { severity: Severity; small?: boolean }) {
  const m = SEVERITY_META[severity];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full text-white font-semibold ${m.badge} ${small ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs"}`}>
      <span>{m.icon}</span> {severity.replace("_", " ")}
    </span>
  );
}
