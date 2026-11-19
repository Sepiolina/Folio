'use client';

import { detectFileTypeFromName } from './markdownUtils';
import {
  saveWorkspaceFile,
  listWorkspaceFiles,
  setFileHandle,
  getFileHandle,
  triggerBlobDownload,
} from './storage';
import { buildUniqueAssetPath, inferMimeTypeFromFilename } from './markdownAssets';
import { registerWorkspaceAssetUrl } from './markdownAssetStore';
import { serializeWorkbook, normalizeGridRows, type SpreadsheetFormat } from './spreadsheetUtils';
import type { WorkspaceFileMeta } from '@/types/workspace';

function isBinarySpreadsheetFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith('.xls') || lower.endsWith('.xlsx');
}

export async function ingestLocalFile(
  file: File,
  handle?: FileSystemFileHandle
): Promise<WorkspaceFileMeta> {
  const kind = detectFileTypeFromName(file.name);
  const id = `${kind === 'asset' ? 'asset' : 'file'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  if (handle) {
    setFileHandle(id, handle);
  }

  if (kind === 'asset') {
    const existing = await listWorkspaceFiles();
    const assetPath = buildUniqueAssetPath(
      file.name,
      existing.map((f) => f.name)
    );
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type || inferMimeTypeFromFilename(assetPath);
    const meta: WorkspaceFileMeta = {
      id,
      name: assetPath,
      kind: 'asset',
      sizeBytes: bytes.byteLength,
      updatedAt: Date.now(),
      folder: 'Assets',
      mimeType,
      hasNativeHandle: Boolean(handle),
    };
    await saveWorkspaceFile({
      id,
      meta,
      binaryContent: bytes,
    });
    registerWorkspaceAssetUrl(assetPath, bytes, mimeType);
    return meta;
  }

  const meta: WorkspaceFileMeta = {
    id,
    name: file.name,
    kind,
    sizeBytes: file.size,
    updatedAt: Date.now(),
    folder: 'Opened Files',
    hasNativeHandle: Boolean(handle),
  };

  if (kind === 'pdf' || (kind === 'spreadsheet' && isBinarySpreadsheetFilename(file.name))) {
    const buf = await file.arrayBuffer();
    await saveWorkspaceFile({
      id,
      meta,
      binaryContent: new Uint8Array(buf),
    });
  } else {
    const text = await file.text();
    await saveWorkspaceFile({
      id,
      meta,
      textContent: text,
    });
  }

  return meta;
}

export async function openFilesWithPicker(): Promise<WorkspaceFileMeta[]> {
  if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
    try {
      const picker = (window as unknown as {
        showOpenFilePicker: (opts?: unknown) => Promise<FileSystemFileHandle[]>;
      }).showOpenFilePicker;
      const handles = await picker({
        multiple: true,
        types: [
          {
            description: 'Supported Workspace Files',
            accept: {
              'application/pdf': ['.pdf'],
              'text/csv': ['.csv', '.tsv'],
              'application/vnd.ms-excel': ['.xls'],
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
              'text/markdown': ['.md', '.markdown'],
              'text/html': ['.html', '.htm'],
              'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
              'text/plain': ['.txt', '.css', '.js', '.ts', '.json'],
            },
          },
        ],
      });
      const results: WorkspaceFileMeta[] = [];
      for (const handle of handles) {
        const file = await handle.getFile();
        results.push(await ingestLocalFile(file, handle));
      }
      return results;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return [];
      }
      // Fall through to input element if picker blocked in iframe
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept =
      '.pdf,.csv,.tsv,.xls,.xlsx,.md,.markdown,.html,.htm,.png,.jpg,.jpeg,.gif,.webp,.svg,.css,.js,.ts,.json,.txt';
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      const results: WorkspaceFileMeta[] = [];
      for (const f of files) {
        results.push(await ingestLocalFile(f));
      }
      resolve(results);
    };
    input.click();
  });
}

export async function openMarkdownFilesWithPicker(): Promise<WorkspaceFileMeta[]> {
  if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
    try {
      const picker = (window as unknown as {
        showOpenFilePicker: (opts?: unknown) => Promise<FileSystemFileHandle[]>;
      }).showOpenFilePicker;
      const handles = await picker({
        multiple: true,
        types: [
          {
            description: 'Markdown & Text Notes',
            accept: {
              'text/markdown': ['.md', '.markdown'],
              'text/plain': ['.txt'],
            },
          },
        ],
      });
      const results: WorkspaceFileMeta[] = [];
      for (const handle of handles) {
        const file = await handle.getFile();
        results.push(await ingestLocalFile(file, handle));
      }
      return results;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return [];
      }
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.md,.markdown,.txt';
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      const results: WorkspaceFileMeta[] = [];
      for (const f of files) {
        results.push(await ingestLocalFile(f));
      }
      resolve(results);
    };
    input.click();
  });
}

export async function saveTextDocument(
  fileId: string,
  filename: string,
  content: string,
  saveAs = false
): Promise<{ savedToNativeFile: boolean; newFilename?: string }> {
  if (!saveAs) {
    const handle = getFileHandle(fileId);
    if (handle) {
      try {
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return { savedToNativeFile: true };
      } catch {
        // Fallback below
      }
    }
  } else if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const picker = (window as unknown as {
        showSaveFilePicker: (opts?: unknown) => Promise<FileSystemFileHandle>;
      }).showSaveFilePicker;
      const handle = await picker({
        suggestedName: filename,
        types: [
          {
            description: 'Markdown / Text Document',
            accept: { 'text/markdown': ['.md', '.markdown', '.txt'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      setFileHandle(fileId, handle);
      return { savedToNativeFile: true, newFilename: handle.name };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { savedToNativeFile: false };
      }
    }
  }

  if (saveAs) {
    triggerBlobDownload(new Blob([content], { type: 'text/markdown;charset=utf-8' }), filename);
  }
  return { savedToNativeFile: false };
}

export async function saveSpreadsheetDocument(
  fileId: string,
  filename: string,
  bytes: Uint8Array,
  mimeType: string,
  saveAs = false
): Promise<{ savedToNativeFile: boolean; newFilename?: string }> {
  const bufferCopy = new Uint8Array(bytes.byteLength);
  bufferCopy.set(bytes);

  if (!saveAs) {
    const handle = getFileHandle(fileId);
    if (handle) {
      try {
        const writable = await handle.createWritable();
        await writable.write(bufferCopy);
        await writable.close();
        return { savedToNativeFile: true };
      } catch {
        // Fallback below
      }
    }
  } else if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const picker = (window as unknown as {
        showSaveFilePicker: (opts?: unknown) => Promise<FileSystemFileHandle>;
      }).showSaveFilePicker;
      const handle = await picker({
        suggestedName: filename,
        types: [
          {
            description: 'Spreadsheets (XLSX, XLS, CSV)',
            accept: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
              'application/vnd.ms-excel': ['.xls'],
              'text/csv': ['.csv'],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(bufferCopy);
      await writable.close();
      setFileHandle(fileId, handle);
      return { savedToNativeFile: true, newFilename: handle.name };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { savedToNativeFile: false };
      }
    }
  }

  if (saveAs) {
    triggerBlobDownload(new Blob([bufferCopy.buffer], { type: mimeType }), filename);
  }
  return { savedToNativeFile: false };
}

export async function createNewMarkdownFile(
  title = 'Untitled.md',
  customContent?: string
): Promise<WorkspaceFileMeta> {
  const safeName = title.endsWith('.md') || title.endsWith('.markdown') ? title : `${title}.md`;
  const id = `md-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const initialContent = customContent ?? `# ${safeName.replace(/\.md$/i, '')}\n\nStart writing...\n`;
  const meta: WorkspaceFileMeta = {
    id,
    name: safeName,
    kind: 'markdown',
    sizeBytes: initialContent.length,
    updatedAt: Date.now(),
    folder: 'Notes',
  };
  await saveWorkspaceFile({ id, meta, textContent: initialContent });
  return meta;
}

export async function createNewSpreadsheetFile(
  title = 'Sheet.xlsx',
  format: SpreadsheetFormat = 'xlsx'
): Promise<WorkspaceFileMeta> {
  const hasExt = /\.(xlsx|xls|csv)$/i.test(title);
  const safeName = hasExt ? title : `${title}.${format}`;
  const resolvedFormat: SpreadsheetFormat = safeName.toLowerCase().endsWith('.csv')
    ? 'csv'
    : safeName.toLowerCase().endsWith('.xls')
      ? 'xls'
      : 'xlsx';
  const id = `sheet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const initialRows = normalizeGridRows([
    ['Item', 'Category', 'Quantity', 'Unit Cost', 'Total'],
    ['', '', '', '', '=C2*D2'],
  ]);
  const serialized = serializeWorkbook(
    {
      sheets: [{ name: 'Sheet1', rows: initialRows }],
      activeSheetIndex: 0,
      sourceFormat: resolvedFormat,
    },
    resolvedFormat
  );
  const meta: WorkspaceFileMeta = {
    id,
    name: safeName,
    kind: 'spreadsheet',
    sizeBytes: serialized.bytes.byteLength,
    updatedAt: Date.now(),
    folder: 'Spreadsheets',
  };
  await saveWorkspaceFile({
    id,
    meta,
    ...(resolvedFormat === 'csv'
      ? { textContent: serialized.text ?? '' }
      : { binaryContent: serialized.bytes }),
  });
  return meta;
}
