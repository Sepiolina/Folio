'use client';

import React from 'react';
import { Keyboard, X } from 'lucide-react';
import { PDF_SHORTCUT_GROUPS } from '@/lib/pdfEditorInteractions';

interface PdfShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function PdfShortcutsModal({ open, onClose }: PdfShortcutsModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PDF editor keyboard shortcuts"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[82vh] flex flex-col rounded-xl border border-[var(--border-strong)] bg-[var(--surface-chrome)] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-hairline)]">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-[var(--accent-color)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              PDF Editor Keyboard Shortcuts &amp; Interactions
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {PDF_SHORTCUT_GROUPS.map((group) => (
            <div
              key={group.title}
              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] p-3 space-y-2"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {group.title}
              </div>
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3">
                    <span className="text-[var(--text-secondary)]">{item.label}</span>
                    <kbd className="px-1.5 py-0.5 rounded border border-[var(--border-strong)] bg-[var(--surface-chrome)] font-mono text-[10px] text-[var(--text-primary)] whitespace-nowrap shrink-0">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
