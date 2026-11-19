'use client';

import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  addWatermarkAndHeaders,
  optimizePdfBytes,
  updatePdfMetadata,
  type PdfMetadataInfo,
} from '@/lib/pdfOperations';
import { formatBytes } from '@/lib/pageRange';

interface PdfWatermarkAndMetaModalProps {
  open: boolean;
  onClose: () => void;
  pdfBytes: Uint8Array;
  metadataInfo: PdfMetadataInfo | null;
  onApplyPdfBytes: (nextBytes: Uint8Array, notice: string) => Promise<void>;
}

export function PdfWatermarkAndMetaModal({
  open,
  onClose,
  pdfBytes,
  metadataInfo,
  onApplyPdfBytes,
}: PdfWatermarkAndMetaModalProps) {
  const [tab, setTab] = useState<'watermark' | 'metadata' | 'optimize'>('watermark');

  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.2);
  const [headerText, setHeaderText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [includePageNumbers, setIncludePageNumbers] = useState(true);

  const [title, setTitle] = useState(metadataInfo?.title || '');
  const [author, setAuthor] = useState(metadataInfo?.author || '');
  const [subject, setSubject] = useState(metadataInfo?.subject || '');
  const [keywords, setKeywords] = useState(metadataInfo?.keywords || '');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleApplyWatermark = async () => {
    setBusy(true);
    try {
      const next = await addWatermarkAndHeaders(pdfBytes, {
        watermarkText,
        watermarkOpacity,
        headerText,
        footerText,
        includePageNumbers,
      });
      await onApplyPdfBytes(next, 'Applied watermark / headers & footers.');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleSaveMetadata = async () => {
    setBusy(true);
    try {
      const next = await updatePdfMetadata(pdfBytes, { title, author, subject, keywords });
      await onApplyPdfBytes(next, 'Updated PDF document metadata.');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleOptimize = async () => {
    setBusy(true);
    try {
      const before = pdfBytes.byteLength;
      const next = await optimizePdfBytes(pdfBytes);
      const after = next.byteLength;
      await onApplyPdfBytes(
        next,
        `Optimized PDF structure (${formatBytes(before)} → ${formatBytes(after)}).`
      );
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-tools-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--border-strong)] bg-[var(--surface-chrome)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-hairline)]">
          <h2 id="pdf-tools-modal-title" className="text-sm font-semibold text-[var(--text-primary)]">
            Document Properties & Stamps
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close document tools"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-5 pt-2 border-b border-[var(--border-hairline)] text-xs">
          {[
            { id: 'watermark' as const, label: 'Watermark & Headers' },
            { id: 'metadata' as const, label: 'Metadata' },
            { id: 'optimize' as const, label: 'Optimize' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 border-b-2 font-medium transition-colors ${
                tab === t.id
                  ? 'border-[var(--accent-color)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-3 text-xs">
          {tab === 'watermark' && (
            <>
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Watermark Text</label>
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder="Optional diagonal watermark"
                  className="w-full h-8 px-2.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[var(--text-secondary)]">Watermark Opacity</span>
                  <span className="tabular-nums">{Math.round(watermarkOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.6}
                  step={0.05}
                  value={watermarkOpacity}
                  onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                  className="w-full accent-[var(--accent-color)]"
                />
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Header Text</label>
                <input
                  type="text"
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  placeholder="Top-left running header"
                  className="w-full h-8 px-2.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Footer Text</label>
                <input
                  type="text"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  placeholder="Bottom running footer"
                  className="w-full h-8 px-2.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)]"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={includePageNumbers}
                  onChange={(e) => setIncludePageNumbers(e.target.checked)}
                  className="accent-[var(--accent-color)]"
                />
                <span>Include page numbers (&ldquo;Page X of Y&rdquo;)</span>
              </label>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleApplyWatermark}
                  className="px-4 py-1.5 rounded-md bg-[var(--accent-color)] text-white font-medium disabled:opacity-40"
                >
                  {busy ? 'Applying…' : 'Apply to PDF'}
                </button>
              </div>
            </>
          )}

          {tab === 'metadata' && (
            <>
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Document Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-8 px-2.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Author</label>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="w-full h-8 px-2.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full h-8 px-2.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Keywords (comma-separated)</label>
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  className="w-full h-8 px-2.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)]"
                />
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSaveMetadata}
                  className="px-4 py-1.5 rounded-md bg-[var(--accent-color)] text-white font-medium disabled:opacity-40"
                >
                  {busy ? 'Saving…' : 'Save Metadata'}
                </button>
              </div>
            </>
          )}

          {tab === 'optimize' && (
            <div className="space-y-3">
              <p className="text-[var(--text-secondary)] leading-relaxed">
                Re-packs PDF streams using compressed object streams (`useObjectStreams: true`) and
                removes unreferenced dead objects. Current size:{' '}
                <strong className="text-[var(--text-primary)] tabular-nums">
                  {formatBytes(pdfBytes.byteLength)}
                </strong>
                .
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleOptimize}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-[var(--accent-color)] text-white font-medium disabled:opacity-40"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{busy ? 'Optimizing…' : 'Optimize PDF'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
