import { SHARE_TTL_DAYS } from "@/lib/shares/rules";
import type { ExtractResponse } from "@/lib/uploads/types";

/**
 * Shared screenshots/PDFs waiting on this device (Web Share Target, and the
 * Upload button). public/sw.js writes the same database: keep the name,
 * version and store in sync with it.
 */
export const SHARE_DB = "keeptrack-shares";
export const SHARE_DB_VERSION = 1;
export const SHARE_STORE = "shares";

export type ShareRecord = {
  id: string;
  createdAt: number;
  source: "share_target" | "upload";
  files: File[];
  text: string;
  /** Files left out on receipt (EC-SHR-03 / EC-SHR-12). */
  dropped?: { unsupported: number; overLimit: number };
  /** Extraction result, so a refresh doesn't read it again (EC-SHR-20). */
  result?: ExtractResponse;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB, SHARE_DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(SHARE_STORE)) {
        req.result.createObjectStore(SHARE_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(SHARE_STORE, mode);
      const req = fn(tx.objectStore(SHARE_STORE));
      let value: T | undefined;
      if (req) req.onsuccess = () => (value = req.result);
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getShare(id: string): Promise<ShareRecord | null> {
  const record = await run<ShareRecord>("readonly", (s) => s.get(id));
  return record && !isExpired(record) ? record : null;
}

export async function putShare(record: ShareRecord): Promise<void> {
  await run("readwrite", (s) => {
    s.put(record);
  });
}

export async function deleteShare(id: string): Promise<void> {
  await run("readwrite", (s) => {
    s.delete(id);
  });
}

/** Newest first; expired ones are deleted on the way (EC-SHR-10). */
export async function listShares(now = Date.now()): Promise<ShareRecord[]> {
  const all = (await run<ShareRecord[]>("readonly", (s) => s.getAll())) ?? [];
  const expired = all.filter((r) => isExpired(r, now));
  if (expired.length) {
    await run("readwrite", (s) => {
      for (const r of expired) s.delete(r.id);
    });
  }
  return all
    .filter((r) => !isExpired(r, now))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Logout: shares belong to whoever was signed in. */
export async function clearShares(): Promise<void> {
  await run("readwrite", (s) => {
    s.clear();
  });
}

export function isExpired(record: ShareRecord, now = Date.now()): boolean {
  return now - record.createdAt > SHARE_TTL_DAYS * 86_400_000;
}
