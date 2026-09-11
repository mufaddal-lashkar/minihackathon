import { put, head } from "@vercel/blob";
import type { Patient, ReportRecord } from "./store";

// Serverless persistence: on Vercel every request may land on a fresh instance, so the in-memory store is mirrored
// to a single JSON blob. Reads re-sync at most once per second; writes are queued and flushed by API routes.
const KEY = "recoverwell/store.json";
const SYNC_INTERVAL_MS = 1000;

type Snapshot = { patients: Patient[]; reports: ReportRecord[]; savedAt: string };
type State = { lastSync: number; dirty: boolean; writing: Promise<void> | null; url?: string };
const g = globalThis as unknown as { __blobState?: State };
const state = (g.__blobState ??= { lastSync: 0, dirty: false, writing: null });

export function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  try {
    const meta = state.url ? { url: state.url } : await head(KEY).catch(() => null);
    if (!meta?.url) return null;
    state.url = meta.url;
    const res = await fetch(meta.url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Snapshot;
  } catch {
    return null;
  }
}

export function shouldSync() {
  return blobEnabled() && Date.now() - state.lastSync > SYNC_INTERVAL_MS;
}
export function markSynced() { state.lastSync = Date.now(); }
export function markDirty() { state.dirty = true; }

export async function writeSnapshot(get: () => Snapshot): Promise<void> {
  if (!blobEnabled() || !state.dirty) return;
  if (state.writing) await state.writing;
  if (!state.dirty) return;
  state.dirty = false;
  state.writing = put(KEY, JSON.stringify(get()), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" })
    .then((r) => { state.url = r.url; state.lastSync = Date.now(); })
    .catch((err) => { state.dirty = true; console.error("[blob] write failed", err); })
    .finally(() => { state.writing = null; });
  await state.writing;
}
