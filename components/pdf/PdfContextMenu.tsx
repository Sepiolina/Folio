'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  BookmarkPlus,
  Check,
  CheckSquare,
  ChevronRight,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Keyboard,
  Layers,
  Maximize2,
  Pencil,
  RotateCw,
  Scissors,
  Stamp,
  StickyNote,
  TextCursorInput,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { STAMP_COLOR_PALETTE } from '@/lib/stampTemplates';
import type { PdfAnnotation, PdfLayer } from '@/types/workspace';

export interface PdfContextMenuState {
  x: number;
  y: number;
  pageNumber: number;
  normX: number;
  normY: number;
  annotationId: string | null;
  selectedText: string;
}

interface PdfContextMenuProps {
  menu: PdfContextMenuState;
  annotation: PdfAnnotation | null;
  layers: PdfLayer[];
  activeLayerId: string;
  canPaste: boolean;
  isLocked: boolean;
  onClose: () => void;
  onCopyAnnotation: (ann: PdfAnnotation) => void;
  onCutAnnotation: (ann: PdfAnnotation) => void;
  onDuplicateAnnotation: (ann: PdfAnnotation) => void;
  onPasteHere: (pageNumber: number, normX: number, normY: number) => void;
  onDeleteAnnotation: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onMoveToLayer: (id: string, layerId: string) => void;
  onToggleCheckbox: (ann: PdfAnnotation) => void;
  onEditStamp?: (ann: PdfAnnotation) => void;
  onSaveStampTemplate?: (ann: PdfAnnotation) => void;
  onChangeAnnotationColor?: (id: string, color: string) => void;
  onCopySelectedText: (text: string) => void;
  onQuickInsert: (
    tool: 'textbox' | 'checkbox' | 'text' | 'note' | 'stamp',
    pageNumber: number,
    normX: number,
    normY: number
  ) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onRotate: () => void;
  onOpenShortcuts: () => void;
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}

function MenuItem({ icon, label, shortcut, disabled, danger, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-4 px-2.5 py-1.5 rounded text-left text-xs transition-colors disabled:opacity-35 disabled:pointer-events-none ${
        danger
          ? 'text-rose-400 hover:bg-rose-500/10'
          : 'text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="shrink-0 text-[var(--text-secondary)]">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      {shortcut && (
        <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">{shortcut}</span>
      )}
    </button>
  );
}

export function PdfContextMenu({
  menu,
  annotation,
  layers,
  activeLayerId,
  canPaste,
  isLocked,
  onClose,
  onCopyAnnotation,
  onCutAnnotation,
  onDuplicateAnnotation,
  onPasteHere,
  onDeleteAnnotation,
  onBringToFront,
  onSendToBack,
  onMoveToLayer,
  onToggleCheckbox,
  onEditStamp,
  onSaveStampTemplate,
  onChangeAnnotationColor,
  onCopySelectedText,
  onQuickInsert,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onRotate,
  onOpenShortcuts,
}: PdfContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [layerSubmenuOpen, setLayerSubmenuOpen] = useState(false);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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
  }, [onClose]);

  const currentLayerId = annotation?.layerId || activeLayerId;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="PDF editor context menu"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 w-60 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] shadow-2xl p-1.5 select-none"
    >
      {annotation ? (
        <>
          <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] truncate">
            {annotation.type === 'textbox'
              ? 'Text Box Component'
              : annotation.type === 'checkbox'
                ? 'Checkbox Component'
                : `${annotation.type} · Page ${annotation.pageNumber}`}
          </div>

          {annotation.type === 'checkbox' && (
            <MenuItem
              icon={<Check className="w-3.5 h-3.5" />}
              label={annotation.checked ? 'Uncheck Checkbox' : 'Check Checkbox'}
              shortcut="Space"
              disabled={isLocked}
              onClick={() => {
                onToggleCheckbox(annotation);
                onClose();
              }}
            />
          )}

          {annotation.type === 'stamp' && (
            <>
              <MenuItem
                icon={<Pencil className="w-3.5 h-3.5" />}
                label="Edit Stamp Text"
                disabled={isLocked}
                onClick={() => {
                  onEditStamp?.(annotation);
                  onClose();
                }}
              />
              <MenuItem
                icon={<BookmarkPlus className="w-3.5 h-3.5" />}
                label="Save as Template"
                onClick={() => {
                  onSaveStampTemplate?.(annotation);
                  onClose();
                }}
              />
              <div className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--text-secondary)]">Color</span>
                <div className="flex items-center gap-1">
                  {STAMP_COLOR_PALETTE.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      disabled={isLocked}
                      aria-label={`Change stamp color to ${hex}`}
                      onClick={() => {
                        onChangeAnnotationColor?.(annotation.id, hex);
                        onClose();
                      }}
                      className={`w-3.5 h-3.5 rounded-sm border transition-transform disabled:opacity-40 ${
                        annotation.color.toLowerCase() === hex.toLowerCase()
                          ? 'ring-2 ring-[var(--accent-color)] ring-offset-1 ring-offset-[var(--surface-elevated)] scale-110'
                          : 'border-white/25 hover:scale-110'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>
              <div className="my-1 border-t border-[var(--border-hairline)]" />
            </>
          )}

          <MenuItem
            icon={<Copy className="w-3.5 h-3.5" />}
            label="Copy"
            shortcut="Ctrl+C"
            onClick={() => {
              onCopyAnnotation(annotation);
              onClose();
            }}
          />
          <MenuItem
            icon={<Scissors className="w-3.5 h-3.5" />}
            label="Cut"
            shortcut="Ctrl+X"
            disabled={isLocked}
            onClick={() => {
              onCutAnnotation(annotation);
              onClose();
            }}
          />
          <MenuItem
            icon={<CopyPlus className="w-3.5 h-3.5" />}
            label="Duplicate"
            shortcut="Ctrl+D"
            disabled={isLocked}
            onClick={() => {
              onDuplicateAnnotation(annotation);
              onClose();
            }}
          />
          {canPaste && (
            <MenuItem
              icon={<ClipboardPaste className="w-3.5 h-3.5" />}
              label="Paste Here"
              shortcut="Ctrl+V"
              onClick={() => {
                onPasteHere(menu.pageNumber, menu.normX, menu.normY);
                onClose();
              }}
            />
          )}

          <div className="my-1 border-t border-[var(--border-hairline)]" />

          <MenuItem
            icon={<ArrowUpToLine className="w-3.5 h-3.5" />}
            label="Bring to Front"
            shortcut="]"
            disabled={isLocked}
            onClick={() => {
              onBringToFront(annotation.id);
              onClose();
            }}
          />
          <MenuItem
            icon={<ArrowDownToLine className="w-3.5 h-3.5" />}
            label="Send to Back"
            shortcut="["
            disabled={isLocked}
            onClick={() => {
              onSendToBack(annotation.id);
              onClose();
            }}
          />

          <div className="relative">
            <button
              type="button"
              role="menuitem"
              aria-expanded={layerSubmenuOpen}
              onClick={() => setLayerSubmenuOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-left text-xs text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
            >
              <span className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                <span>Move to Layer</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </button>

            {layerSubmenuOpen && (
              <div className="mt-0.5 ml-2 pl-2 border-l border-[var(--border-hairline)] space-y-0.5">
                {layers.map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    disabled={layer.locked}
                    onClick={() => {
                      onMoveToLayer(annotation.id, layer.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-2 py-1 rounded text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] disabled:opacity-40"
                  >
                    <span className="truncate">{layer.name}</span>
                    {layer.id === currentLayerId && (
                      <Check className="w-3 h-3 text-[var(--accent-color)] shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="my-1 border-t border-[var(--border-hairline)]" />

          <MenuItem
            icon={<Trash2 className="w-3.5 h-3.5" />}
            label="Delete"
            shortcut="Del"
            disabled={isLocked}
            danger
            onClick={() => {
              onDeleteAnnotation(annotation.id);
              onClose();
            }}
          />
        </>
      ) : (
        <>
          {menu.selectedText && (
            <>
              <MenuItem
                icon={<ClipboardCopy className="w-3.5 h-3.5" />}
                label="Copy Selected Text"
                shortcut="Ctrl+C"
                onClick={() => {
                  onCopySelectedText(menu.selectedText);
                  onClose();
                }}
              />
              <div className="my-1 border-t border-[var(--border-hairline)]" />
            </>
          )}

          <MenuItem
            icon={<ClipboardPaste className="w-3.5 h-3.5" />}
            label="Paste Here"
            shortcut="Ctrl+V"
            disabled={!canPaste}
            onClick={() => {
              onPasteHere(menu.pageNumber, menu.normX, menu.normY);
              onClose();
            }}
          />

          <div className="my-1 border-t border-[var(--border-hairline)]" />

          <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Insert on Page {menu.pageNumber}
          </div>

          <MenuItem
            icon={<TextCursorInput className="w-3.5 h-3.5" />}
            label="Add Text Box Here"
            shortcut="B"
            onClick={() => {
              onQuickInsert('textbox', menu.pageNumber, menu.normX, menu.normY);
              onClose();
            }}
          />
          <MenuItem
            icon={<CheckSquare className="w-3.5 h-3.5" />}
            label="Add Checkbox Here"
            shortcut="C"
            onClick={() => {
              onQuickInsert('checkbox', menu.pageNumber, menu.normX, menu.normY);
              onClose();
            }}
          />
          <MenuItem
            icon={<Type className="w-3.5 h-3.5" />}
            label="Add Text Here"
            shortcut="T"
            onClick={() => {
              onQuickInsert('text', menu.pageNumber, menu.normX, menu.normY);
              onClose();
            }}
          />
          <MenuItem
            icon={<StickyNote className="w-3.5 h-3.5" />}
            label="Add Sticky Note Here"
            shortcut="N"
            onClick={() => {
              onQuickInsert('note', menu.pageNumber, menu.normX, menu.normY);
              onClose();
            }}
          />
          <MenuItem
            icon={<Stamp className="w-3.5 h-3.5" />}
            label="Add Stamp Here"
            shortcut="O"
            onClick={() => {
              onQuickInsert('stamp', menu.pageNumber, menu.normX, menu.normY);
              onClose();
            }}
          />

          <div className="my-1 border-t border-[var(--border-hairline)]" />

          <MenuItem
            icon={<ZoomIn className="w-3.5 h-3.5" />}
            label="Zoom In"
            shortcut="Ctrl++"
            onClick={() => {
              onZoomIn();
              onClose();
            }}
          />
          <MenuItem
            icon={<ZoomOut className="w-3.5 h-3.5" />}
            label="Zoom Out"
            shortcut="Ctrl+-"
            onClick={() => {
              onZoomOut();
              onClose();
            }}
          />
          <MenuItem
            icon={<Maximize2 className="w-3.5 h-3.5" />}
            label="Fit Width"
            onClick={() => {
              onFitWidth();
              onClose();
            }}
          />
          <MenuItem
            icon={<RotateCw className="w-3.5 h-3.5" />}
            label="Rotate 90°"
            shortcut="R"
            onClick={() => {
              onRotate();
              onClose();
            }}
          />

          <div className="my-1 border-t border-[var(--border-hairline)]" />

          <MenuItem
            icon={<Keyboard className="w-3.5 h-3.5" />}
            label="Keyboard Shortcuts…"
            shortcut="?"
            onClick={() => {
              onClose();
              onOpenShortcuts();
            }}
          />
        </>
      )}
    </div>
  );
}
