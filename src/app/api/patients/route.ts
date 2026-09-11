import { NextResponse } from "next/server";
import { store, recoveryDayFor } from "@/lib/db/store";

export async function GET() {
  return NextResponse.json([...store().patients.values()].map((p) => ({ ...p, recoveryDay: recoveryDayFor(p) })));
}
