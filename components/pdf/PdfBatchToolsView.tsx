'use client';

import React, { useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FileImage,
  FolderPlus,
  Layers,
  Loader2,
  Merge,
  Scissors,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { getWorkspaceFile, saveWorkspaceFile, triggerBlobDownload } from '@/lib/storage';
import { extractPdfPages, inspectPdfMetadata, mergePdfBytes, optimizePdfBytes } from '@/lib/pdfOperations';
import { exportPdfPagesToImages } from '@/lib/pdfImageExporter';
import { formatBytes } from '@/lib/pageRange';
import { parseBatchOperationFromUrl, type BatchOp } from '@/lib/toolsHelper';

interface QueuedPdf {
  id: string;
  name: string;
  bytes: Uint8Array;
  status: 'ready' | 'processing' | 'done' | 'error';
  detail?: string;
}

export function PdfBatchToolsView({ tabUrl }: { tabUrl?: string }) {
  const { workspaceFiles, addDownload, upsertWorkspaceFile, openFileInTab } = useWorkspaceStore();

  const requestedOp = parseBatchOperationFromUrl(tabUrl);
  const [prevTabUrl, setPrevTabUrl] = useState(tabUrl);
  const [queue, setQueue] = useState<QueuedPdf[]>([]);
  const [operation, setOperation] = useState<BatchOp>(requestedOp ?? 'merge');
  const [imageFormat, setImageFormat] = useState<'png' | 'jpeg'>('png');
  const [imageDpi, setImageDpi] = useState(150);
  const [splitChunkSize, setSplitChunkSize] = useState(2);

  if (tabUrl !== prevTabUrl) {
    setPrevTabUrl(tabUrl);
    if (requestedOp) {
      setOperation(requestedOp);
    }
  }

  const [running, setRunning] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleUploadFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(async (file) => {
      if (!file.name.toLowerCase().endsWith('.pdf')) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      setQueue((prev) => [
        ...prev,
        {
          id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          bytes,
          status: 'ready',
          detail: formatBytes(bytes.byteLength),
        },
      ]);
    });
  };

  const handleLoadWorkspacePdfs = async () => {
    const pdfMetas = workspaceFiles.filter((f) => f.kind === 'pdf');
    for (const meta of pdfMetas) {
      const rec = await getWorkspaceFile(meta.id);
      if (rec?.binaryContent) {
        setQueue((prev) => {
          if (prev.some((q) => q.name === meta.name)) return prev;
          return [
            ...prev,
            {
              id: `q-${meta.id}-${Date.now()}`,
              name: meta.name,
              bytes: rec.binaryContent!,
              status: 'ready',
              detail: formatBytes(rec.binaryContent!.byteLength),
            },
          ];
        });
      }
    }
  };

  const moveItem = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= queue.length) return;
    setQueue((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const runBatch = async () => {
    if (queue.length === 0) return;
    setRunning(true);
    setSummary(null);
    setProgressPct(0);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (operation === 'merge') {
        setProgressText('Merging queued PDF documents…');
        const merged = await mergePdfBytes(queue.map((q) => q.bytes));
        const outName = `Merged_${queue.length}_Documents.pdf`;
        const id = `merged-${Date.now().toString(36)}`;
        const meta = {
          id,
          name: outName,
          kind: 'pdf' as const,
          sizeBytes: merged.byteLength,
          updatedAt: Date.now(),
          folder: 'Batch Output',
        };
        await saveWorkspaceFile({ id, meta, binaryContent: merged });
        upsertWorkspaceFile(meta);

        const copy = new Uint8Array(merged.byteLength);
        copy.set(merged);
        const blob = new Blob([copy.buffer], { type: 'application/pdf' });
        triggerBlobDownload(blob, outName);
        addDownload({
          filename: outName,
          url: `local://${outName}`,
          sizeBytes: blob.size,
          progress: 100,
          status: 'completed',
          mimeType: 'application/pdf',
        });

        setQueue((prev) => prev.map((q) => ({ ...q, status: 'done' })));
        setProgressPct(100);
        setSummary(`Merged ${queue.length} PDFs into ${outName} (${formatBytes(merged.byteLength)}).`);
        openFileInTab(meta, 'pdf');
      } else if (operation === 'images') {
        const masterZip = new JSZip();
        for (let i = 0; i < queue.length; i++) {
          if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          const item = queue[i];
          setQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: 'processing' } : q))
          );
          const meta = await inspectPdfMetadata(item.bytes);
          const totalPages = meta.pageCount;

          const res = await exportPdfPagesToImages({
            pdfBytes: item.bytes,
            documentName: item.name,
            pages: Array.from({ length: totalPages }, (_, idx) => idx + 1),
            format: imageFormat,
            dpi: imageDpi,
            jpegQuality: 0.9,
            destination: 'zip',
            signal: controller.signal,
            onProgress: (p) => {
              setProgressText(`Converting ${item.name} — page ${p.currentIndex}/${p.total}`);
              setProgressPct(((i + p.currentIndex / p.total) / queue.length) * 100);
            },
          });

          if (res.zipBlob) {
            const innerZip = await JSZip.loadAsync(res.zipBlob);
            const folderName = item.name.replace(/\.pdf$/i, '');
            const folder = masterZip.folder(folderName);
            for (const [fname, fileObj] of Object.entries(innerZip.files)) {
              if (!fileObj.dir) {
                const content = await fileObj.async('uint8array');
                folder?.file(fname, content);
              }
            }
          }

          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id ? { ...q, status: 'done', detail: `${totalPages} pages exported` } : q
            )
          );
        }

        const outBlob = await masterZip.generateAsync({ type: 'blob', compression: 'STORE' });
        const zipName = `Batch_PDF_Images_${imageDpi}dpi.zip`;
        triggerBlobDownload(outBlob, zipName);
        addDownload({
          filename: zipName,
          url: `local://${zipName}`,
          sizeBytes: outBlob.size,
          progress: 100,
          status: 'completed',
          mimeType: 'application/zip',
        });
        setSummary(`Exported ${queue.length} PDF(s) to ${zipName} (${formatBytes(outBlob.size)}).`);
      } else if (operation === 'split') {
        const zip = new JSZip();
        const chunk = Math.max(1, splitChunkSize);
        for (let i = 0; i < queue.length; i++) {
          if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          const item = queue[i];
          const meta = await inspectPdfMetadata(item.bytes);
          const total = meta.pageCount;

          const stem = item.name.replace(/\.pdf$/i, '');
          const folder = zip.folder(stem);
          for (let start = 1; start <= total; start += chunk) {
            const end = Math.min(total, start + chunk - 1);
            const range = Array.from({ length: end - start + 1 }, (_, k) => start + k);
            const partBytes = await extractPdfPages(item.bytes, range);
            folder?.file(`${stem}_pages_${start}-${end}.pdf`, partBytes);
          }

          setProgressPct(((i + 1) / queue.length) * 100);
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id ? { ...q, status: 'done', detail: `Split ${total} pages` } : q
            )
          );
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipName = `Batch_Split_PDFs.zip`;
        triggerBlobDownload(zipBlob, zipName);
        addDownload({
          filename: zipName,
          url: `local://${zipName}`,
          sizeBytes: zipBlob.size,
          progress: 100,
          status: 'completed',
          mimeType: 'application/zip',
        });
        setSummary(`Split ${queue.length} PDF(s) into ${zipName}.`);
      } else if (operation === 'optimize') {
        const zip = new JSZip();
        let totalBefore = 0;
        let totalAfter = 0;
        for (let i = 0; i < queue.length; i++) {
          if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          const item = queue[i];
          setProgressText(`Optimizing ${item.name}…`);
          const optimized = await optimizePdfBytes(item.bytes);
          totalBefore += item.bytes.byteLength;
          totalAfter += optimized.byteLength;
          zip.file(item.name, optimized);
          setProgressPct(((i + 1) / queue.length) * 100);
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    status: 'done',
                    detail: `${formatBytes(item.bytes.byteLength)} → ${formatBytes(optimized.byteLength)}`,
                  }
                : q
            )
          );
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipName = `Batch_Optimized_PDFs.zip`;
        triggerBlobDownload(zipBlob, zipName);
        addDownload({
          filename: zipName,
          url: `local://${zipName}`,
          sizeBytes: zipBlob.size,
          progress: 100,
          status: 'completed',
          mimeType: 'application/zip',
        });
        setSummary(
          `Optimized ${queue.length} PDF(s): ${formatBytes(totalBefore)} → ${formatBytes(totalAfter)}.`
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setSummary('Batch job cancelled.');
      } else {
        setSummary(err instanceof Error ? err.message : 'Batch operation failed.');
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--surface-canvas)] p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Layers className="w-5 h-5 text-[var(--accent-color)]" />
              <span>PDF Batch Tools</span>
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Merge multiple documents, convert entire queues to PNG/JPEG archives, split by page chunks, or optimize streams.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLoadWorkspacePdfs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-chrome)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)]"
            >
              <FolderPlus className="w-3.5 h-3.5 text-[var(--accent-color)]" />
              <span>Add Workspace PDFs</span>
            </button>
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--accent-color)] text-xs font-medium text-white cursor-pointer hover:opacity-90">
              <Upload className="w-3.5 h-3.5" />
              <span>Add Local PDFs</span>
              <input
                type="file"
                accept=".pdf"
                multiple
                onChange={(e) => handleUploadFiles(e.target.files)}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Operation Selector */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { id: 'merge' as const, label: 'Merge PDFs', icon: Merge },
            { id: 'images' as const, label: 'PDFs to Images', icon: FileImage },
            { id: 'split' as const, label: 'Split PDFs', icon: Scissors },
            { id: 'optimize' as const, label: 'Optimize Size', icon: Sparkles },
          ].map((op) => {
            const Icon = op.icon;
            const active = operation === op.id;
            return (
              <button
                key={op.id}
                type="button"
                onClick={() => setOperation(op.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  active
                    ? 'border-[var(--accent-color)] bg-[var(--accent-soft)] text-[var(--accent-color)]'
                    : 'border-[var(--border-hairline)] bg-[var(--surface-chrome)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{op.label}</span>
              </button>
            );
          })}
        </div>

        {/* Operation Options */}
        {operation === 'images' && (
          <div className="flex flex-wrap items-center gap-4 p-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-chrome)] text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-secondary)]">Format</span>
              <select
                value={imageFormat}
                onChange={(e) => setImageFormat(e.target.value as 'png' | 'jpeg')}
                className="h-7 px-2 rounded bg-[var(--surface-subtle)] border border-[var(--border-hairline)]"
              >
                <option value="png">PNG (Lossless)</option>
                <option value="jpeg">JPEG</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-secondary)]">Resolution</span>
              <select
                value={imageDpi}
                onChange={(e) => setImageDpi(Number(e.target.value))}
                className="h-7 px-2 rounded bg-[var(--surface-subtle)] border border-[var(--border-hairline)]"
              >
                <option value={72}>72 DPI</option>
                <option value={150}>150 DPI</option>
                <option value={300}>300 DPI</option>
              </select>
            </div>
          </div>
        )}

        {operation === 'split' && (
          <div className="flex items-center gap-3 p-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-chrome)] text-xs">
            <span className="text-[var(--text-secondary)]">Pages per split output file:</span>
            <input
              type="number"
              min={1}
              max={100}
              value={splitChunkSize}
              onChange={(e) => setSplitChunkSize(Number(e.target.value))}
              className="w-20 h-7 px-2 rounded bg-[var(--surface-subtle)] border border-[var(--border-hairline)] tabular-nums"
            />
          </div>
        )}

        {/* File Queue */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleUploadFiles(e.dataTransfer.files);
          }}
          className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-chrome)] overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-hairline)] text-xs">
            <span className="font-medium text-[var(--text-secondary)] tabular-nums">
              Queue ({queue.length} file{queue.length === 1 ? '' : 's'})
            </span>
            {queue.length > 0 && (
              <button
                type="button"
                disabled={running}
                onClick={() => setQueue([])}
                className="text-[11px] text-[var(--text-muted)] hover:text-rose-400"
              >
                Clear Queue
              </button>
            )}
          </div>

          {queue.length === 0 ? (
            <div className="py-12 px-6 text-center text-xs text-[var(--text-muted)]">
              Drag and drop PDF files here, click &ldquo;Add Local PDFs&rdquo;, or load sample PDFs from your workspace.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-hairline)]">
              {queue.map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[var(--text-primary)] truncate">{item.name}</div>
                    <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                      {item.detail} · <span className="capitalize">{item.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-3">
                    <button
                      type="button"
                      disabled={idx === 0 || running}
                      onClick={() => moveItem(idx, -1)}
                      aria-label={`Move ${item.name} up`}
                      className="p-1 rounded hover:bg-[var(--surface-subtle)] disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === queue.length - 1 || running}
                      onClick={() => moveItem(idx, 1)}
                      aria-label={`Move ${item.name} down`}
                      className="p-1 rounded hover:bg-[var(--surface-subtle)] disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => setQueue((prev) => prev.filter((q) => q.id !== item.id))}
                      aria-label={`Remove ${item.name}`}
                      className="p-1 rounded hover:bg-[var(--surface-subtle)] hover:text-rose-400 disabled:opacity-30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Run Controls & Progress */}
        {running && (
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-color)]" />
                {progressText}
              </span>
              <span className="tabular-nums">{progressPct.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--surface-subtle)] overflow-hidden">
              <div
                className="h-full bg-[var(--accent-color)] transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {summary && (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{summary}</span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {running ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="px-4 py-2 rounded-md border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)]"
            >
              Cancel Batch
            </button>
          ) : (
            <button
              type="button"
              disabled={queue.length === 0 || (operation === 'merge' && queue.length < 2)}
              onClick={runBatch}
              className="px-5 py-2 rounded-md bg-[var(--accent-color)] text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              Run Batch Operation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
