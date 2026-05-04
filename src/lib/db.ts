// IndexedDB helper for brush storage

export interface BrushPreset {
  id: string;
  name: string;
  timestamp: number;
  layers: (string | null)[];
}

export interface BrushGroup {
  id: string;
  name: string;
  timestamp: number;
  slots: (string | null)[];  // 10个笔刷preset ID，对应灰度级0-9
}

const DB_NAME = 'pixel_brush_db';
const DB_VERSION = 2;
const STORE_NAME = 'brushes';
const BRUSH_GROUPS_STORE = 'brush_groups';

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
      if (!db.objectStoreNames.contains(BRUSH_GROUPS_STORE)) {
        db.createObjectStore(BRUSH_GROUPS_STORE, { keyPath: 'id' });
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

// BrushGroup functions
export async function getBrushGroups(): Promise<BrushGroup[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BRUSH_GROUPS_STORE, 'readonly');
    const store = tx.objectStore(BRUSH_GROUPS_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const results = request.result || [];
      results.sort((a: BrushGroup, b: BrushGroup) => b.timestamp - a.timestamp);
      resolve(results);
    };
    tx.oncomplete = () => db.close();
  });
}

export async function saveBrushGroups(groups: BrushGroup[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BRUSH_GROUPS_STORE, 'readwrite');
    const store = tx.objectStore(BRUSH_GROUPS_STORE);
    store.clear();
    groups.forEach((group) => store.put(group));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteBrushGroup(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BRUSH_GROUPS_STORE, 'readwrite');
    const store = tx.objectStore(BRUSH_GROUPS_STORE);
    store.delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
