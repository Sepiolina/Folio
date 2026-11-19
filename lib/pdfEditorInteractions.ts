import { createUniqueId, currentTimestamp } from './annotationUtils';
import { buildStampAnnotation } from './stampTemplates';
import type { PdfAnnotation, PdfTool, StampStyle } from '@/types/workspace';

export interface ClonePasteOptions {
  pageNumber: number;
  targetLayerId: string;
  offset?: number;
  placeAtNorm?: { x: number; y: number };
}

function clamp01(val: number, min = 0, max = 1): number {
  const clamped = Math.max(min, Math.min(max, val));
  return Math.round(clamped * 100000) / 100000;
}

export function cloneAnnotationForPaste(
  source: PdfAnnotation,
  options: ClonePasteOptions
): PdfAnnotation {
  const id = createUniqueId('ann');
  const offset = options.offset ?? 0.025;
  const maxX = source.type === 'line' || source.type === 'arrow' ? 0.96 : Math.max(0.02, 0.98 - Math.abs(source.width));
  const maxY = source.type === 'line' || source.type === 'arrow' ? 0.96 : Math.max(0.02, 0.98 - Math.abs(source.height));

  let nextX = clamp01(source.x + offset, 0, maxX);
  let nextY = clamp01(source.y + offset, 0, maxY);

  // If already near bottom-right corner and offsetting without explicit target, wrap slightly back
  if (!options.placeAtNorm && nextX === source.x && nextY === source.y) {
    nextX = clamp01(source.x - offset, 0, maxX);
    nextY = clamp01(source.y - offset, 0, maxY);
  }

  if (options.placeAtNorm) {
    if (source.type === 'line' || source.type === 'arrow') {
      nextX = clamp01(options.placeAtNorm.x, 0, 0.96);
      nextY = clamp01(options.placeAtNorm.y, 0, 0.96);
    } else {
      nextX = clamp01(options.placeAtNorm.x - Math.abs(source.width) / 2, 0, maxX);
      nextY = clamp01(options.placeAtNorm.y - Math.abs(source.height) / 2, 0, maxY);
    }
  }

  let nextPoints = source.points ? source.points.map((p) => ({ ...p })) : undefined;
  if (nextPoints && nextPoints.length > 0) {
    const minPx = nextPoints.reduce((m, p) => Math.min(m, p.x), 1);
    const minPy = nextPoints.reduce((m, p) => Math.min(m, p.y), 1);
    const maxPx = nextPoints.reduce((m, p) => Math.max(m, p.x), 0);
    const maxPy = nextPoints.reduce((m, p) => Math.max(m, p.y), 0);
    const spanW = maxPx - minPx;
    const spanH = maxPy - minPy;
    const targetOriginX = options.placeAtNorm
      ? clamp01(options.placeAtNorm.x - spanW / 2, 0, Math.max(0, 0.98 - spanW))
      : clamp01(minPx + offset, 0, Math.max(0, 0.98 - spanW));
    const targetOriginY = options.placeAtNorm
      ? clamp01(options.placeAtNorm.y - spanH / 2, 0, Math.max(0, 0.98 - spanH))
      : clamp01(minPy + offset, 0, Math.max(0, 0.98 - spanH));
    const dx = targetOriginX - minPx;
    const dy = targetOriginY - minPy;
    nextPoints = nextPoints.map((p) => ({
      x: clamp01(p.x + dx, 0, 1),
      y: clamp01(p.y + dy, 0, 1),
    }));
  }

  const nextFieldName =
    source.type === 'textbox' || source.type === 'checkbox'
      ? `${source.type}_p${options.pageNumber}_${id.slice(-4)}`
      : source.fieldName;

  return {
    ...source,
    id,
    pageNumber: options.pageNumber,
    layerId: options.targetLayerId,
    x: nextX,
    y: nextY,
    points: nextPoints,
    fieldName: nextFieldName,
    createdAt: currentTimestamp(),
  };
}

export function nudgeAnnotationPosition(
  ann: PdfAnnotation,
  dx: number,
  dy: number
): Partial<PdfAnnotation> {
  if (ann.type === 'freehand' && ann.points && ann.points.length > 0) {
    const minPx = ann.points.reduce((m, p) => Math.min(m, p.x), 1);
    const maxPx = ann.points.reduce((m, p) => Math.max(m, p.x), 0);
    const minPy = ann.points.reduce((m, p) => Math.min(m, p.y), 1);
    const maxPy = ann.points.reduce((m, p) => Math.max(m, p.y), 0);
    const clampedDx = Math.max(-minPx, Math.min(1 - maxPx, dx));
    const clampedDy = Math.max(-minPy, Math.min(1 - maxPy, dy));
    return {
      points: ann.points.map((p) => ({
        x: clamp01(p.x + clampedDx, 0, 1),
        y: clamp01(p.y + clampedDy, 0, 1),
      })),
    };
  }

  const maxX = ann.type === 'line' || ann.type === 'arrow' ? 0.98 : Math.max(0.02, 1 - Math.abs(ann.width));
  const maxY = ann.type === 'line' || ann.type === 'arrow' ? 0.98 : Math.max(0.02, 1 - Math.abs(ann.height));
  return {
    x: clamp01(ann.x + dx, 0, maxX),
    y: clamp01(ann.y + dy, 0, maxY),
  };
}

export function reorderAnnotationStack(
  annotations: PdfAnnotation[],
  id: string,
  action: 'front' | 'back'
): PdfAnnotation[] {
  const idx = annotations.findIndex((a) => a.id === id);
  if (idx === -1) return annotations;
  const item = annotations[idx];
  const rest = annotations.filter((a) => a.id !== id);
  return action === 'front' ? [...rest, item] : [item, ...rest];
}

export function createQuickAnnotationAt(
  tool: 'textbox' | 'checkbox' | 'text' | 'note' | 'stamp',
  params: {
    pageNumber: number;
    layerId: string;
    x: number;
    y: number;
    color: string;
    strokeWidth: number;
    stampLabel?: string;
    stampSubtext?: string;
    stampStyle?: StampStyle;
  }
): PdfAnnotation {
  const id = createUniqueId('ann');
  const now = currentTimestamp();
  const normX = clamp01(params.x, 0, 0.95);
  const normY = clamp01(params.y, 0, 0.95);

  if (tool === 'textbox') {
    return {
      id,
      pageNumber: params.pageNumber,
      layerId: params.layerId,
      type: 'textbox',
      x: clamp01(normX, 0, 0.72),
      y: clamp01(normY, 0, 0.92),
      width: 0.26,
      height: 0.06,
      color: params.color === '#facc15' ? '#2563eb' : params.color,
      fillColor: '#ffffff',
      opacity: 1,
      strokeWidth: Math.max(1.5, params.strokeWidth),
      fontSize: 12,
      fieldName: `textbox_p${params.pageNumber}_${id.slice(-4)}`,
      text: 'Text box',
      author: 'Workspace User',
      createdAt: now,
    };
  }

  if (tool === 'checkbox') {
    return {
      id,
      pageNumber: params.pageNumber,
      layerId: params.layerId,
      type: 'checkbox',
      x: clamp01(normX, 0, 0.95),
      y: clamp01(normY, 0, 0.95),
      width: 0.032,
      height: 0.025,
      color: params.color === '#facc15' ? '#2563eb' : params.color,
      fillColor: '#ffffff',
      opacity: 1,
      strokeWidth: Math.max(1.5, params.strokeWidth),
      fieldName: `checkbox_p${params.pageNumber}_${id.slice(-4)}`,
      checked: false,
      author: 'Workspace User',
      createdAt: now,
    };
  }

  if (tool === 'text') {
    return {
      id,
      pageNumber: params.pageNumber,
      layerId: params.layerId,
      type: 'text',
      x: clamp01(normX, 0, 0.78),
      y: clamp01(normY, 0, 0.94),
      width: 0.24,
      height: 0.045,
      color: params.color === '#facc15' ? '#111827' : params.color,
      opacity: 1,
      strokeWidth: 1,
      fontSize: 13,
      text: 'Editable text',
      author: 'Workspace User',
      createdAt: now,
    };
  }

  if (tool === 'stamp') {
    return buildStampAnnotation({
      pageNumber: params.pageNumber,
      layerId: params.layerId,
      x: normX,
      y: normY,
      label: params.stampLabel || 'REVIEWED',
      subtext: params.stampSubtext,
      color: params.color,
      style: params.stampStyle,
    });
  }

  return {
    id,
    pageNumber: params.pageNumber,
    layerId: params.layerId,
    type: 'note',
    x: clamp01(normX, 0, 0.94),
    y: clamp01(normY, 0, 0.94),
    width: 0.036,
    height: 0.028,
    color: params.color,
    opacity: 0.95,
    strokeWidth: 1.5,
    comment: 'New review note',
    author: 'Workspace User',
    createdAt: now,
  };
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
    type?: string;
    getAttribute?: (name: string) => string | null;
  };
  if (el.isContentEditable) return true;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const inputType = (el.type || 'text').toLowerCase();
    return inputType !== 'checkbox' && inputType !== 'radio' && inputType !== 'button';
  }
  return false;
}

export type PdfShortcutCommand =
  | { type: 'copy' }
  | { type: 'cut' }
  | { type: 'paste' }
  | { type: 'duplicate' }
  | { type: 'delete' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'escape' }
  | { type: 'nudge'; dx: number; dy: number }
  | { type: 'toggle-checkbox' }
  | { type: 'bring-front' }
  | { type: 'send-back' }
  | { type: 'prev-page' }
  | { type: 'next-page' }
  | { type: 'first-page' }
  | { type: 'last-page' }
  | { type: 'zoom-in' }
  | { type: 'zoom-out' }
  | { type: 'zoom-reset' }
  | { type: 'rotate' }
  | { type: 'tool'; tool: PdfTool }
  | { type: 'toggle-shortcuts' };

export interface ShortcutKeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function resolvePdfShortcut(
  e: ShortcutKeyInput,
  ctx: {
    hasSelection: boolean;
    hasClipboard: boolean;
    hasDomTextSelection: boolean;
    isSelectedCheckbox: boolean;
  }
): PdfShortcutCommand | null {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (e.key === 'Escape') {
    return { type: 'escape' };
  }

  if (mod && !e.altKey) {
    if (key === 'z' && !e.shiftKey) return { type: 'undo' };
    if ((key === 'z' && e.shiftKey) || key === 'y') return { type: 'redo' };
    if (key === 'c' && !e.shiftKey && ctx.hasSelection && !ctx.hasDomTextSelection) {
      return { type: 'copy' };
    }
    if (key === 'x' && !e.shiftKey && ctx.hasSelection && !ctx.hasDomTextSelection) {
      return { type: 'cut' };
    }
    if (key === 'v' && !e.shiftKey && ctx.hasClipboard) {
      return { type: 'paste' };
    }
    if (key === 'd' && !e.shiftKey && ctx.hasSelection) {
      return { type: 'duplicate' };
    }
    if (key === '=' || key === '+') return { type: 'zoom-in' };
    if (key === '-') return { type: 'zoom-out' };
    if (key === '0') return { type: 'zoom-reset' };
    if (e.key === ']') return ctx.hasSelection ? { type: 'bring-front' } : null;
    if (e.key === '[') return ctx.hasSelection ? { type: 'send-back' } : null;
    return null;
  }

  if (e.altKey) return null;

  // Selection-scoped shortcuts
  if (ctx.hasSelection) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      return { type: 'delete' };
    }
    const step = e.shiftKey ? 0.02 : 0.004;
    if (e.key === 'ArrowUp') return { type: 'nudge', dx: 0, dy: -step };
    if (e.key === 'ArrowDown') return { type: 'nudge', dx: 0, dy: step };
    if (e.key === 'ArrowLeft') return { type: 'nudge', dx: -step, dy: 0 };
    if (e.key === 'ArrowRight') return { type: 'nudge', dx: step, dy: 0 };
    if (ctx.isSelectedCheckbox && (e.key === ' ' || e.key === 'Enter')) {
      return { type: 'toggle-checkbox' };
    }
    if (e.key === ']') return { type: 'bring-front' };
    if (e.key === '[') return { type: 'send-back' };
  }

  // Page navigation
  if (e.key === 'PageDown' || (!ctx.hasSelection && (e.key === 'ArrowRight' || key === 'j'))) {
    return { type: 'next-page' };
  }
  if (e.key === 'PageUp' || (!ctx.hasSelection && (e.key === 'ArrowLeft' || key === 'k'))) {
    return { type: 'prev-page' };
  }
  if (e.key === 'Home') return { type: 'first-page' };
  if (e.key === 'End') return { type: 'last-page' };

  if (e.key === '?') return { type: 'toggle-shortcuts' };

  if (e.shiftKey) return null;

  // Single-key tools & view actions
  if (key === 'r') return { type: 'rotate' };
  if (key === 'v' || key === '1') return { type: 'tool', tool: 'select' };
  if (key === 'h' || key === '2') return { type: 'tool', tool: 'highlight' };
  if (key === 'u' || key === '3') return { type: 'tool', tool: 'underline' };
  if (key === 's') return { type: 'tool', tool: 'strikethrough' };
  if (key === 'd' || key === 'p') return { type: 'tool', tool: 'freehand' };
  if (key === 't') return { type: 'tool', tool: 'text' };
  if (key === 'b') return { type: 'tool', tool: 'textbox' };
  if (key === 'c') return { type: 'tool', tool: 'checkbox' };
  if (key === 'n') return { type: 'tool', tool: 'note' };
  if (key === 'o') return { type: 'tool', tool: 'stamp' };
  if (key === 'e') return { type: 'tool', tool: 'eraser' };

  return null;
}

export const PDF_SHORTCUT_GROUPS = [
  {
    title: 'Clipboard & History',
    items: [
      { keys: 'Ctrl/Cmd + C', label: 'Copy selected annotation or component' },
      { keys: 'Ctrl/Cmd + X', label: 'Cut selected annotation or component' },
      { keys: 'Ctrl/Cmd + V', label: 'Paste annotation on current page' },
      { keys: 'Ctrl/Cmd + D', label: 'Duplicate selected annotation' },
      { keys: 'Ctrl/Cmd + Z', label: 'Undo annotation change' },
      { keys: 'Ctrl/Cmd + Shift + Z', label: 'Redo annotation change (or Ctrl+Y)' },
      { keys: 'Delete / Backspace', label: 'Delete selected annotation' },
      { keys: 'Escape', label: 'Deselect or return to Select tool' },
    ],
  },
  {
    title: 'Components & Selection',
    items: [
      { keys: 'Arrow Keys', label: 'Nudge selected item (Shift + Arrow for 5× step)' },
      { keys: '[  /  ]', label: 'Send to Back / Bring to Front' },
      { keys: 'Space / Enter', label: 'Toggle selected Checkbox component' },
      { keys: 'Right-Click', label: 'Context menu (Copy, Cut, Paste Here, Insert, Layers)' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { keys: 'V / 1', label: 'Select / Text tool' },
      { keys: 'H / 2', label: 'Highlight tool' },
      { keys: 'U / 3', label: 'Underline tool' },
      { keys: 'S', label: 'Strikethrough tool' },
      { keys: 'D / P', label: 'Freehand Draw tool' },
      { keys: 'T / B / C', label: 'Add Text / Text Box / Checkbox' },
      { keys: 'N / O / E', label: 'Sticky Note / Stamp / Eraser' },
    ],
  },
  {
    title: 'Navigation & View',
    items: [
      { keys: 'PageDown / J / →', label: 'Next page (when nothing selected)' },
      { keys: 'PageUp / K / ←', label: 'Previous page (when nothing selected)' },
      { keys: 'Home / End', label: 'Jump to first / last page' },
      { keys: 'Ctrl/Cmd + + / - / 0', label: 'Zoom in / Zoom out / Reset 100%' },
      { keys: 'R', label: 'Rotate pages 90° clockwise' },
      { keys: 'Ctrl/Cmd + S', label: 'Save PDF' },
      { keys: '?', label: 'Show or hide this shortcuts guide' },
    ],
  },
];
