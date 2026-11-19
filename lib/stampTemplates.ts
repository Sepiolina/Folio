import { createUniqueId, currentTimestamp } from './annotationUtils';
import type { PdfAnnotation, SavedStampTemplate, StampStyle } from '@/types/workspace';

export const STAMP_COLOR_PALETTE = [
  '#2563eb', // Blue
  '#16a34a', // Emerald
  '#e11d48', // Rose
  '#d97706', // Amber
  '#7c3aed', // Violet
  '#0d9488', // Teal
  '#ea580c', // Orange
  '#334155', // Slate
] as const;

export const DEFAULT_STAMP_TEMPLATES: SavedStampTemplate[] = [
  {
    id: 'stamp-tpl-reviewed',
    label: 'REVIEWED',
    subtext: '',
    color: '#2563eb',
    style: 'outline',
    createdAt: 1700000000001,
  },
  {
    id: 'stamp-tpl-approved',
    label: 'APPROVED',
    subtext: '{date}',
    color: '#16a34a',
    style: 'solid',
    createdAt: 1700000000002,
  },
  {
    id: 'stamp-tpl-confidential',
    label: 'CONFIDENTIAL',
    subtext: '',
    color: '#e11d48',
    style: 'outline',
    createdAt: 1700000000003,
  },
  {
    id: 'stamp-tpl-draft',
    label: 'DRAFT',
    subtext: 'For internal review',
    color: '#d97706',
    style: 'badge',
    createdAt: 1700000000004,
  },
  {
    id: 'stamp-tpl-final',
    label: 'FINAL',
    subtext: '',
    color: '#7c3aed',
    style: 'solid',
    createdAt: 1700000000005,
  },
];

export function normalizeStampLabel(raw: string): string {
  const trimmed = raw.trim().slice(0, 48);
  return trimmed.length > 0 ? trimmed : 'STAMP';
}

export function resolveStampTemplateSubtext(subtext?: string, now = new Date()): string {
  if (!subtext) return '';
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const isoDate = `${yyyy}-${mm}-${dd}`;
  return subtext.replace(/\{date\}/gi, isoDate).trim().slice(0, 64);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function resolveStampColors(
  color: string,
  style: StampStyle = 'outline'
): { borderColor: string; backgroundColor: string; textColor: string } {
  const safeColor = color && color !== '#facc15' ? color : '#2563eb';
  const rgb = hexToRgb(safeColor);

  if (style === 'solid') {
    return {
      borderColor: safeColor,
      backgroundColor: safeColor,
      textColor: '#ffffff',
    };
  }

  if (style === 'badge') {
    return {
      borderColor: safeColor,
      backgroundColor: rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)` : 'rgba(37, 99, 235, 0.14)',
      textColor: safeColor,
    };
  }

  return {
    borderColor: safeColor,
    backgroundColor: 'rgba(255, 255, 255, 0.84)',
    textColor: safeColor,
  };
}

export function buildStampAnnotation(params: {
  pageNumber: number;
  layerId: string;
  x: number;
  y: number;
  label: string;
  subtext?: string;
  color: string;
  style?: StampStyle;
  now?: Date;
}): PdfAnnotation {
  const resolvedLabel = normalizeStampLabel(params.label);
  const resolvedSubtext = resolveStampTemplateSubtext(params.subtext, params.now);
  const resolvedStyle: StampStyle = params.style || 'outline';
  const resolvedColor = params.color === '#facc15' ? '#2563eb' : params.color || '#2563eb';
  const hasSubtext = resolvedSubtext.length > 0;
  const width = Math.min(0.36, Math.max(0.18, 0.08 + resolvedLabel.length * 0.011));
  const height = hasSubtext ? 0.068 : 0.052;

  return {
    id: createUniqueId('ann'),
    pageNumber: params.pageNumber,
    layerId: params.layerId,
    type: 'stamp',
    x: Math.max(0, Math.min(0.98 - width, params.x - width / 2)),
    y: Math.max(0, Math.min(0.98 - height, params.y - height / 2)),
    width,
    height,
    color: resolvedColor,
    opacity: 0.94,
    strokeWidth: 2,
    stampLabel: resolvedLabel,
    stampSubtext: resolvedSubtext || undefined,
    stampStyle: resolvedStyle,
    author: 'Workspace User',
    createdAt: currentTimestamp(),
  };
}

export function annotationToStampTemplate(ann: PdfAnnotation): Omit<SavedStampTemplate, 'id' | 'createdAt'> {
  return {
    label: normalizeStampLabel(ann.stampLabel || 'REVIEWED'),
    subtext: ann.stampSubtext?.trim() || '',
    color: ann.color || '#2563eb',
    style: ann.stampStyle || 'outline',
  };
}
