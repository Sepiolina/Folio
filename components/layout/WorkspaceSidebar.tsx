'use client';

import React, { useState } from 'react';
import {
  Bookmark,
  Check,
  Clock,
  Copy,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { formatBytes } from '@/lib/pageRange';
import { deleteWorkspaceFile } from '@/lib/storage';
import { invalidateWorkspaceAssetUrl } from '@/lib/markdownAssetStore';
import {
  createNewMarkdownFile,
  createNewSpreadsheetFile,
  openFilesWithPicker,
} from '@/lib/fileOpener';

export function WorkspaceSidebar() {
  const {
    sidebarOpen,
    sidebarSection,
    setSidebarSection,
    setSidebarOpen,
    bookmarks,
    history,
    downloads,
    workspaceFiles,
    openNewTab,
    openFileInTab,
    removeBookmark,
    clearHistory,
    clearDownloads,
    upsertWorkspaceFile,
    removeWorkspaceFileMeta,
    navigateBrowserTab,
    tabs,
    activeTabId,
  } = useWorkspaceStore();

  const [historyQuery, setHistoryQuery] = useState('');
  const [newBookmarkTitle, setNewBookmarkTitle] = useState('');
  const [newBookmarkUrl, setNewBookmarkUrl] = useState('');
  const [addingBookmark, setAddingBookmark] = useState(false);
  const [copiedAssetId, setCopiedAssetId] = useState<string | null>(null);

  if (!sidebarOpen) return null;

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const documentFiles = workspaceFiles.filter((f) => f.kind !== 'asset');
  const assetFiles = workspaceFiles.filter((f) => f.kind === 'asset');

  const openUrl = (url: string, title?: string) => {
    if (activeTab && (activeTab.type === 'home' || activeTab.type === 'browser')) {
      navigateBrowserTab(activeTab.id, url);
    } else {
      const id = openNewTab('browser', { url, title: title || url });
      navigateBrowserTab(id, url);
    }
  };

  const handleOpenPicker = async () => {
    const files = await openFilesWithPicker();
    for (const f of files) {
      upsertWorkspaceFile(f);
      openFileInTab(f);
    }
  };

  const handleCreateNote = async () => {
    const meta = await createNewMarkdownFile(`Note_${Date.now().toString().slice(-4)}.md`);
    upsertWorkspaceFile(meta);
    openFileInTab(meta, 'markdown');
  };

  const handleCreateSpreadsheet = async () => {
    const meta = await createNewSpreadsheetFile(`Sheet_${Date.now().toString().slice(-4)}.xlsx`, 'xlsx');
    upsertWorkspaceFile(meta);
    openFileInTab(meta, 'spreadsheet');
  };

  const handleDeleteFile = async (fileId: string, fileName?: string, kind?: string) => {
    if (kind === 'asset' && fileName) {
      invalidateWorkspaceAssetUrl(fileName);
    }
    await deleteWorkspaceFile(fileId);
    removeWorkspaceFileMeta(fileId);
  };

  const handleCopyAssetMarkdown = (assetId: string, assetPath: string) => {
    const base = assetPath.split('/').pop() || assetPath;
    const alt = base.replace(/\.[^.]+$/, '') || 'image';
    const mdSnippet = `![${alt}](${assetPath})`;
    void navigator.clipboard?.writeText(mdSnippet).catch(() => {});
    setCopiedAssetId(assetId);
    setTimeout(() => {
      setCopiedAssetId((curr) => (curr === assetId ? null : curr));
    }, 1500);
  };

  const filteredHistory = history.filter((h) => {
    if (!historyQuery.trim()) return true;
    const q = historyQuery.toLowerCase();
    return h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q);
  });

  const sections = [
    { id: 'files' as const, label: 'Files', icon: FolderOpen },
    { id: 'bookmarks' as const, label: 'Bookmarks', icon: Bookmark },
    { id: 'history' as const, label: 'History', icon: Clock },
    { id: 'downloads' as const, label: 'Downloads', icon: Download },
  ];

  return (
    <aside
      aria-label="Workspace sidebar"
      className="w-[260px] shrink-0 border-r border-[var(--border-hairline)] bg-[var(--surface-chrome)] flex flex-col h-full overflow-hidden select-none"
    >
      {/* Section Tabs */}
      <div className="flex items-center justify-between px-2 pt-2 pb-1.5 border-b border-[var(--border-hairline)]">
        <div className="flex items-center gap-0.5">
          {sections.map((sec) => {
            const Icon = sec.icon;
            const active = sidebarSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setSidebarSection(sec.id)}
                aria-label={sec.label}
                title={sec.label}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[var(--surface-subtle)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {active && <span>{sec.label}</span>}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Section Content */}
      <div className="flex-1 overflow-y-auto p-2.5 text-xs">
        {sidebarSection === 'files' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--text-secondary)]">Workspace Files</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleCreateNote}
                  title="New Markdown Note"
                  aria-label="New Markdown Note"
                  className="p-1 rounded hover:bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleCreateSpreadsheet}
                  title="New Spreadsheet"
                  aria-label="New Spreadsheet"
                  className="p-1 rounded hover:bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-emerald-400"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleOpenPicker}
                  title="Open Local File"
                  aria-label="Open Local File"
                  className="p-1 rounded hover:bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {documentFiles.length === 0 ? (
              <p className="text-[var(--text-muted)] py-6 text-center">
                No files yet. Open a PDF, Spreadsheet, Markdown, or HTML file.
              </p>
            ) : (
              <div className="space-y-0.5">
                {documentFiles.map((file) => (
                  <div
                    key={file.id}
                    className="group flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-[var(--surface-subtle)] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => openFileInTab(file)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      {file.kind === 'pdf' ? (
                        <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      ) : file.kind === 'spreadsheet' ? (
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : file.kind === 'html' ? (
                        <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <FileCode2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-[var(--text-primary)]">
                          {file.name}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                          {file.kind.toUpperCase()} · {formatBytes(file.sizeBytes)}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteFile(file.id, file.name, file.kind)}
                      aria-label={`Delete ${file.name}`}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-[var(--text-muted)] hover:text-rose-400 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Workspace Assets Section */}
            <div className="pt-3 mt-2 border-t border-[var(--border-hairline)] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--text-secondary)]">
                  Workspace Assets ({assetFiles.length})
                </span>
              </div>
              {assetFiles.length === 0 ? (
                <p className="text-[11px] text-[var(--text-muted)] py-2">
                  Images added to Markdown notes are stored here under <code>assets/</code>.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {assetFiles.map((asset) => (
                    <div
                      key={asset.id}
                      className="group flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-[var(--surface-subtle)] transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => openFileInTab(asset)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        title={`Preview ${asset.name}`}
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-[var(--text-primary)]">
                            {asset.name.replace(/^assets\//, '')}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] tabular-nums truncate">
                            {asset.name} · {formatBytes(asset.sizeBytes)}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyAssetMarkdown(asset.id, asset.name)}
                        title="Copy Markdown image snippet"
                        aria-label={`Copy Markdown snippet for ${asset.name}`}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-opacity"
                      >
                        {copiedAssetId === asset.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFile(asset.id, asset.name, asset.kind)}
                        aria-label={`Delete ${asset.name}`}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-[var(--text-muted)] hover:text-rose-400 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {sidebarSection === 'bookmarks' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--text-secondary)]">Bookmarks</span>
              <button
                type="button"
                onClick={() => setAddingBookmark(!addingBookmark)}
                aria-label="Add bookmark manually"
                className="p-1 rounded hover:bg-[var(--surface-subtle)] text-[var(--text-secondary)]"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {addingBookmark && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newBookmarkUrl.trim()) return;
                  const normalized = /^https?:\/\//i.test(newBookmarkUrl.trim())
                    ? newBookmarkUrl.trim()
                    : `https://${newBookmarkUrl.trim()}`;
                  useWorkspaceStore.getState().addBookmark({
                    title: newBookmarkTitle.trim() || normalized,
                    url: normalized,
                    folder: 'Quick Links',
                  });
                  setNewBookmarkTitle('');
                  setNewBookmarkUrl('');
                  setAddingBookmark(false);
                }}
                className="space-y-1.5 p-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-subtle)]"
              >
                <input
                  type="text"
                  value={newBookmarkTitle}
                  onChange={(e) => setNewBookmarkTitle(e.target.value)}
                  placeholder="Title"
                  className="w-full px-2 py-1 rounded bg-[var(--surface-chrome)] border border-[var(--border-hairline)] text-xs text-[var(--text-primary)] focus:outline-none"
                />
                <input
                  type="text"
                  value={newBookmarkUrl}
                  onChange={(e) => setNewBookmarkUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-2 py-1 rounded bg-[var(--surface-chrome)] border border-[var(--border-hairline)] text-xs text-[var(--text-primary)] focus:outline-none"
                />
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setAddingBookmark(false)}
                    className="px-2 py-1 rounded text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-2 py-1 rounded text-[11px] font-medium bg-[var(--accent-color)] text-white"
                  >
                    Save
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-0.5">
              {bookmarks.map((bm) => (
                <div
                  key={bm.id}
                  className="group flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-[var(--surface-subtle)]"
                >
                  <button
                    type="button"
                    onClick={() => openUrl(bm.url, bm.title)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    <Bookmark className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-[var(--text-primary)]">{bm.title}</div>
                      <div className="truncate text-[11px] text-[var(--text-muted)]">{bm.url}</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBookmark(bm.id)}
                    aria-label={`Delete bookmark ${bm.title}`}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-[var(--text-muted)] hover:text-rose-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {sidebarSection === 'history' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--text-secondary)]">History</span>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={clearHistory}
                  className="text-[11px] text-[var(--text-muted)] hover:text-rose-400"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--surface-subtle)] border border-[var(--border-hairline)]">
              <Search className="w-3 h-3 text-[var(--text-muted)]" />
              <input
                type="text"
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                placeholder="Search history..."
                aria-label="Search history"
                className="flex-1 min-w-0 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
            </div>

            {filteredHistory.length === 0 ? (
              <p className="text-[var(--text-muted)] py-6 text-center">No history entries.</p>
            ) : (
              <div className="space-y-0.5">
                {filteredHistory.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => openUrl(h.url, h.title)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--surface-subtle)] text-left"
                  >
                    <Globe className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-[var(--text-primary)]">{h.title}</div>
                      <div className="truncate text-[11px] text-[var(--text-muted)]">{h.url}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {sidebarSection === 'downloads' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--text-secondary)]">Downloads</span>
              {downloads.length > 0 && (
                <button
                  type="button"
                  onClick={clearDownloads}
                  className="text-[11px] text-[var(--text-muted)] hover:text-rose-400"
                >
                  Clear
                </button>
              )}
            </div>

            {downloads.length === 0 ? (
              <p className="text-[var(--text-muted)] py-6 text-center">
                Exported PDFs, ZIP archives, and web downloads appear here.
              </p>
            ) : (
              <div className="space-y-1.5">
                {downloads.map((dl) => (
                  <div
                    key={dl.id}
                    className="p-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-subtle)]"
                  >
                    <div className="truncate font-medium text-[var(--text-primary)]">
                      {dl.filename}
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[11px] text-[var(--text-muted)] tabular-nums">
                      <span>{formatBytes(dl.sizeBytes)}</span>
                      <span className="capitalize">{dl.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
