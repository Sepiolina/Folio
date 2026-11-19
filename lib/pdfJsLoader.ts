'use client';

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

export async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return mod;
    });
  }
  return pdfjsPromise;
}

export async function loadPdfDocument(bytes: Uint8Array, password?: string) {
  const pdfjs = await getPdfJs();
  // Pass a fresh copy so PDF.js worker transferring the buffer does not detach caller's Uint8Array
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const loadingTask = pdfjs.getDocument({
    data: copy,
    password: password || undefined,
  });
  return loadingTask.promise;
}
