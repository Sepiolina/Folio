import { LRUCache } from './lruCache';

export interface ResourceSnapshot {
  activeFrames: number;
  openPdfDocs: number;
  activePdfWorkers: number;
  renderedCanvases: number;
  canvasEstimatedBytes: number;
  cachedThumbnails: number;
  cachedThumbnailBytes: number;
  trackedObjectUrls: number;
  runningExportJobs: number;
  activeAbortControllers: number;
  jsHeapUsedBytes: number | null;
  jsHeapTotalBytes: number | null;
  jsHeapLimitBytes: number | null;
}

interface PdfDocEntry {
  scopeId: string;
  destroy: () => Promise<void> | void;
}

interface CanvasEntry {
  scopeId: string;
  width: number;
  height: number;
  release: () => void;
}

interface ObjectUrlEntry {
  url: string;
  scopeId: string;
}

interface JobEntry {
  id: string;
  scopeId: string;
  label: string;
  controller?: AbortController;
}

class WorkspaceResourceManager {
  private frames = new Map<string, string>(); // frameId -> scopeId
  private pdfDocs = new Map<string, PdfDocEntry>(); // docId -> entry
  private canvases = new Map<string, CanvasEntry>(); // canvasId -> entry
  private objectUrls = new Map<string, ObjectUrlEntry>(); // url -> entry
  private jobs = new Map<string, JobEntry>(); // jobId -> entry
  private listeners = new Set<() => void>();

  readonly thumbnailCache = new LRUCache<string, string>({
    maxEntries: 24,
    maxBytes: 4 * 1024 * 1024, // 4 MB cap for in-memory thumbnail strings/URLs
    sizeOf: (val) => val.length * 2,
    onEvict: (_key, val) => {
      if (val.startsWith('blob:') && typeof URL !== 'undefined') {
        try {
          URL.revokeObjectURL(val);
        } catch {
          // ignore
        }
      }
    },
  });

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  registerFrame(frameId: string, scopeId: string): void {
    this.frames.set(frameId, scopeId);
    this.notify();
  }

  unregisterFrame(frameId: string): void {
    if (this.frames.delete(frameId)) {
      this.notify();
    }
  }

  registerPdfDoc(docId: string, scopeId: string, destroy: () => Promise<void> | void): void {
    const existing = this.pdfDocs.get(docId);
    if (existing) {
      void Promise.resolve(existing.destroy()).catch(() => {});
    }
    this.pdfDocs.set(docId, { scopeId, destroy });
    this.notify();
  }

  async destroyPdfDoc(docId: string): Promise<void> {
    const entry = this.pdfDocs.get(docId);
    if (!entry) return;
    this.pdfDocs.delete(docId);
    try {
      await entry.destroy();
    } catch {
      // ignore cleanup errors
    }
    this.notify();
  }

  registerCanvas(
    canvasId: string,
    scopeId: string,
    width: number,
    height: number,
    release: () => void
  ): void {
    this.canvases.set(canvasId, { scopeId, width, height, release });
    this.notify();
  }

  releaseCanvas(canvasId: string): void {
    const entry = this.canvases.get(canvasId);
    if (!entry) return;
    this.canvases.delete(canvasId);
    try {
      entry.release();
    } catch {
      // ignore
    }
    this.notify();
  }

  createTrackedObjectUrl(blob: Blob, scopeId: string): string {
    const url = URL.createObjectURL(blob);
    this.objectUrls.set(url, { url, scopeId });
    this.notify();
    return url;
  }

  revokeTrackedObjectUrl(url: string): void {
    this.objectUrls.delete(url);
    if (typeof URL !== 'undefined') {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    this.notify();
  }

  registerJob(id: string, scopeId: string, label: string, controller?: AbortController): void {
    this.jobs.set(id, { id, scopeId, label, controller });
    this.notify();
  }

  finishJob(id: string): void {
    if (this.jobs.delete(id)) {
      this.notify();
    }
  }

  clearThumbnailsForFile(fileKeyPrefix: string): number {
    const removed = this.thumbnailCache.deleteWhere((k) => k.startsWith(fileKeyPrefix));
    if (removed > 0) this.notify();
    return removed;
  }

  async cleanupScope(scopeId: string): Promise<void> {
    for (const [frameId, fScope] of Array.from(this.frames.entries())) {
      if (fScope === scopeId) this.frames.delete(frameId);
    }

    for (const [docId, entry] of Array.from(this.pdfDocs.entries())) {
      if (entry.scopeId === scopeId) {
        await this.destroyPdfDoc(docId);
      }
    }

    for (const [canvasId, entry] of Array.from(this.canvases.entries())) {
      if (entry.scopeId === scopeId) {
        this.releaseCanvas(canvasId);
      }
    }

    for (const [url, entry] of Array.from(this.objectUrls.entries())) {
      if (entry.scopeId === scopeId) {
        this.revokeTrackedObjectUrl(url);
      }
    }

    for (const [jobId, entry] of Array.from(this.jobs.entries())) {
      if (entry.scopeId === scopeId) {
        entry.controller?.abort();
        this.jobs.delete(jobId);
      }
    }

    this.notify();
  }

  releaseIdleCaches(): void {
    this.thumbnailCache.clear();
    this.notify();
  }

  getSnapshot(): ResourceSnapshot {
    let canvasEstimatedBytes = 0;
    for (const c of this.canvases.values()) {
      canvasEstimatedBytes += c.width * c.height * 4;
    }

    let activeAbortControllers = 0;
    for (const j of this.jobs.values()) {
      if (j.controller && !j.controller.signal.aborted) activeAbortControllers += 1;
    }

    let jsHeapUsedBytes: number | null = null;
    let jsHeapTotalBytes: number | null = null;
    let jsHeapLimitBytes: number | null = null;

    if (typeof performance !== 'undefined') {
      const perfMem = (
        performance as unknown as {
          memory?: {
            usedJSHeapSize: number;
            totalJSHeapSize: number;
            jsHeapSizeLimit: number;
          };
        }
      ).memory;
      if (perfMem) {
        jsHeapUsedBytes = perfMem.usedJSHeapSize;
        jsHeapTotalBytes = perfMem.totalJSHeapSize;
        jsHeapLimitBytes = perfMem.jsHeapSizeLimit;
      }
    }

    return {
      activeFrames: this.frames.size,
      openPdfDocs: this.pdfDocs.size,
      activePdfWorkers: this.pdfDocs.size, // Each loaded PDFDocumentLoadingTask runs a PDF.js worker transport
      renderedCanvases: this.canvases.size,
      canvasEstimatedBytes,
      cachedThumbnails: this.thumbnailCache.size,
      cachedThumbnailBytes: this.thumbnailCache.bytes,
      trackedObjectUrls: this.objectUrls.size,
      runningExportJobs: this.jobs.size,
      activeAbortControllers,
      jsHeapUsedBytes,
      jsHeapTotalBytes,
      jsHeapLimitBytes,
    };
  }
}

export const resourceManager = new WorkspaceResourceManager();
