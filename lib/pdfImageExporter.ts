'use client';

import JSZip from 'jszip';
import { getPdfJs } from './pdfJsLoader';
import { formatPageExportFilename } from './pageRange';
import { resourceManager } from './resourceManager';

export interface PdfImageExportParams {
  pdfBytes: Uint8Array;
  documentName: string;
  pages: number[]; // 1-indexed sorted pages
  format: 'png' | 'jpeg';
  dpi: number;
  jpegQuality: number; // 0.1..1.0
  destination: 'zip' | 'folder';
  directoryHandle?: FileSystemDirectoryHandle | null;
  scopeId?: string;
  controller?: AbortController;
  signal?: AbortSignal;
  onProgress?: (info: { currentIndex: number; total: number; pageNumber: number; percent: number }) => void;
}

export interface PdfImageExportResult {
  exportedCount: number;
  zipBlob?: Blob;
  zipFilename?: string;
  folderName?: string;
  totalOutputBytes: number;
}

/**
 * Renders PDF pages sequentially one-at-a-time to prevent memory exhaustion on large documents.
 * Releases each temporary canvas immediately after encoding the image blob and destroys the worker on completion.
 */
export async function exportPdfPagesToImages(
  params: PdfImageExportParams
): Promise<PdfImageExportResult> {
  const {
    pdfBytes,
    documentName,
    pages,
    format,
    dpi,
    jpegQuality,
    destination,
    directoryHandle,
    scopeId = 'pdf-export',
    controller,
    signal,
    onProgress,
  } = params;

  const pdfjs = await getPdfJs();
  const copy = new Uint8Array(pdfBytes.byteLength);
  copy.set(pdfBytes);

  const loadingTask = pdfjs.getDocument({ data: copy });
  const pdfDoc = await loadingTask.promise;
  const totalPagesInDoc = pdfDoc.numPages;
  const scale = Math.max(0.25, dpi / 72);
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';

  const jobId = `export-${Date.now().toString(36)}`;
  resourceManager.registerJob(jobId, scopeId, `Export ${documentName}`, controller);

  const zip = destination === 'zip' ? new JSZip() : null;
  let totalOutputBytes = 0;
  let lastProgressAt = 0;

  try {
    for (let i = 0; i < pages.length; i++) {
      if (signal?.aborted) {
        throw new DOMException('Export cancelled by user.', 'AbortError');
      }

      const pageNum = pages[i];
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        throw new Error('Unable to acquire 2D canvas context during export.');
      }

      // Crisp white paper background for lossless PNG/JPEG output
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error(`Failed to encode page ${pageNum}.`))),
          mime,
          format === 'jpeg' ? jpegQuality : undefined
        );
      });

      // Immediately release canvas memory
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();

      const filename = formatPageExportFilename(documentName, pageNum, totalPagesInDoc, format);
      totalOutputBytes += blob.size;

      if (destination === 'zip' && zip) {
        // Store PNGs without re-deflating (already compressed) for speed & zero quality loss
        zip.file(filename, blob, {
          compression: format === 'png' ? 'STORE' : 'DEFLATE',
        });
      } else if (destination === 'folder' && directoryHandle) {
        const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      }

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (onProgress && (i === pages.length - 1 || now - lastProgressAt >= 80)) {
        lastProgressAt = now;
        onProgress({
          currentIndex: i + 1,
          total: pages.length,
          pageNumber: pageNum,
          percent: ((i + 1) / pages.length) * 100,
        });
      }

      // Yield briefly to keep UI responsive and cancellation immediate
      await new Promise((r) => setTimeout(r, 0));
    }

    if (signal?.aborted) {
      throw new DOMException('Export cancelled by user.', 'AbortError');
    }

    if (destination === 'zip' && zip) {
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'STORE',
      });
      const stem = documentName.replace(/\.pdf$/i, '').trim() || 'Document';
      return {
        exportedCount: pages.length,
        zipBlob,
        zipFilename: `${stem}_images_${dpi}dpi.zip`,
        totalOutputBytes: zipBlob.size,
      };
    }

    return {
      exportedCount: pages.length,
      folderName: directoryHandle?.name || 'Selected Folder',
      totalOutputBytes,
    };
  } finally {
    resourceManager.finishJob(jobId);
    await pdfDoc.cleanup().catch(() => {});
    await loadingTask.destroy().catch(() => {});
  }
}
