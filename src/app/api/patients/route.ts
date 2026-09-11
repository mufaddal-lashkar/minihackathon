import { NextResponse } from "next/server";
import { store, recoveryDayFor, syncStore } from "@/lib/db/store";

export async function GET() {
  await syncStore();
  return NextResponse.json([...store().patients.values()].map((p) => ({ ...p, recoveryDay: recoveryDayFor(p) })));
}
