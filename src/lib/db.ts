// IndexedDB helper for brush storage

export interface BrushPreset {
  id: string;
  name: string;
  timestamp: number;
  layers: (string | null)[];
}

const DB_NAME = 'pixel_brush_db';
const DB_VERSION = 1;
const STORE_NAME = 'brushes';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function getBrushPresets(): Promise<BrushPreset[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const results = request.result || [];
      results.sort((a: BrushPreset, b: BrushPreset) => a.timestamp - b.timestamp);
      resolve(results);
    };
    tx.oncomplete = () => db.close();
  });
}

export async function saveBrushPresets(presets: BrushPreset[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Clear existing and add all
    store.clear();
    presets.forEach((preset) => store.put(preset));

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteBrushPreset(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
