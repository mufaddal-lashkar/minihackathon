import { NextResponse } from "next/server";
import { store, syncStore } from "@/lib/db/store";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await syncStore();
  const rec = store().reports.get(id);
  if (!rec) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(rec);
}
