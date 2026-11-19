import type { PdfAnnotation, PdfLayer, WorkspaceFileMeta } from '@/types/workspace';

const DB_NAME = 'folio-workspace-db';
const DB_VERSION = 1;
const STORE_FILES = 'files';
const STORE_ANNOTATIONS = 'annotations';

export interface StoredFileRecord {
  id: string;
  meta: WorkspaceFileMeta;
  textContent?: string;
  binaryContent?: Uint8Array;
}

export interface StoredPdfOverlayRecord {
  fileId: string;
  annotations: PdfAnnotation[];
  layers?: PdfLayer[];
  updatedAt: number;
}

// In-memory registry for native FileSystemFileHandle (when browser supports File System Access API)
const fileHandles = new Map<string, FileSystemFileHandle>();

export function setFileHandle(fileId: string, handle: FileSystemFileHandle): void {
  fileHandles.set(fileId, handle);
}

export function getFileHandle(fileId: string): FileSystemFileHandle | undefined {
  return fileHandles.get(fileId);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_ANNOTATIONS)) {
        db.createObjectStore(STORE_ANNOTATIONS, { keyPath: 'fileId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open workspace database.'));
  });
}

export async function saveWorkspaceFile(record: StoredFileRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_FILES, 'readwrite');
    tx.objectStore(STORE_FILES).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to save file.'));
  });
}

export async function getWorkspaceFile(id: string): Promise<StoredFileRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FILES, 'readonly');
    const req = tx.objectStore(STORE_FILES).get(id);
    req.onsuccess = () => resolve((req.result as StoredFileRecord) || null);
    req.onerror = () => reject(req.error || new Error('Failed to load file.'));
  });
}

export async function listWorkspaceFiles(): Promise<WorkspaceFileMeta[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FILES, 'readonly');
    const req = tx.objectStore(STORE_FILES).getAll();
    req.onsuccess = () => {
      const records = (req.result as StoredFileRecord[]) || [];
      resolve(records.map((r) => r.meta).sort((a, b) => b.updatedAt - a.updatedAt));
    };
    req.onerror = () => reject(req.error || new Error('Failed to list files.'));
  });
}

export async function deleteWorkspaceFile(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_FILES, STORE_ANNOTATIONS], 'readwrite');
    tx.objectStore(STORE_FILES).delete(id);
    tx.objectStore(STORE_ANNOTATIONS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to delete file.'));
  });
}

export async function savePdfAnnotations(fileId: string, annotations: PdfAnnotation[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_ANNOTATIONS, 'readwrite');
    const store = tx.objectStore(STORE_ANNOTATIONS);
    const getReq = store.get(fileId);
    getReq.onsuccess = () => {
      const existing = getReq.result as StoredPdfOverlayRecord | undefined;
      store.put({
        fileId,
        annotations,
        layers: existing?.layers,
        updatedAt: Date.now(),
      });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to save PDF annotations.'));
  });
}

export async function savePdfLayers(fileId: string, layers: PdfLayer[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_ANNOTATIONS, 'readwrite');
    const store = tx.objectStore(STORE_ANNOTATIONS);
    const getReq = store.get(fileId);
    getReq.onsuccess = () => {
      const existing = getReq.result as StoredPdfOverlayRecord | undefined;
      store.put({
        fileId,
        annotations: existing?.annotations || [],
        layers,
        updatedAt: Date.now(),
      });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to save PDF layers.'));
  });
}

export async function savePdfOverlayState(
  fileId: string,
  annotations: PdfAnnotation[],
  layers: PdfLayer[]
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_ANNOTATIONS, 'readwrite');
    tx.objectStore(STORE_ANNOTATIONS).put({
      fileId,
      annotations,
      layers,
      updatedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to save PDF overlay state.'));
  });
}

export async function getPdfOverlayState(
  fileId: string
): Promise<{ annotations: PdfAnnotation[]; layers: PdfLayer[] }> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ANNOTATIONS, 'readonly');
    const req = tx.objectStore(STORE_ANNOTATIONS).get(fileId);
    req.onsuccess = () => {
      const res = req.result as StoredPdfOverlayRecord | undefined;
      resolve({
        annotations: res?.annotations || [],
        layers: res?.layers || [],
      });
    };
    req.onerror = () => reject(req.error || new Error('Failed to load PDF overlay state.'));
  });
}

export async function getPdfAnnotations(fileId: string): Promise<PdfAnnotation[]> {
  const state = await getPdfOverlayState(fileId);
  return state.annotations;
}

export async function getPdfLayers(fileId: string): Promise<PdfLayer[]> {
  const state = await getPdfOverlayState(fileId);
  return state.layers;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function countOriginCookies(): number {
  if (typeof document === 'undefined' || !document.cookie.trim()) return 0;
  return document.cookie.split(';').filter((c) => c.trim().length > 0).length;
}

export async function clearOriginCookiesAndCaches(): Promise<{ clearedCookies: number }> {
  let clearedCookies = 0;
  if (typeof document !== 'undefined' && document.cookie.trim()) {
    const pairs = document.cookie.split(';');
    for (const pair of pairs) {
      const eqIdx = pair.indexOf('=');
      const name = (eqIdx > -1 ? pair.slice(0, eqIdx) : pair).trim();
      if (name) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        clearedCookies += 1;
      }
    }
  }

  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.clear();
    }
  } catch {
    // ignore sandbox restrictions
  }

  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((k) => window.caches.delete(k)));
    } catch {
      // ignore
    }
  }

  return { clearedCookies };
}
