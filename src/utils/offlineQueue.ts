/**
 * Offline-First IndexedDB Storage Queue for TrafficLab
 * Stores vehicle observations locally during field collection when network is intermittent.
 * Preserves the exact original timestamp of the sighting.
 */

export interface QueuedObservation {
  id: string;
  study_id: string;
  point_code: string;
  point_type: 'ENTRY' | 'EXIT';
  plate_suffix: string;
  vehicle_category: string;
  vehicle_color?: string;
  observation_timestamp: string; // ISO 8601 UTC
  observer_id: string;
  idempotency_key: string;
  sync_status: 'PENDING' | 'SYNCED' | 'ERROR';
  queued_at: number;
}

const DB_NAME = 'trafficlab_db';
const STORE_NAME = 'offline_observations';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB not supported in this environment'));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('sync_status', 'sync_status', { unique: false });
          store.createIndex('idempotency_key', 'idempotency_key', { unique: true });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

export async function saveOfflineObservation(obs: QueuedObservation): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(obs);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    // Fallback to localStorage
    const local = JSON.parse(localStorage.getItem('tl_offline_backup') || '[]');
    local.push(obs);
    localStorage.setItem('tl_offline_backup', JSON.stringify(local));
  }
}

export async function getPendingObservations(): Promise<QueuedObservation[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const all: QueuedObservation[] = req.result || [];
        resolve(all.filter(o => o.sync_status === 'PENDING'));
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    const local = JSON.parse(localStorage.getItem('tl_offline_backup') || '[]');
    return local.filter((o: QueuedObservation) => o.sync_status === 'PENDING');
  }
}

export async function markObservationsSynced(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      ids.forEach(id => {
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          if (getReq.result) {
            const updated = { ...getReq.result, sync_status: 'SYNCED' };
            store.put(updated);
          }
        };
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    const local = JSON.parse(localStorage.getItem('tl_offline_backup') || '[]');
    const updated = local.map((o: QueuedObservation) => ids.includes(o.id) ? { ...o, sync_status: 'SYNCED' } : o);
    localStorage.setItem('tl_offline_backup', JSON.stringify(updated));
  }
}

export async function getQueueStatus(): Promise<{ pending: number; synced: number }> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const all: QueuedObservation[] = req.result || [];
        const pending = all.filter(o => o.sync_status === 'PENDING').length;
        const synced = all.filter(o => o.sync_status === 'SYNCED').length;
        resolve({ pending, synced });
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    const local = JSON.parse(localStorage.getItem('tl_offline_backup') || '[]');
    const pending = local.filter((o: QueuedObservation) => o.sync_status === 'PENDING').length;
    const synced = local.filter((o: QueuedObservation) => o.sync_status === 'SYNCED').length;
    return { pending, synced };
  }
}
