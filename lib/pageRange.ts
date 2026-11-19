export interface PageRangeResult {
  valid: boolean;
  pages: number[];
  error?: string;
}

/**
 * Parses and validates page range syntax such as "1-5, 8, 10-12".
 * Returns sorted unique 1-based page numbers within [1, totalPages].
 */
export function parsePageRange(input: string, totalPages: number): PageRangeResult {
  if (totalPages < 1 || !Number.isInteger(totalPages)) {
    return { valid: false, pages: [], error: 'Document has no pages.' };
  }

  const cleaned = input.trim();
  if (!cleaned) {
    return { valid: false, pages: [], error: 'Enter at least one page number or range (e.g. 1-5, 8).' };
  }

  const tokens = cleaned.split(',').map((t) => t.trim());
  const selected = new Set<number>();

  for (const token of tokens) {
    if (!token) {
      return { valid: false, pages: [], error: 'Empty segment near comma in page range.' };
    }

    if (/^\d+$/.test(token)) {
      const page = Number(token);
      if (page < 1 || page > totalPages) {
        return {
          valid: false,
          pages: [],
          error: `Page ${page} is out of bounds (1–${totalPages}).`,
        };
      }
      selected.add(page);
      continue;
    }

    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end > totalPages) {
        return {
          valid: false,
          pages: [],
          error: `Range ${start}-${end} exceeds document bounds (1–${totalPages}).`,
        };
      }
      if (start > end) {
        return {
          valid: false,
          pages: [],
          error: `Invalid descending range "${start}-${end}".`,
        };
      }
      for (let p = start; p <= end; p++) {
        selected.add(p);
      }
      continue;
    }

    return {
      valid: false,
      pages: [],
      error: `Unrecognized page token "${token}". Use numbers or ranges like 1-5, 8.`,
    };
  }

  const pages = Array.from(selected).sort((a, b) => a - b);
  return { valid: true, pages };
}

/**
 * Formats sequential export filenames such as "Document_page_001.png".
 */
export function formatPageExportFilename(
  documentName: string,
  pageNumber: number,
  totalPages: number,
  format: 'png' | 'jpeg'
): string {
  const stem = documentName
    .replace(/\.pdf$/i, '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_') || 'Document';
  const digits = Math.max(3, String(totalPages).length);
  const padded = String(pageNumber).padStart(digits, '0');
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  return `${stem}_page_${padded}.${ext}`;
}

/**
 * Estimates total image export byte size given page dimensions in PDF points (72pt = 1 inch).
 */
export function estimateImageExportSizeBytes(
  pageCount: number,
  widthPt: number,
  heightPt: number,
  dpi: number,
  format: 'png' | 'jpeg',
  jpegQuality = 0.9
): number {
  if (pageCount <= 0 || dpi <= 0) return 0;
  const pxW = (widthPt / 72) * dpi;
  const pxH = (heightPt / 72) * dpi;
  const rawPixels = pxW * pxH;
  // Empirical compression ratios for typical document pages (white paper + text/diagrams)
  const bytesPerPixel =
    format === 'png'
      ? 0.28
      : 0.06 + 0.14 * Math.min(1, Math.max(0.1, jpegQuality));
  return Math.round(pageCount * rawPixels * bytesPerPixel);
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}
