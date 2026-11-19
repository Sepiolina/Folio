'use client';

import React from 'react';
import {
  Download,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Globe,
} from 'lucide-react';
import type { DownloadItem, WorkspaceFileMeta } from '@/types/workspace';
import {
  findMatchingWorkspaceFile,
  formatDownloadSubtext,
  getDownloadFileCategory,
  getRecentDownloads,
  type DownloadFileCategory,
} from '@/lib/downloadsHelper';

interface DownloadsPopoverProps {
  downloads: DownloadItem[];
  workspaceFiles: WorkspaceFileMeta[];
  onClose: () => void;
  onOpenWorkspaceFile: (file: WorkspaceFileMeta) => void;
  onShowAllDownloads: () => void;
  onClearDownloads: () => void;
}

function CategoryIcon({ category }: { category: DownloadFileCategory }) {
  switch (category) {
    case 'archive':
      return (
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
          <FileArchive className="w-4 h-4" />
        </div>
      );
    case 'pdf':
      return (
        <div className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4" />
        </div>
      );
    case 'spreadsheet':
      return (
        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-4 h-4" />
        </div>
      );
    case 'markdown':
      return (
        <div className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
          <FileCode2 className="w-4 h-4" />
        </div>
      );
    case 'image':
      return (
        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
          <FileImage className="w-4 h-4" />
        </div>
      );
    case 'html':
      return (
        <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
          <Globe className="w-4 h-4" />
        </div>
      );
    case 'code':
      return (
        <div className="w-8 h-8 rounded-lg bg-[var(--surface-subtle)] text-[var(--text-secondary)] flex items-center justify-center shrink-0">
          <FileCode2 className="w-4 h-4" />
        </div>
      );
    default:
      return (
        <div className="w-8 h-8 rounded-lg bg-[var(--surface-subtle)] text-[var(--text-secondary)] flex items-center justify-center shrink-0">
          <File className="w-4 h-4" />
        </div>
      );
  }
}

export function DownloadsPopover({
  downloads,
  workspaceFiles,
  onClose,
  onOpenWorkspaceFile,
  onShowAllDownloads,
  onClearDownloads,
}: DownloadsPopoverProps) {
  const recentDownloads = getRecentDownloads(downloads, 5);

  const handleAction = (dl: DownloadItem) => {
    const matched = findMatchingWorkspaceFile(dl, workspaceFiles);
    if (matched) {
      onOpenWorkspaceFile(matched);
      onClose();
      return;
    }
    onShowAllDownloads();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-label="Recent downloads"
      className="absolute right-0 top-9 z-50 w-[348px] max-w-[92vw] rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-elevated)] shadow-2xl overflow-hidden text-xs"
    >
      {recentDownloads.length === 0 ? (
        <div className="px-4 py-6 text-center space-y-1.5">
          <div className="w-9 h-9 rounded-xl bg-[var(--surface-subtle)] text-[var(--text-muted)] flex items-center justify-center mx-auto">
            <Download className="w-4 h-4" />
          </div>
          <div className="text-[13px] font-medium text-[var(--text-primary)]">
            No downloads yet
          </div>
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            Exported PDFs, ZIP archives, Markdown files, and web snapshots appear here.
          </p>
        </div>
      ) : (
        <div className="py-1.5 max-h-[320px] overflow-y-auto">
          {recentDownloads.map((dl) => {
            const category = getDownloadFileCategory(dl.filename, dl.mimeType);
            const matchedFile = findMatchingWorkspaceFile(dl, workspaceFiles);
            const subtext = formatDownloadSubtext(dl);

            return (
              <div
                key={dl.id}
                className="group flex items-center gap-3 px-3.5 py-2 hover:bg-[var(--surface-subtle)] transition-colors"
              >
                <CategoryIcon category={category} />

                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-[var(--text-primary)] leading-snug">
                    {dl.filename}
                  </div>
                  <div className="truncate text-[11px] text-[var(--text-muted)] tabular-nums mt-0.5">
                    {subtext}
                  </div>
                  {dl.status === 'downloading' && (
                    <div className="mt-1.5 h-1 w-full rounded-full bg-[var(--surface-chrome)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent-color)] transition-all"
                        style={{ width: `${Math.max(4, Math.min(100, dl.progress || 0))}%` }}
                      />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleAction(dl)}
                  aria-label={
                    matchedFile ? `Open ${dl.filename} in workspace` : `Show ${dl.filename} in downloads`
                  }
                  title={matchedFile ? 'Open in workspace' : 'Show in downloads'}
                  className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-chrome)] transition-colors shrink-0"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer matching reference "Show all downloads" bar */}
      <div className="flex items-center justify-between border-t border-[var(--border-hairline)] px-3.5 py-2.5 bg-[var(--surface-chrome)]/60">
        <button
          type="button"
          onClick={() => {
            onShowAllDownloads();
            onClose();
          }}
          className="text-[12.5px] font-medium text-[var(--text-primary)] hover:text-[var(--accent-color)] transition-colors"
        >
          Show all downloads
        </button>

        {downloads.length > 0 && (
          <button
            type="button"
            onClick={onClearDownloads}
            className="text-[11px] text-[var(--text-muted)] hover:text-rose-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
