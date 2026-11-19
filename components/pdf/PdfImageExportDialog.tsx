'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Package,
  X,
} from 'lucide-react';
import {
  estimateImageExportSizeBytes,
  formatBytes,
  formatPageExportFilename,
  parsePageRange,
} from '@/lib/pageRange';
import { exportPdfPagesToImages } from '@/lib/pdfImageExporter';
import { triggerBlobDownload } from '@/lib/storage';
import { useWorkspaceStore } from '@/stores/workspaceStore';

interface PdfImageExportDialogProps {
  open: boolean;
  onClose: () => void;
  pdfBytes: Uint8Array;
  documentName: string;
  totalPages: number;
  currentPage: number;
  pageSizePt: { width: number; height: number };
}

export function PdfImageExportDialog({
  open,
  onClose,
  pdfBytes,
  documentName,
  totalPages,
  currentPage,
  pageSizePt,
}: PdfImageExportDialogProps) {
  const { settings, addDownload } = useWorkspaceStore();

  const [format, setFormat] = useState<'png' | 'jpeg'>(settings.pdfDefaultExportFormat);
  const [jpegQuality, setJpegQuality] = useState(90);
  const [scope, setScope] = useState<'all' | 'current' | 'custom'>('all');
  const [customRange, setCustomRange] = useState(`1-${Math.min(totalPages, 5)}`);
  const [dpiPreset, setDpiPreset] = useState<number | 'custom'>(settings.pdfDefaultExportDpi);
  const [customDpi, setCustomDpi] = useState(250);
  const [destination, setDestination] = useState<'zip' | 'folder'>('zip');
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ currentIndex: 0, total: 0, pageNumber: 1, percent: 0 });
  const [error, setError] = useState<string | null>(null);
  const [completedInfo, setCompletedInfo] = useState<{
    count: number;
    outputLabel: string;
    bytes: number;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const activeDpi = dpiPreset === 'custom' ? Math.max(36, Math.min(1200, customDpi || 150)) : dpiPreset;

  const pageSelection = useMemo(() => {
    if (scope === 'all') {
      return {
        valid: totalPages > 0,
        pages: Array.from({ length: totalPages }, (_, i) => i + 1),
        error: undefined,
      };
    }
    if (scope === 'current') {
      const clamped = Math.max(1, Math.min(totalPages, currentPage));
      return { valid: true, pages: [clamped], error: undefined };
    }
    return parsePageRange(customRange, totalPages);
  }, [scope, customRange, totalPages, currentPage]);

  const estimatedBytes = useMemo(
    () =>
      estimateImageExportSizeBytes(
        pageSelection.pages.length,
        pageSizePt.width,
        pageSizePt.height,
        activeDpi,
        format,
        jpegQuality / 100
      ),
    [pageSelection.pages.length, pageSizePt, activeDpi, format, jpegQuality]
  );

  const filenamePreview = formatPageExportFilename(
    documentName,
    pageSelection.pages[0] || 1,
    totalPages,
    format
  );

  if (!open) return null;

  const handlePickFolder = async () => {
    setError(null);
    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        const picker = (window as unknown as {
          showDirectoryPicker: (opts?: unknown) => Promise<FileSystemDirectoryHandle>;
        }).showDirectoryPicker;
        const handle = await picker({ mode: 'readwrite' });
        setDirHandle(handle);
        setDestination('folder');
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError('Folder picker is blocked in this browser context. Use ZIP Archive instead.');
          setDestination('zip');
        }
      }
    } else {
      setError('Direct folder picker requires a Chromium File System Access context. Use ZIP Archive.');
      setDestination('zip');
    }
  };

  const handleStartExport = async () => {
    if (!pageSelection.valid || pageSelection.pages.length === 0) {
      setError(pageSelection.error || 'Select valid pages to export.');
      return;
    }
    if (destination === 'folder' && !dirHandle) {
      setError('Please select a destination folder first, or switch to ZIP Archive.');
      return;
    }

    setError(null);
    setCompletedInfo(null);
    setExporting(true);
    setProgress({ currentIndex: 0, total: pageSelection.pages.length, pageNumber: pageSelection.pages[0], percent: 0 });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await exportPdfPagesToImages({
        pdfBytes,
        documentName,
        pages: pageSelection.pages,
        format,
        dpi: activeDpi,
        jpegQuality: jpegQuality / 100,
        destination,
        directoryHandle: dirHandle,
        scopeId: documentName,
        controller,
        signal: controller.signal,
        onProgress: (info) => setProgress(info),
      });

      if (result.zipBlob && result.zipFilename) {
        triggerBlobDownload(result.zipBlob, result.zipFilename);
        addDownload({
          filename: result.zipFilename,
          url: `local://${result.zipFilename}`,
          sizeBytes: result.totalOutputBytes,
          progress: 100,
          status: 'completed',
          mimeType: 'application/zip',
        });
      }

      setCompletedInfo({
        count: result.exportedCount,
        outputLabel: result.zipFilename || result.folderName || 'Output',
        bytes: result.totalOutputBytes,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Export cancelled.');
      } else {
        setError(err instanceof Error ? err.message : 'Image export failed.');
      }
    } finally {
      setExporting(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    if (exporting && abortRef.current) {
      abortRef.current.abort();
    } else {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-images-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--border-strong)] bg-[var(--surface-chrome)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-hairline)]">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-[var(--accent-color)]" />
            <h2 id="export-images-title" className="text-sm font-semibold text-[var(--text-primary)]">
              Export PDF as Images
            </h2>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Close export dialog"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Format & Quality */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[var(--text-secondary)] mb-1.5">
                Image Format
              </label>
              <div className="flex p-0.5 rounded-md bg-[var(--surface-subtle)] border border-[var(--border-hairline)]">
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => setFormat('png')}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                    format === 'png'
                      ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  PNG
                </button>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => setFormat('jpeg')}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                    format === 'jpeg'
                      ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  JPEG
                </button>
              </div>
            </div>

            <div>
              <label className="block font-medium text-[var(--text-secondary)] mb-1.5">
                Resolution (DPI)
              </label>
              <select
                aria-label="Export resolution DPI"
                disabled={exporting}
                value={dpiPreset}
                onChange={(e) => {
                  const v = e.target.value;
                  setDpiPreset(v === 'custom' ? 'custom' : Number(v));
                }}
                className="w-full h-8 px-2.5 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)] focus:outline-none"
              >
                <option value={72}>72 DPI (Screen)</option>
                <option value={150}>150 DPI (Standard)</option>
                <option value={200}>200 DPI (Crisp)</option>
                <option value={300}>300 DPI (Print Default)</option>
                <option value={600}>600 DPI (Archival)</option>
                <option value="custom">Custom DPI…</option>
              </select>
            </div>
          </div>

          {dpiPreset === 'custom' && (
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="custom-dpi-input" className="text-[var(--text-secondary)]">
                Custom DPI (36–1200)
              </label>
              <input
                id="custom-dpi-input"
                type="number"
                min={36}
                max={1200}
                value={customDpi}
                onChange={(e) => setCustomDpi(Number(e.target.value))}
                className="w-28 h-8 px-2.5 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)] tabular-nums"
              />
            </div>
          )}

          {format === 'jpeg' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="jpeg-quality-range" className="font-medium text-[var(--text-secondary)]">
                  JPEG Quality
                </label>
                <span className="tabular-nums text-[var(--text-primary)]">{jpegQuality}%</span>
              </div>
              <input
                id="jpeg-quality-range"
                type="range"
                min={40}
                max={100}
                value={jpegQuality}
                disabled={exporting}
                onChange={(e) => setJpegQuality(Number(e.target.value))}
                className="w-full accent-[var(--accent-color)]"
              />
            </div>
          )}

          {/* Page Range */}
          <div>
            <span className="block font-medium text-[var(--text-secondary)] mb-1.5">
              Pages Range ({totalPages} total)
            </span>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="export-scope"
                  checked={scope === 'all'}
                  disabled={exporting}
                  onChange={() => setScope('all')}
                  className="accent-[var(--accent-color)]"
                />
                <span className="text-[var(--text-primary)]">All pages (1–{totalPages})</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="export-scope"
                  checked={scope === 'current'}
                  disabled={exporting}
                  onChange={() => setScope('current')}
                  className="accent-[var(--accent-color)]"
                />
                <span className="text-[var(--text-primary)]">Current page (Page {currentPage})</span>
              </label>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer shrink-0">
                  <input
                    type="radio"
                    name="export-scope"
                    checked={scope === 'custom'}
                    disabled={exporting}
                    onChange={() => setScope('custom')}
                    className="accent-[var(--accent-color)]"
                  />
                  <span className="text-[var(--text-primary)]">Custom range</span>
                </label>
                <input
                  type="text"
                  value={customRange}
                  disabled={exporting || scope !== 'custom'}
                  onChange={(e) => setCustomRange(e.target.value)}
                  placeholder="e.g. 1-5, 8, 10-12"
                  aria-label="Custom page range"
                  className="flex-1 h-7 px-2.5 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)] disabled:opacity-45 tabular-nums focus:outline-none focus:border-[var(--accent-color)]"
                />
              </div>
              {scope === 'custom' && !pageSelection.valid && (
                <p className="text-[11px] text-rose-400">{pageSelection.error}</p>
              )}
            </div>
          </div>

          {/* Output Destination */}
          <div>
            <span className="block font-medium text-[var(--text-secondary)] mb-1.5">
              Output Destination
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={exporting}
                onClick={() => setDestination('zip')}
                className={`flex items-center justify-center gap-1.5 h-9 px-3 rounded-md border text-xs font-medium transition-colors ${
                  destination === 'zip'
                    ? 'border-[var(--accent-color)] bg-[var(--accent-soft)] text-[var(--accent-color)]'
                    : 'border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)]'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>ZIP Archive</span>
              </button>

              <button
                type="button"
                disabled={exporting}
                onClick={handlePickFolder}
                className={`flex items-center justify-center gap-1.5 h-9 px-3 rounded-md border text-xs font-medium transition-colors ${
                  destination === 'folder'
                    ? 'border-[var(--accent-color)] bg-[var(--accent-soft)] text-[var(--accent-color)]'
                    : 'border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)]'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span className="truncate">
                  {dirHandle ? dirHandle.name : 'Select Folder…'}
                </span>
              </button>
            </div>
          </div>

          {/* Filename & Estimate Summary */}
          <div className="p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] space-y-1 text-[11px] text-[var(--text-secondary)]">
            <div className="flex justify-between">
              <span>Filename pattern</span>
              <span className="font-mono text-[var(--text-primary)] truncate max-w-[210px]">
                {filenamePreview}
              </span>
            </div>
            <div className="flex justify-between tabular-nums">
              <span>Pages to export</span>
              <span className="text-[var(--text-primary)]">{pageSelection.pages.length}</span>
            </div>
            <div className="flex justify-between tabular-nums">
              <span>Estimated output</span>
              <span className="text-[var(--text-primary)]">~{formatBytes(estimatedBytes)}</span>
            </div>
          </div>

          {/* Export Progress */}
          {exporting && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-[var(--text-primary)] tabular-nums">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-color)]" />
                  Exporting page {progress.currentIndex} of {progress.total}…
                </span>
                <span>{progress.percent.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[var(--surface-subtle)] overflow-hidden">
                <div
                  className="h-full bg-[var(--accent-color)] transition-all duration-150"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {error && <p className="text-[11px] text-rose-400">{error}</p>}

          {completedInfo && (
            <div className="flex items-center gap-2 p-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[11px]">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Exported {completedInfo.count} image(s) to <strong>{completedInfo.outputLabel}</strong> (
                {formatBytes(completedInfo.bytes)}).
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
          <button
            type="button"
            onClick={handleCancel}
            className="px-3.5 py-1.5 rounded-md border border-[var(--border-hairline)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
          >
            {exporting ? 'Cancel Export' : 'Close'}
          </button>
          {!exporting && (
            <button
              type="button"
              onClick={handleStartExport}
              disabled={!pageSelection.valid}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-[var(--accent-color)] text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
