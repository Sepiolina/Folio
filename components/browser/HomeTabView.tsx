'use client';

import React, { useState } from 'react';
import {
  Bookmark,
  FileCode2,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Globe,
  Layers,
  Search,
} from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import {
  createNewMarkdownFile,
  createNewSpreadsheetFile,
  openFilesWithPicker,
} from '@/lib/fileOpener';
import { formatBytes } from '@/lib/pageRange';

interface HomeTabViewProps {
  tabId: string;
}

export function HomeTabView({ tabId }: HomeTabViewProps) {
  const {
    bookmarks,
    workspaceFiles,
    navigateBrowserTab,
    openFileInTab,
    upsertWorkspaceFile,
    openNewTab,
  } = useWorkspaceStore();

  const [query, setQuery] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    navigateBrowserTab(tabId, query);
  };

  const handleOpenFile = async () => {
    const opened = await openFilesWithPicker();
    for (const f of opened) {
      upsertWorkspaceFile(f);
      openFileInTab(f);
    }
  };

  const handleNewMarkdown = async () => {
    const meta = await createNewMarkdownFile(`Note_${Date.now().toString().slice(-4)}.md`);
    upsertWorkspaceFile(meta);
    openFileInTab(meta, 'markdown');
  };

  const handleNewSpreadsheet = async () => {
    const meta = await createNewSpreadsheetFile(`Sheet_${Date.now().toString().slice(-4)}.xlsx`, 'xlsx');
    upsertWorkspaceFile(meta);
    openFileInTab(meta, 'spreadsheet');
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-[var(--surface-canvas)] overflow-y-auto">
      <div className="w-full max-w-2xl flex flex-col items-center">
        {/* Centered Minimalist Search / URL Bar matching Reference Image 1 */}
        <form onSubmit={handleSearchSubmit} className="w-full max-w-xl mb-10">
          <div className="flex items-center h-12 px-4 gap-3 rounded-full border border-[var(--border-strong)] bg-[var(--surface-chrome)] focus-within:border-[var(--accent-color)] transition-colors">
            <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or type a URL"
              aria-label="Home search or URL input"
              className="flex-1 min-w-0 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1 rounded-full text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors whitespace-nowrap"
            >
              Go
            </button>
          </div>
        </form>

        {/* Quiet Single-Line Quick Actions */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
          <button
            type="button"
            onClick={handleOpenFile}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-chrome)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[var(--accent-color)]" />
            <span>Open File</span>
          </button>

          <button
            type="button"
            onClick={handleNewMarkdown}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-chrome)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap"
          >
            <FilePlus2 className="w-3.5 h-3.5 text-sky-400" />
            <span>New Markdown</span>
          </button>

          <button
            type="button"
            onClick={handleNewSpreadsheet}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-chrome)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>New Sheet</span>
          </button>

          <button
            type="button"
            onClick={() => openNewTab('batch', { title: 'PDF Batch Tools' })}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-chrome)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>PDF Batch Tools</span>
          </button>
        </div>

        {/* Workspace Documents & Bookmarks Grid */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Workspace Documents */}
          <div>
            <h2 className="text-xs font-medium text-[var(--text-muted)] mb-2.5 px-1">
              Workspace Documents
            </h2>
            <div className="divide-y divide-[var(--border-hairline)] border border-[var(--border-hairline)] rounded-lg bg-[var(--surface-chrome)] overflow-hidden">
              {workspaceFiles
                .filter((f) => f.kind !== 'asset')
                .slice(0, 6)
                .map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => openFileInTab(file)}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-[var(--surface-subtle)] transition-colors"
                  >
                    {file.kind === 'pdf' ? (
                      <FileText className="w-4 h-4 text-rose-400 shrink-0" />
                    ) : file.kind === 'spreadsheet' ? (
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : file.kind === 'html' ? (
                      <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <FileCode2 className="w-4 h-4 text-sky-400 shrink-0" />
                    )}
                    <span className="flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]">
                      {file.name}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                      {formatBytes(file.sizeBytes)}
                    </span>
                  </button>
                ))}
              {workspaceFiles.filter((f) => f.kind !== 'asset').length === 0 && (
                <div className="px-3.5 py-4 text-xs text-[var(--text-muted)]">
                  Drop a PDF, Spreadsheet (.csv/.xls/.xlsx), Markdown, or HTML file anywhere to open.
                </div>
              )}
            </div>
          </div>

          {/* Bookmarks */}
          <div>
            <h2 className="text-xs font-medium text-[var(--text-muted)] mb-2.5 px-1">
              Bookmarks
            </h2>
            <div className="divide-y divide-[var(--border-hairline)] border border-[var(--border-hairline)] rounded-lg bg-[var(--surface-chrome)] overflow-hidden">
              {bookmarks.slice(0, 5).map((bm) => (
                <button
                  key={bm.id}
                  type="button"
                  onClick={() => navigateBrowserTab(tabId, bm.url)}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-[var(--surface-subtle)] transition-colors"
                >
                  <Bookmark className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]">
                    {bm.title}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)] truncate max-w-[120px]">
                    {bm.url.replace(/^https?:\/\//, '')}
                  </span>
                </button>
              ))}
              {bookmarks.length === 0 && (
                <div className="px-3.5 py-4 text-xs text-[var(--text-muted)]">
                  No bookmarks saved yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
