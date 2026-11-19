'use client';

import React, { useState } from 'react';
import {
  AppWindow,
  ArrowLeft,
  CalendarDays,
  FileCode2,
  FileImage,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Layers,
  Merge,
  Scissors,
  Sparkles,
} from 'lucide-react';
import {
  MARKDOWN_SUB_TOOLS,
  PDF_SUB_TOOLS,
  PRIMARY_WORKSPACE_TOOLS,
  type BatchOp,
  type MarkdownTemplateKind,
  type WorkspaceToolId,
} from '@/lib/toolsHelper';

interface ToolsPopoverProps {
  onClose: () => void;
  onOpenFile: () => void;
  onOpenMarkdownFile: () => void;
  onNewNote: (template?: MarkdownTemplateKind) => void;
  onNewSheet: () => void;
  onOpenBatchTools: (op?: BatchOp) => void;
}

type ToolGroupView = 'root' | 'pdf' | 'markdown' | 'apps';

function ToolCircleIcon({ id }: { id: WorkspaceToolId }) {
  switch (id) {
    case 'pdf-tools':
      return (
        <div className="w-11 h-11 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/25 flex items-center justify-center group-hover:scale-105 transition-transform">
          <Layers className="w-5 h-5" />
        </div>
      );
    case 'markdown-tools':
      return (
        <div className="w-11 h-11 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/25 flex items-center justify-center group-hover:scale-105 transition-transform">
          <FileCode2 className="w-5 h-5" />
        </div>
      );
    case 'sheet':
      return (
        <div className="w-11 h-11 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center justify-center group-hover:scale-105 transition-transform">
          <FileSpreadsheet className="w-5 h-5" />
        </div>
      );
    case 'open-file':
      return (
        <div className="w-11 h-11 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center group-hover:scale-105 transition-transform">
          <FolderOpen className="w-5 h-5" />
        </div>
      );
    case 'apps':
      return (
        <div className="w-11 h-11 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25 flex items-center justify-center group-hover:scale-105 transition-transform">
          <AppWindow className="w-5 h-5" />
        </div>
      );
    case 'pdf-merge':
      return (
        <div className="w-11 h-11 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 flex items-center justify-center group-hover:scale-105 transition-transform">
          <Merge className="w-5 h-5" />
        </div>
      );
    case 'pdf-images':
      return (
        <div className="w-11 h-11 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center group-hover:scale-105 transition-transform">
          <FileImage className="w-5 h-5" />
        </div>
      );
    case 'pdf-split':
      return (
        <div className="w-11 h-11 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25 flex items-center justify-center group-hover:scale-105 transition-transform">
          <Scissors className="w-5 h-5" />
        </div>
      );
    case 'pdf-optimize':
      return (
        <div className="w-11 h-11 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center justify-center group-hover:scale-105 transition-transform">
          <Sparkles className="w-5 h-5" />
        </div>
      );
    case 'md-new':
      return (
        <div className="w-11 h-11 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/25 flex items-center justify-center group-hover:scale-105 transition-transform">
          <FilePlus2 className="w-5 h-5" />
        </div>
      );
    case 'md-meeting':
      return (
        <div className="w-11 h-11 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 flex items-center justify-center group-hover:scale-105 transition-transform">
          <CalendarDays className="w-5 h-5" />
        </div>
      );
    case 'md-doc':
      return (
        <div className="w-11 h-11 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center justify-center group-hover:scale-105 transition-transform">
          <FileText className="w-5 h-5" />
        </div>
      );
    case 'md-open':
      return (
        <div className="w-11 h-11 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center group-hover:scale-105 transition-transform">
          <FolderOpen className="w-5 h-5" />
        </div>
      );
  }
}

export function ToolsPopover({
  onClose,
  onOpenFile,
  onOpenMarkdownFile,
  onNewNote,
  onNewSheet,
  onOpenBatchTools,
}: ToolsPopoverProps) {
  const [activeGroup, setActiveGroup] = useState<ToolGroupView>('root');

  const handlePrimaryClick = (id: WorkspaceToolId) => {
    if (id === 'pdf-tools') {
      setActiveGroup('pdf');
      return;
    }
    if (id === 'markdown-tools') {
      setActiveGroup('markdown');
      return;
    }
    if (id === 'apps') {
      setActiveGroup('apps');
      return;
    }
    onClose();
    if (id === 'sheet') {
      onNewSheet();
      return;
    }
    if (id === 'open-file') {
      onOpenFile();
    }
  };

  const handlePdfSubToolClick = (batchOp?: BatchOp) => {
    onClose();
    onOpenBatchTools(batchOp);
  };

  const handleMarkdownSubToolClick = (id: WorkspaceToolId, template?: MarkdownTemplateKind) => {
    onClose();
    if (id === 'md-open') {
      onOpenMarkdownFile();
      return;
    }
    onNewNote(template);
  };

  const dialogLabel =
    activeGroup === 'pdf'
      ? 'PDF tools'
      : activeGroup === 'markdown'
        ? 'Markdown tools'
        : activeGroup === 'apps'
          ? 'Apps'
          : 'Workspace tools';

  const groupHeading =
    activeGroup === 'pdf'
      ? 'PDF Tools'
      : activeGroup === 'markdown'
        ? 'Markdown'
        : 'Apps';

  return (
    <div
      role="dialog"
      aria-label={dialogLabel}
      className="absolute right-0 top-9 z-50 w-[296px] max-w-[92vw] rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-elevated)] shadow-2xl overflow-hidden p-3"
    >
      {activeGroup === 'root' ? (
        <div className="grid grid-cols-3 gap-1.5">
          {PRIMARY_WORKSPACE_TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              title={tool.description}
              onClick={() => handlePrimaryClick(tool.id)}
              className="group flex flex-col items-center justify-start gap-2 px-1.5 py-3 rounded-xl hover:bg-[var(--surface-subtle)] transition-colors text-center"
            >
              <ToolCircleIcon id={tool.id} />
              <span className="text-[11.5px] font-medium text-[var(--text-primary)] leading-tight">
                {tool.label}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 pb-1.5 border-b border-[var(--border-hairline)]">
            <button
              type="button"
              onClick={() => setActiveGroup('root')}
              aria-label="Back to tools"
              className="flex items-center gap-1.5 px-1.5 py-1 rounded-md text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Tools</span>
            </button>
            <span className="text-xs font-semibold text-[var(--text-primary)] pr-1">
              {groupHeading}
            </span>
          </div>

          {activeGroup === 'pdf' && (
            <div className="grid grid-cols-3 gap-1.5">
              {PDF_SUB_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  title={tool.description}
                  onClick={() => handlePdfSubToolClick(tool.batchOp)}
                  className="group flex flex-col items-center justify-start gap-2 px-1.5 py-3 rounded-xl hover:bg-[var(--surface-subtle)] transition-colors text-center"
                >
                  <ToolCircleIcon id={tool.id} />
                  <span className="text-[11.5px] font-medium text-[var(--text-primary)] leading-tight">
                    {tool.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          {activeGroup === 'markdown' && (
            <div className="grid grid-cols-3 gap-1.5">
              {MARKDOWN_SUB_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  title={tool.description}
                  onClick={() => handleMarkdownSubToolClick(tool.id, tool.markdownTemplate)}
                  className="group flex flex-col items-center justify-start gap-2 px-1.5 py-3 rounded-xl hover:bg-[var(--surface-subtle)] transition-colors text-center"
                >
                  <ToolCircleIcon id={tool.id} />
                  <span className="text-[11.5px] font-medium text-[var(--text-primary)] leading-tight">
                    {tool.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          {activeGroup === 'apps' && (
            <div className="py-7 px-3 flex flex-col items-center justify-center text-center">
              <div className="w-11 h-11 rounded-full bg-violet-500/12 text-violet-400 border border-violet-500/20 flex items-center justify-center mb-3">
                <AppWindow className="w-5 h-5" />
              </div>
              <p className="text-xs font-medium text-[var(--text-primary)] mb-1">
                No apps installed
              </p>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed max-w-[210px]">
                Progressive Web Apps (PWAs) will appear here in a future update.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
