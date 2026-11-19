'use client';

import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Crop,
  FilePlus,
  Merge,
  RotateCw,
  Scissors,
  Trash2,
  X,
} from 'lucide-react';
import { loadPdfDocument } from '@/lib/pdfJsLoader';
import {
  applyPageOrganization,
  cropPdfPages,
  extractPdfPages,
  mergePdfBytes,
} from '@/lib/pdfOperations';
import { triggerBlobDownload } from '@/lib/storage';
import { useWorkspaceStore } from '@/stores/workspaceStore';

interface PageSlot {
  uid: string;
  sourceIndex: number | null; // null = new blank page
  label: string;
  rotationDelta: number;
  thumbUrl?: string;
  selected: boolean;
}

interface PdfPageOrganizerModalProps {
  open: boolean;
  onClose: () => void;
  pdfBytes: Uint8Array;
  documentName: string;
  onApplyPdfBytes: (nextBytes: Uint8Array, notice: string) => Promise<void>;
}

export function PdfPageOrganizerModal({
  open,
  onClose,
  pdfBytes,
  documentName,
  onApplyPdfBytes,
}: PdfPageOrganizerModalProps) {
  const { addDownload } = useWorkspaceStore();
  const [slots, setSlots] = useState<PageSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cropMargin, setCropMargin] = useState(18);
  const [showCrop, setShowCrop] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true);
      try {
        const doc = await loadPdfDocument(pdfBytes);
        const list: PageSlot[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: 0.24 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(vp.width));
          canvas.height = Math.max(1, Math.round(vp.height));
          const ctx = canvas.getContext('2d');
          let thumbUrl: string | undefined;
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
            thumbUrl = canvas.toDataURL('image/jpeg', 0.78);
          }
          canvas.width = 0;
          canvas.height = 0;
          page.cleanup();
          list.push({
            uid: `slot-${i}-${list.length}`,
            sourceIndex: i - 1,
            label: `Page ${i}`,
            rotationDelta: 0,
            thumbUrl,
            selected: false,
          });
        }
        await doc.cleanup();
        if (active) setSlots(list);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, pdfBytes]);

  if (!open) return null;

  const selectedSlots = slots.filter((s) => s.selected);

  const toggleSelect = (uid: string) => {
    setSlots((prev) => prev.map((s) => (s.uid === uid ? { ...s, selected: !s.selected } : s)));
  };

  const moveSlot = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= slots.length) return;
    setSlots((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const rotateSlot = (uid: string, deg: number) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.uid === uid ? { ...s, rotationDelta: (s.rotationDelta + deg + 360) % 360 } : s
      )
    );
  };

  const duplicateSlot = (index: number) => {
    setSlots((prev) => {
      const copy = [...prev];
      const src = copy[index];
      copy.splice(index + 1, 0, {
        ...src,
        uid: `dup-${Date.now()}-${Math.random()}`,
        label: `${src.label} (Copy)`,
        selected: false,
      });
      return copy;
    });
  };

  const deleteSlot = (uid: string) => {
    if (slots.length <= 1) return;
    setSlots((prev) => prev.filter((s) => s.uid !== uid));
  };

  const addBlankPage = () => {
    setSlots((prev) => [
      ...prev,
      {
        uid: `blank-${Date.now()}`,
        sourceIndex: null,
        label: 'Blank Page',
        rotationDelta: 0,
        selected: false,
      },
    ]);
  };

  const handleApplyChanges = async () => {
    setBusy(true);
    try {
      const plan = slots.map((s) =>
        s.sourceIndex === null
          ? { blank: true as const, width: 612, height: 792 }
          : { sourceIndex: s.sourceIndex, rotationDelta: s.rotationDelta }
      );
      const nextBytes = await applyPageOrganization(pdfBytes, plan);
      await onApplyPdfBytes(nextBytes, `Updated page layout (${nextBytes.byteLength} bytes).`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleExtractSelected = async () => {
    const pagesToExtract = selectedSlots
      .map((s) => (s.sourceIndex !== null ? s.sourceIndex + 1 : null))
      .filter((n): n is number => n !== null);
    if (pagesToExtract.length === 0) return;

    setBusy(true);
    try {
      const extracted = await extractPdfPages(pdfBytes, pagesToExtract);
      const stem = documentName.replace(/\.pdf$/i, '');
      const outName = `${stem}_extracted.pdf`;
      const copy = new Uint8Array(extracted.byteLength);
      copy.set(extracted);
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
    } finally {
      setBusy(false);
    }
  };

  const handleMergeOtherPdf = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      try {
        const extraBytes = new Uint8Array(await file.arrayBuffer());
        const merged = await mergePdfBytes([pdfBytes, extraBytes]);
        await onApplyPdfBytes(merged, `Merged "${file.name}" into document.`);
        onClose();
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  const handleApplyCrop = async () => {
    setBusy(true);
    try {
      const targetPages =
        selectedSlots.length > 0
          ? selectedSlots
              .map((s) => (s.sourceIndex !== null ? s.sourceIndex + 1 : null))
              .filter((n): n is number => n !== null)
          : undefined;
      const cropped = await cropPdfPages(
        pdfBytes,
        { top: cropMargin, right: cropMargin, bottom: cropMargin, left: cropMargin },
        targetPages
      );
      await onApplyPdfBytes(cropped, `Cropped margins by ${cropMargin}pt.`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="page-organizer-title"
    >
      <div className="w-full max-w-4xl h-[82vh] flex flex-col rounded-xl border border-[var(--border-strong)] bg-[var(--surface-chrome)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-hairline)]">
          <div>
            <h2 id="page-organizer-title" className="text-sm font-semibold text-[var(--text-primary)]">
              Organize Pages — {documentName}
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              Reorder, rotate, duplicate, delete, insert blank pages, crop, extract, or merge PDFs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close page organizer"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-xs">
          <button
            type="button"
            onClick={addBlankPage}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[var(--border-hairline)] bg-[var(--surface-chrome)] hover:border-[var(--border-strong)]"
          >
            <FilePlus className="w-3.5 h-3.5" />
            <span>Add Blank Page</span>
          </button>

          <button
            type="button"
            onClick={handleMergeOtherPdf}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[var(--border-hairline)] bg-[var(--surface-chrome)] hover:border-[var(--border-strong)]"
          >
            <Merge className="w-3.5 h-3.5" />
            <span>Append / Merge PDF…</span>
          </button>

          <button
            type="button"
            disabled={selectedSlots.length === 0 || busy}
            onClick={handleExtractSelected}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[var(--border-hairline)] bg-[var(--surface-chrome)] disabled:opacity-40"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Extract Selected ({selectedSlots.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCrop((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[var(--border-hairline)] bg-[var(--surface-chrome)]"
          >
            <Crop className="w-3.5 h-3.5" />
            <span>Crop Margins</span>
          </button>
        </div>

        {showCrop && (
          <div className="flex items-center gap-3 px-5 py-2 border-b border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs">
            <span className="text-[var(--text-secondary)]">Trim all 4 margins (pt):</span>
            <input
              type="number"
              min={4}
              max={150}
              value={cropMargin}
              onChange={(e) => setCropMargin(Number(e.target.value))}
              className="w-20 h-7 px-2 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] tabular-nums"
            />
            <button
              type="button"
              disabled={busy}
              onClick={handleApplyCrop}
              className="px-3 py-1 rounded bg-[var(--accent-color)] text-white font-medium"
            >
              Apply Crop
            </button>
          </div>
        )}

        {/* Thumbnails Grid */}
        <div className="flex-1 overflow-y-auto p-5 bg-[var(--surface-pdf-desk)]">
          {loading ? (
            <div className="h-full flex items-center justify-center text-xs text-[var(--text-muted)]">
              Generating page previews…
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {slots.map((slot, index) => (
                <div
                  key={slot.uid}
                  className={`flex flex-col rounded-lg border p-2 bg-[var(--surface-chrome)] transition-colors ${
                    slot.selected
                      ? 'border-[var(--accent-color)] ring-1 ring-[var(--accent-color)]'
                      : 'border-[var(--border-hairline)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSelect(slot.uid)}
                    className="relative aspect-[3/4] w-full bg-white rounded overflow-hidden flex items-center justify-center mb-2 border border-black/10"
                  >
                    {slot.thumbUrl ? (
                      <img
                        src={slot.thumbUrl}
                        alt={slot.label}
                        style={{ transform: `rotate(${slot.rotationDelta}deg)` }}
                        className="max-h-full max-w-full object-contain transition-transform"
                      />
                    ) : (
                      <span className="text-[11px] text-neutral-400">Blank Page</span>
                    )}
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-white tabular-nums">
                      {index + 1}
                    </span>
                  </button>

                  <div className="text-[11px] font-medium truncate text-[var(--text-primary)] mb-1.5 text-center">
                    {slot.label}
                  </div>

                  <div className="flex items-center justify-between gap-0.5 text-[var(--text-secondary)]">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveSlot(index, -1)}
                      aria-label={`Move ${slot.label} left`}
                      className="p-1 rounded hover:bg-[var(--surface-subtle)] disabled:opacity-30"
                    >
                      <ArrowLeft className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={index === slots.length - 1}
                      onClick={() => moveSlot(index, 1)}
                      aria-label={`Move ${slot.label} right`}
                      className="p-1 rounded hover:bg-[var(--surface-subtle)] disabled:opacity-30"
                    >
                      <ArrowRight className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => rotateSlot(slot.uid, 90)}
                      aria-label={`Rotate ${slot.label} 90 degrees`}
                      className="p-1 rounded hover:bg-[var(--surface-subtle)]"
                    >
                      <RotateCw className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateSlot(index)}
                      aria-label={`Duplicate ${slot.label}`}
                      className="p-1 rounded hover:bg-[var(--surface-subtle)]"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={slots.length <= 1}
                      onClick={() => deleteSlot(slot.uid)}
                      aria-label={`Delete ${slot.label}`}
                      className="p-1 rounded hover:bg-[var(--surface-subtle)] hover:text-rose-400 disabled:opacity-30"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-hairline)] bg-[var(--surface-chrome)] text-xs">
          <span className="text-[var(--text-muted)] tabular-nums">{slots.length} pages total</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-md border border-[var(--border-hairline)] font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || loading}
              onClick={handleApplyChanges}
              className="px-4 py-1.5 rounded-md bg-[var(--accent-color)] text-white font-medium disabled:opacity-40"
            >
              {busy ? 'Applying…' : 'Apply Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
