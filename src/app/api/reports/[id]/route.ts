import { NextResponse } from "next/server";
import { store } from "@/lib/db/store";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = store().reports.get(id);
  if (!rec) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(rec);
}
