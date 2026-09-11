import { put, get } from "@vercel/blob";
import type { Patient, ReportRecord } from "./store";

// Serverless persistence: on Vercel every request may land on a fresh instance, so the in-memory store is mirrored
// to a single JSON blob. Reads re-sync at most once per second; writes are queued and flushed by API routes.
const KEY = "recoverwell/store.json";
const SYNC_INTERVAL_MS = 1000;

type Snapshot = { patients: Patient[]; reports: ReportRecord[]; savedAt: string };
type State = { lastSync: number; dirty: boolean; writing: Promise<void> | null };
const g = globalThis as unknown as { __blobState?: State };
const state = (g.__blobState ??= { lastSync: 0, dirty: false, writing: null });

export function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  try {
    // Private store: read through the SDK (authenticated), never via the raw URL, and bypass the CDN cache.
    const res = await get(KEY, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const text = await new Response(res.stream).text();
    return JSON.parse(text) as Snapshot;
  } catch (err) {
    console.error("[blob] read failed", (err as Error).message);
    return null;
  }
}

export function shouldSync() {
  return blobEnabled() && Date.now() - state.lastSync > SYNC_INTERVAL_MS;
}
export function markSynced() { state.lastSync = Date.now(); }
export function markDirty() { state.dirty = true; }

export async function writeSnapshot(build: () => Snapshot): Promise<void> {
  if (!blobEnabled() || !state.dirty) return;
  if (state.writing) await state.writing;
  if (!state.dirty) return;
  state.dirty = false;
  state.writing = put(KEY, JSON.stringify(build()), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" })
    .then(() => { state.lastSync = Date.now(); })
    .catch((err) => { state.dirty = true; console.error("[blob] write failed", err); })
    .finally(() => { state.writing = null; });
  await state.writing;
}
