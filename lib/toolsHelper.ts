export type BatchOp = 'merge' | 'images' | 'split' | 'optimize';
export type MarkdownTemplateKind = 'blank' | 'meeting' | 'spec';

export type PrimaryToolId =
  | 'pdf-tools'
  | 'markdown-tools'
  | 'sheet'
  | 'open-file'
  | 'apps';

export type PdfSubToolId = 'pdf-merge' | 'pdf-images' | 'pdf-split' | 'pdf-optimize';
export type MarkdownSubToolId = 'md-new' | 'md-meeting' | 'md-doc' | 'md-open';
export type WorkspaceToolId = PrimaryToolId | PdfSubToolId | MarkdownSubToolId;

export interface WorkspaceToolItem<T extends WorkspaceToolId = WorkspaceToolId> {
  id: T;
  label: string;
  description: string;
  batchOp?: BatchOp;
  markdownTemplate?: MarkdownTemplateKind;
  isGroup?: boolean;
}

export const PRIMARY_WORKSPACE_TOOLS: WorkspaceToolItem<PrimaryToolId>[] = [
  {
    id: 'pdf-tools',
    label: 'PDF Tools',
    description: 'Merge, split, optimize, or export PDFs to images',
    isGroup: true,
  },
  {
    id: 'markdown-tools',
    label: 'Markdown',
    description: 'Create notes, templates, or open Markdown files',
    isGroup: true,
  },
  {
    id: 'sheet',
    label: 'Sheet',
    description: 'Create a new spreadsheet (.xlsx)',
  },
  {
    id: 'open-file',
    label: 'Open File',
    description: 'Open local PDF, Spreadsheet, Markdown, or HTML',
  },
  {
    id: 'apps',
    label: 'Apps',
    description: 'Progressive Web Apps (PWAs)',
    isGroup: true,
  },
];

export const PDF_SUB_TOOLS: WorkspaceToolItem<PdfSubToolId>[] = [
  {
    id: 'pdf-merge',
    label: 'Merge PDFs',
    description: 'Combine multiple PDFs into one',
    batchOp: 'merge',
  },
  {
    id: 'pdf-images',
    label: 'PDF to Image',
    description: 'Export PDF pages to PNG or JPEG',
    batchOp: 'images',
  },
  {
    id: 'pdf-split',
    label: 'Split PDFs',
    description: 'Split PDFs into page chunks',
    batchOp: 'split',
  },
  {
    id: 'pdf-optimize',
    label: 'Optimize PDF',
    description: 'Compact and strip unused streams',
    batchOp: 'optimize',
  },
];

export const MARKDOWN_SUB_TOOLS: WorkspaceToolItem<MarkdownSubToolId>[] = [
  {
    id: 'md-new',
    label: 'New Note',
    description: 'Create a blank Markdown note',
    markdownTemplate: 'blank',
  },
  {
    id: 'md-meeting',
    label: 'Meeting Note',
    description: 'Start from a structured meeting template',
    markdownTemplate: 'meeting',
  },
  {
    id: 'md-doc',
    label: 'Project Doc',
    description: 'Start from a spec & checklist template',
    markdownTemplate: 'spec',
  },
  {
    id: 'md-open',
    label: 'Open Note',
    description: 'Open an existing .md or .txt file',
  },
];

export function buildMarkdownTemplateContent(kind: MarkdownTemplateKind, title: string): string {
  const heading = title.replace(/\.md$/i, '');
  const dateStr = new Date().toISOString().slice(0, 10);
  switch (kind) {
    case 'meeting':
      return `# ${heading}\n\n- **Date:** ${dateStr}\n- **Attendees:** \n\n## Agenda\n\n1. \n\n## Notes\n\n\n## Action Items\n\n- [ ] \n`;
    case 'spec':
      return `# ${heading}\n\n> Summary of scope, goals, and deliverables.\n\n## Overview\n\n\n## Milestones\n\n| Milestone | Owner | Status |\n| :--- | :--- | :--- |\n| Draft | | In Progress |\n\n## Checklist\n\n- [ ] Define requirements\n- [ ] Review implementation\n`;
    case 'blank':
    default:
      return `# ${heading}\n\nStart writing...\n`;
  }
}

const VALID_BATCH_OPS = new Set<BatchOp>(['merge', 'images', 'split', 'optimize']);

/**
 * Extracts a valid BatchOp from an internal `folio://pdf-batch-tools?op=...` URL.
 */
export function parseBatchOperationFromUrl(url?: string): BatchOp | null {
  if (!url) return null;
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return null;
  const params = new URLSearchParams(url.slice(qIndex + 1));
  const op = params.get('op');
  if (op && VALID_BATCH_OPS.has(op as BatchOp)) {
    return op as BatchOp;
  }
  return null;
}

/**
 * Builds an internal Folio batch-tools URL targeting a specific operation.
 */
export function buildBatchToolsUrl(op?: BatchOp): string {
  return op ? `folio://pdf-batch-tools?op=${op}` : 'folio://pdf-batch-tools';
}
