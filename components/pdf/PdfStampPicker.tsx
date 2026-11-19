'use client';

import React, { useEffect, useRef } from 'react';
import {
  BookmarkPlus,
  Calendar,
  Check,
  ChevronDown,
  Palette,
  RotateCcw,
  Stamp,
  Trash2,
  X,
} from 'lucide-react';
import type { SavedStampTemplate, StampStyle } from '@/types/workspace';
import {
  resolveStampColors,
  resolveStampTemplateSubtext,
  STAMP_COLOR_PALETTE,
} from '@/lib/stampTemplates';

interface PdfStampPickerProps {
  open: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  activeLabel: string;
  activeSubtext: string;
  activeColor: string;
  activeStyle: StampStyle;
  savedStamps: SavedStampTemplate[];
  hasSelectedStamp: boolean;
  onChangeLabel: (label: string) => void;
  onChangeSubtext: (subtext: string) => void;
  onChangeColor: (color: string) => void;
  onChangeStyle: (style: StampStyle) => void;
  onSaveTemplate: () => void;
  onRemoveTemplate: (id: string) => void;
  onResetTemplates: () => void;
  onSelectTemplate: (tpl: SavedStampTemplate) => void;
  onPlaceOnCurrentPage: () => void;
  onApplyToSelectedStamp: () => void;
}

const STYLE_OPTIONS: Array<{ id: StampStyle; label: string }> = [
  { id: 'outline', label: 'Outline' },
  { id: 'solid', label: 'Solid' },
  { id: 'badge', label: 'Tinted' },
];

export function PdfStampPicker({
  open,
  onToggleOpen,
  onClose,
  activeLabel,
  activeSubtext,
  activeColor,
  activeStyle,
  savedStamps,
  hasSelectedStamp,
  onChangeLabel,
  onChangeSubtext,
  onChangeColor,
  onChangeStyle,
  onSaveTemplate,
  onRemoveTemplate,
  onResetTemplates,
  onSelectTemplate,
  onPlaceOnCurrentPage,
  onApplyToSelectedStamp,
}: PdfStampPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const effectiveColor = activeColor === '#facc15' ? '#2563eb' : activeColor;
  const previewColors = resolveStampColors(effectiveColor, activeStyle);
  const resolvedSubtextPreview = resolveStampTemplateSubtext(activeSubtext);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-label="Stamp templates and editor"
        title="Customize stamp text, color, style & saved templates"
        className="h-6 px-2 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] hover:border-[var(--border-strong)] flex items-center gap-1.5 text-[11px] text-[var(--text-primary)] transition-colors"
      >
        <span
          className="w-2.5 h-2.5 rounded-sm shrink-0 border"
          style={{
            backgroundColor: previewColors.backgroundColor,
            borderColor: previewColors.borderColor,
          }}
        />
        <span className="max-w-[96px] truncate font-semibold tracking-wide">
          {activeLabel.trim() || 'STAMP'}
        </span>
        <ChevronDown className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Stamp designer and saved templates"
          className="absolute right-0 top-8 z-50 w-80 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] shadow-2xl p-3 space-y-3 text-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[var(--text-primary)]">
              Stamp Designer &amp; Templates
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close stamp designer"
              className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Live Preview */}
          <div className="flex items-center justify-center py-2.5 px-3 rounded-md bg-[var(--surface-canvas)] border border-[var(--border-hairline)]">
            <div
              style={{
                borderColor: previewColors.borderColor,
                backgroundColor: previewColors.backgroundColor,
                color: previewColors.textColor,
              }}
              className="border-2 rounded px-3 py-1 flex flex-col items-center justify-center text-center min-w-[120px] max-w-full"
            >
              <span className="font-bold tracking-wider text-xs leading-tight break-words">
                {activeLabel.trim() || 'STAMP'}
              </span>
              {resolvedSubtextPreview && (
                <span className="text-[9px] font-medium opacity-90 leading-tight mt-0.5">
                  {resolvedSubtextPreview}
                </span>
              )}
            </div>
          </div>

          {/* Editable Text & Subtext */}
          <div className="space-y-1.5">
            <label className="block">
              <span className="text-[10px] font-medium text-[var(--text-muted)]">Stamp Text</span>
              <input
                type="text"
                aria-label="Stamp template text"
                value={activeLabel}
                maxLength={48}
                onChange={(e) => onChangeLabel(e.target.value)}
                placeholder="e.g. APPROVED, PAID, QA PASS"
                className="mt-0.5 w-full h-7 px-2 rounded bg-[var(--surface-chrome)] border border-[var(--border-hairline)] text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
              />
            </label>

            <div className="flex items-end gap-1.5">
              <label className="flex-1 min-w-0">
                <span className="text-[10px] font-medium text-[var(--text-muted)]">
                  Subtext (supports {'{date}'})
                </span>
                <input
                  type="text"
                  aria-label="Stamp template subtext"
                  value={activeSubtext}
                  maxLength={64}
                  onChange={(e) => onChangeSubtext(e.target.value)}
                  placeholder="Optional e.g. {date} or By Alex"
                  className="mt-0.5 w-full h-7 px-2 rounded bg-[var(--surface-chrome)] border border-[var(--border-hairline)] text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  onChangeSubtext(
                    activeSubtext.includes('{date}')
                      ? activeSubtext
                      : activeSubtext.trim()
                        ? `${activeSubtext.trim()} {date}`
                        : '{date}'
                  )
                }
                title="Insert dynamic today's date token"
                className="h-7 px-2 rounded border border-[var(--border-hairline)] bg-[var(--surface-chrome)] text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] flex items-center gap-1 shrink-0"
              >
                <Calendar className="w-3 h-3" />
                <span>Date</span>
              </button>
            </div>
          </div>

          {/* Style + Color Swatches */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium text-[var(--text-muted)]">Style</span>
              <div className="flex items-center rounded border border-[var(--border-hairline)] bg-[var(--surface-chrome)] p-0.5">
                {STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeStyle(opt.id)}
                    className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                      activeStyle === opt.id
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-color)] font-medium'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium text-[var(--text-muted)]">Color</span>
              <div className="flex items-center gap-1.5">
                {STAMP_COLOR_PALETTE.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => onChangeColor(hex)}
                    aria-label={`Stamp color ${hex}`}
                    className={`w-4 h-4 rounded border transition-transform ${
                      effectiveColor.toLowerCase() === hex.toLowerCase()
                        ? 'ring-2 ring-[var(--accent-color)] ring-offset-1 ring-offset-[var(--surface-elevated)] scale-105'
                        : 'border-white/25 hover:scale-105'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
                <label
                  title="Pick custom stamp color"
                  className="relative w-5 h-4 rounded border border-[var(--border-strong)] cursor-pointer flex items-center justify-center bg-[var(--surface-chrome)] hover:bg-[var(--surface-subtle)]"
                >
                  <Palette className="w-3 h-3 text-[var(--text-secondary)] pointer-events-none" />
                  <input
                    type="color"
                    aria-label="Custom stamp color"
                    value={effectiveColor.startsWith('#') ? effectiveColor : '#2563eb'}
                    onChange={(e) => onChangeColor(e.target.value)}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Primary Stamp Actions */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={onSaveTemplate}
              className="flex-1 h-7 px-2.5 rounded bg-[var(--surface-chrome)] border border-[var(--border-strong)] hover:bg-[var(--surface-subtle)] text-[11px] font-medium text-[var(--text-primary)] flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-[var(--accent-color)]" />
              <span>Save Template</span>
            </button>
            {hasSelectedStamp ? (
              <button
                type="button"
                onClick={onApplyToSelectedStamp}
                className="flex-1 h-7 px-2.5 rounded bg-[var(--accent-color)] hover:opacity-90 text-[11px] font-medium text-white flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply Selected</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onPlaceOnCurrentPage}
                className="flex-1 h-7 px-2.5 rounded bg-[var(--accent-color)] hover:opacity-90 text-[11px] font-medium text-white flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Stamp className="w-3.5 h-3.5" />
                <span>Place Stamp</span>
              </button>
            )}
          </div>

          {/* Saved Templates List */}
          <div className="border-t border-[var(--border-hairline)] pt-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Saved Templates ({savedStamps.length})
              </span>
              <button
                type="button"
                onClick={onResetTemplates}
                title="Restore default stamp templates"
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Defaults</span>
              </button>
            </div>

            {savedStamps.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)] py-2 text-center">
                No saved stamp templates yet.
              </p>
            ) : (
              <div className="max-h-44 overflow-y-auto space-y-1 pr-0.5">
                {savedStamps.map((tpl) => {
                  const colors = resolveStampColors(tpl.color, tpl.style);
                  const sub = resolveStampTemplateSubtext(tpl.subtext);
                  return (
                    <div
                      key={tpl.id}
                      className="group flex items-center justify-between gap-2 p-1.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-chrome)] hover:border-[var(--border-strong)]"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectTemplate(tpl)}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left"
                      >
                        <span
                          style={{
                            borderColor: colors.borderColor,
                            backgroundColor: colors.backgroundColor,
                            color: colors.textColor,
                          }}
                          className="border rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider truncate max-w-[140px]"
                        >
                          {tpl.label}
                        </span>
                        {sub && (
                          <span className="text-[10px] text-[var(--text-muted)] truncate">
                            {sub}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveTemplate(tpl.id)}
                        aria-label={`Delete stamp template ${tpl.label}`}
                        title="Remove template"
                        className="p-1 rounded text-[var(--text-muted)] hover:text-rose-400 hover:bg-[var(--surface-subtle)] shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
