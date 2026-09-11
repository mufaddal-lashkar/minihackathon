import type { ReactNode } from "react";
import { store } from "@/lib/db/store";
import { seedHistory } from "@/lib/db/seed-history";
import { AppShell } from "./app-shell";

export function Shell({ role, patientId, children }: { role: "nurse" | "patient"; patientId?: string; children: ReactNode }) {
  seedHistory();
  const s = store();
  const patients = [...s.patients.values()].map((p) => ({ id: p.id, name: p.name, procedureLabel: p.procedureLabel, language: p.language }));
  const pendingCount = [...s.reports.values()].filter((r) => r.status === "pending_review").length;
  return <AppShell role={role} patients={patients} patientId={patientId} pendingCount={pendingCount}>{children}</AppShell>;
}
