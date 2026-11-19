import { formatBytes } from './pageRange';
import type { DownloadItem, WorkspaceFileMeta } from '@/types/workspace';

export type DownloadFileCategory =
  | 'archive'
  | 'pdf'
  | 'markdown'
  | 'spreadsheet'
  | 'image'
  | 'html'
  | 'code'
  | 'file';

/**
 * Formats the secondary line for a download item (e.g., "Completed — 156 MB").
 */
export function formatDownloadSubtext(
  item: Pick<DownloadItem, 'status' | 'sizeBytes' | 'progress'>
): string {
  const sizeLabel = item.sizeBytes > 0 ? formatBytes(item.sizeBytes) : null;

  switch (item.status) {
    case 'completed':
      return sizeLabel ? `Completed — ${sizeLabel}` : 'Completed';
    case 'downloading': {
      const pct = Math.max(0, Math.min(100, Math.round(item.progress || 0)));
      return sizeLabel ? `Downloading (${pct}%) — ${sizeLabel}` : `Downloading — ${pct}%`;
    }
    case 'cancelled':
      return sizeLabel ? `Cancelled — ${sizeLabel}` : 'Cancelled';
    case 'error':
      return 'Failed';
    default:
      return sizeLabel ?? 'Completed';
  }
}

/**
 * Maps a filename or MIME type to a visual file category for icon rendering.
 */
export function getDownloadFileCategory(
  filename: string,
  mimeType?: string
): DownloadFileCategory {
  const lower = filename.toLowerCase();
  const mime = (mimeType || '').toLowerCase();

  if (
    lower.endsWith('.zip') ||
    lower.endsWith('.rar') ||
    lower.endsWith('.7z') ||
    lower.endsWith('.tar') ||
    lower.endsWith('.gz') ||
    mime.includes('zip') ||
    mime.includes('archive')
  ) {
    return 'archive';
  }
  if (lower.endsWith('.pdf') || mime === 'application/pdf') {
    return 'pdf';
  }
  if (
    lower.endsWith('.csv') ||
    lower.endsWith('.tsv') ||
    lower.endsWith('.xls') ||
    lower.endsWith('.xlsx') ||
    mime.includes('csv') ||
    mime.includes('spreadsheet') ||
    mime.includes('ms-excel')
  ) {
    return 'spreadsheet';
  }
  if (
    lower.endsWith('.md') ||
    lower.endsWith('.markdown') ||
    lower.endsWith('.mdx') ||
    mime.includes('markdown')
  ) {
    return 'markdown';
  }
  if (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.svg') ||
    mime.startsWith('image/')
  ) {
    return 'image';
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm') || mime.includes('html')) {
    return 'html';
  }
  if (
    lower.endsWith('.json') ||
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.js') ||
    lower.endsWith('.css') ||
    lower.endsWith('.bat') ||
    lower.endsWith('.sh')
  ) {
    return 'code';
  }
  return 'file';
}

/**
 * Returns the most recent download items capped to `limit` for the compact popover.
 */
export function getRecentDownloads(downloads: DownloadItem[], limit = 5): DownloadItem[] {
  if (limit <= 0) return [];
  return downloads.slice(0, limit);
}

/**
 * Finds a matching workspace file for a download entry when available locally.
 */
export function findMatchingWorkspaceFile(
  item: Pick<DownloadItem, 'filename' | 'url'>,
  workspaceFiles: WorkspaceFileMeta[]
): WorkspaceFileMeta | undefined {
  const normalizedName = item.filename.trim().toLowerCase();
  const exact = workspaceFiles.find((f) => f.name.trim().toLowerCase() === normalizedName);
  if (exact) return exact;

  if (item.url.startsWith('local://')) {
    const target = item.url.slice('local://'.length).trim().toLowerCase();
    return workspaceFiles.find(
      (f) => f.id.toLowerCase() === target || f.name.trim().toLowerCase() === target
    );
  }
  return undefined;
}
