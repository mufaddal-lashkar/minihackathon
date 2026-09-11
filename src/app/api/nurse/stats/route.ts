import { NextResponse } from "next/server";
import { computeStats, reportsFor } from "@/lib/db/stats";
import { seedHistory } from "@/lib/db/seed-history";

export async function GET(request: Request) {
  seedHistory();
  const patientId = new URL(request.url).searchParams.get("patientId") ?? undefined;
  return NextResponse.json(computeStats(reportsFor(patientId)));
}
