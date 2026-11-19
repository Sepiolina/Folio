'use client';

import JSZip from 'jszip';
import type { WorkspaceFileMeta } from '@/types/workspace';
import {
  buildUniqueAssetPath,
  collectRelatedWorkspaceFiles,
  inferMimeTypeFromFilename,
  isWorkspaceAssetRef,
  matchWorkspaceFileByReference,
  normalizeWorkspacePath,
} from './markdownAssets';
import {
  getWorkspaceFile,
  listWorkspaceFiles,
  saveWorkspaceFile,
  type StoredFileRecord,
} from './storage';

// Object-URL cache keyed by normalized asset path (e.g. "assets/diagram.png")
const assetBlobUrlCache = new Map<string, string>();
const inflightResolutions = new Map<string, Promise<string | null>>();

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function registerWorkspaceAssetUrl(
  assetPath: string,
  bytes: Uint8Array,
  mimeType?: string
): string {
  const norm = normalizeWorkspacePath(assetPath).toLowerCase();
  const existing = assetBlobUrlCache.get(norm);
  if (existing) {
    URL.revokeObjectURL(existing);
  }
  const type = mimeType || inferMimeTypeFromFilename(assetPath);
  const url = URL.createObjectURL(new Blob([toBlobPart(bytes)], { type }));
  assetBlobUrlCache.set(norm, url);
  return url;
}

export function invalidateWorkspaceAssetUrl(assetPath: string): void {
  const norm = normalizeWorkspacePath(assetPath).toLowerCase();
  const existing = assetBlobUrlCache.get(norm);
  if (existing) {
    URL.revokeObjectURL(existing);
    assetBlobUrlCache.delete(norm);
  }
}

export function getCachedWorkspaceAssetUrl(rawRef: string): string | null {
  if (!isWorkspaceAssetRef(rawRef)) return null;
  const norm = normalizeWorkspacePath(rawRef).toLowerCase();
  if (!norm) return null;
  const direct = assetBlobUrlCache.get(norm);
  if (direct) return direct;
  // Basename fallback lookup
  const base = norm.split('/').pop() || norm;
  for (const [key, url] of assetBlobUrlCache.entries()) {
    const keyBase = key.split('/').pop() || key;
    if (keyBase === base) return url;
  }
  return null;
}

export async function resolveWorkspaceAssetUrl(rawRef: string): Promise<string | null> {
  const cached = getCachedWorkspaceAssetUrl(rawRef);
  if (cached) return cached;

  if (!isWorkspaceAssetRef(rawRef)) return null;
  const norm = normalizeWorkspacePath(rawRef).toLowerCase();
  if (!norm) return null;

  const inflight = inflightResolutions.get(norm);
  if (inflight) return inflight;

  const task = (async () => {
    try {
      const files = await listWorkspaceFiles();
      const matched = matchWorkspaceFileByReference(rawRef, files);
      if (!matched) return null;

      const rec = await getWorkspaceFile(matched.id);
      if (!rec) return null;

      const mimeType =
        matched.mimeType || inferMimeTypeFromFilename(matched.name);

      if (rec.binaryContent) {
        return registerWorkspaceAssetUrl(matched.name, rec.binaryContent, mimeType);
      }
      if (rec.textContent && mimeType === 'image/svg+xml') {
        const encoded = new TextEncoder().encode(rec.textContent);
        return registerWorkspaceAssetUrl(matched.name, encoded, mimeType);
      }
      return null;
    } catch {
      return null;
    } finally {
      inflightResolutions.delete(norm);
    }
  })();

  inflightResolutions.set(norm, task);
  return task;
}

export async function saveImageFileToWorkspaceAssets(
  file: File,
  existingFiles?: WorkspaceFileMeta[]
): Promise<WorkspaceFileMeta> {
  const files = existingFiles ?? (await listWorkspaceFiles());
  const rawName = file.name && file.name.trim() ? file.name : `image-${Date.now()}.png`;
  const assetPath = buildUniqueAssetPath(
    rawName,
    files.map((f) => f.name)
  );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = file.type || inferMimeTypeFromFilename(assetPath);
  const id = `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  const meta: WorkspaceFileMeta = {
    id,
    name: assetPath,
    kind: 'asset',
    sizeBytes: bytes.byteLength,
    updatedAt: Date.now(),
    folder: 'Assets',
    mimeType,
  };

  await saveWorkspaceFile({
    id,
    meta,
    binaryContent: bytes,
  });

  registerWorkspaceAssetUrl(assetPath, bytes, mimeType);
  return meta;
}

export interface MarkdownZipExportResult {
  zipBlob: Blob;
  zipFilename: string;
  bundledPaths: string[];
  missingRefs: string[];
}

export async function exportMarkdownZipBundle(options: {
  fileId: string;
  filename: string;
  content: string;
  workspaceFiles?: WorkspaceFileMeta[];
}): Promise<MarkdownZipExportResult> {
  const { fileId, filename, content } = options;
  const files =
    options.workspaceFiles && options.workspaceFiles.length > 0
      ? options.workspaceFiles
      : await listWorkspaceFiles();

  // Preload records for all text-based workspace docs that could be traversed via links
  const recordCache = new Map<string, StoredFileRecord | null>();
  await Promise.all(
    files
      .filter((f) => f.id !== fileId && (f.kind === 'markdown' || f.kind === 'html' || f.kind === 'text'))
      .map(async (f) => {
        const rec = await getWorkspaceFile(f.id);
        recordCache.set(f.id, rec);
      })
  );

  const traceResult = collectRelatedWorkspaceFiles({
    rootFileId: fileId,
    rootFilename: filename,
    rootContent: content,
    files,
    getTextContent: (f) => recordCache.get(f.id)?.textContent,
  });

  const zip = new JSZip();
  const bundledPaths: string[] = [];

  for (const entry of traceResult.entries) {
    if (entry.isRoot) {
      zip.file(entry.zipPath, content);
      bundledPaths.push(entry.zipPath);
      continue;
    }

    const rec = recordCache.has(entry.file.id)
      ? recordCache.get(entry.file.id)
      : await getWorkspaceFile(entry.file.id);

    if (!rec) continue;

    if (rec.binaryContent) {
      zip.file(entry.zipPath, rec.binaryContent);
      bundledPaths.push(entry.zipPath);
    } else if (typeof rec.textContent === 'string') {
      zip.file(entry.zipPath, rec.textContent);
      bundledPaths.push(entry.zipPath);
    }
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const stem = filename.replace(/\.(md|markdown)$/i, '') || 'Document';
  const zipFilename = `${stem}.zip`;

  return {
    zipBlob,
    zipFilename,
    bundledPaths,
    missingRefs: traceResult.missingRefs,
  };
}
