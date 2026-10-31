/**
 * Offline-first queue (IndexedDB, with a localStorage fallback).
 *
 * - Every item keeps the ORIGINAL observation time, never the sync time.
 * - Items belong to the user who recorded them (owner_user_id): the server derives the observer from the session,
 *   so another account must never upload them.
 * - Only items the server accepted (created/duplicate) become SYNCED. Rejected items stay visible as ERROR with the
 *   server's reason, so nothing disappears silently.
 */

export interface QueuedObservation {
  id: string;
  owner_user_id: string;
  study_id: string;
  point_code: string;
  point_type: 'ENTRY' | 'EXIT';
  plate_suffix: string;
  vehicle_category: string;
  observation_timestamp: string; // ISO 8601 UTC
  idempotency_key: string;
  audio_b64?: string; // optional voice clip of this passage, uploaded with it
  audio_mime?: string;
  audio_ms?: number;
  sync_status: 'PENDING' | 'SYNCED' | 'ERROR';
  error?: string;
  queued_at: number;
}

export interface SyncResult {
  idempotency_key: string;
  status: 'created' | 'duplicate' | 'rejected';
  error?: string;
}

const DB_NAME = 'trafficlab_db';
const STORE = 'offline_observations';
const DB_VERSION = 2;
const LS_KEY = 'tl_offline_backup_v2';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.reject(new Error('IndexedDB not supported'));
  dbPromise ??= new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE); // v1 items had no owner and cannot be attributed safely
      const store = db.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('owner', 'owner_user_id', { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const readLS = (): QueuedObservation[] => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } };
const writeLS = (items: QueuedObservation[]) => localStorage.setItem(LS_KEY, JSON.stringify(items));

async function allItems(): Promise<QueuedObservation[]> {
  try {
    const db = await getDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as QueuedObservation[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return readLS();
  }
}

async function putMany(items: QueuedObservation[]): Promise<void> {
  if (!items.length) return;
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      items.forEach((i) => tx.objectStore(STORE).put(i));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const map = new Map(readLS().map((i) => [i.id, i]));
    items.forEach((i) => map.set(i.id, i));
    writeLS([...map.values()]);
  }
}

export const saveOfflineObservation = (obs: QueuedObservation) => putMany([obs]);

export async function getPendingObservations(userId: string): Promise<QueuedObservation[]> {
  return (await allItems()).filter((o) => o.owner_user_id === userId && o.sync_status === 'PENDING').sort((a, b) => a.queued_at - b.queued_at);
}

export async function getQueuedForUser(userId: string): Promise<QueuedObservation[]> {
  return (await allItems()).filter((o) => o.owner_user_id === userId && o.sync_status !== 'SYNCED');
}

/** Applies the server's per-item answer. Returns how many items were accepted and how many were refused. */
export async function applySyncResults(userId: string, results: SyncResult[]): Promise<{ accepted: number; refused: number }> {
  const byKey = new Map(results.map((r) => [r.idempotency_key, r]));
  const items = (await allItems()).filter((o) => o.owner_user_id === userId && byKey.has(o.idempotency_key));
  let accepted = 0, refused = 0;
  const updated = items.map((o) => {
    const r = byKey.get(o.idempotency_key)!;
    if (r.status === 'rejected') { refused++; return { ...o, sync_status: 'ERROR' as const, error: r.error }; }
    accepted++;
    return { ...o, sync_status: 'SYNCED' as const, error: undefined };
  });
  await putMany(updated);
  return { accepted, refused };
}

export async function retryErrors(userId: string): Promise<void> {
  const errs = (await allItems()).filter((o) => o.owner_user_id === userId && o.sync_status === 'ERROR');
  await putMany(errs.map((o) => ({ ...o, sync_status: 'PENDING' as const })));
}

export async function getQueueStatus(userId: string): Promise<{ pending: number; errors: number; synced: number; otherUsers: number }> {
  const all = await allItems();
  const mine = all.filter((o) => o.owner_user_id === userId);
  return {
    pending: mine.filter((o) => o.sync_status === 'PENDING').length,
    errors: mine.filter((o) => o.sync_status === 'ERROR').length,
    synced: mine.filter((o) => o.sync_status === 'SYNCED').length,
    otherUsers: all.filter((o) => o.owner_user_id !== userId && o.sync_status !== 'SYNCED').length,
  };
}

/** Removes an item that was never accepted by the server (undo of a queued entry). Synced items are voided via the API. */
export async function discardQueued(userId: string, id: string): Promise<void> {
  const item = (await allItems()).find((o) => o.id === id);
  if (!item || item.owner_user_id !== userId || item.sync_status === 'SYNCED') return;
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    writeLS(readLS().filter((o) => o.id !== id));
  }
}
