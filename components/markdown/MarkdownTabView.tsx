'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import {
  Archive,
  BookOpen,
  Check,
  Code2,
  Download,
  Eye,
  ListTree,
  MoreHorizontal,
  Save,
  Search,
  WrapText,
  Hash,
} from 'lucide-react';
import type { MarkdownViewMode, TabItem } from '@/types/workspace';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { getWorkspaceFile, saveWorkspaceFile, triggerBlobDownload } from '@/lib/storage';
import { saveTextDocument } from '@/lib/fileOpener';
import {
  countWordsAndChars,
  extractMarkdownOutline,
  remarkMarkHighlight,
} from '@/lib/markdownUtils';
import { isWorkspaceAssetRef, matchWorkspaceFileByReference } from '@/lib/markdownAssets';
import {
  exportMarkdownZipBundle,
  getCachedWorkspaceAssetUrl,
  resolveWorkspaceAssetUrl,
} from '@/lib/markdownAssetStore';
import {
  MarkdownFormattingBar,
  type MarkdownActionPayload,
  type MarkdownFormatAction,
} from './MarkdownFormattingBar';
import { CodeMirrorEditor, type MarkdownEditorHandle } from './CodeMirrorEditor';

const MARKDOWN_SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'mark'],
};

function normalizeMarkdownMode(mode: string | undefined): MarkdownViewMode {
  if (mode === 'source' || mode === 'read') return mode;
  return 'live';
}

function MarkdownAssetImage({
  src,
  alt,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  const rawSrc = typeof src === 'string' ? src : '';
  const isAsset = isWorkspaceAssetRef(rawSrc);
  const syncSrc = !isAsset ? rawSrc || null : getCachedWorkspaceAssetUrl(rawSrc);
  const [asyncResolved, setAsyncResolved] = useState<{ key: string; url: string | null } | null>(
    null
  );
  const [failedKey, setFailedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isAsset || syncSrc) return;
    let active = true;
    void resolveWorkspaceAssetUrl(rawSrc).then((url) => {
      if (!active) return;
      setAsyncResolved({ key: rawSrc, url });
    });
    return () => {
      active = false;
    };
  }, [isAsset, syncSrc, rawSrc]);

  const resolvedSrc = syncSrc ?? (asyncResolved?.key === rawSrc ? asyncResolved.url : null);
  const missingAsync =
    isAsset && !syncSrc && asyncResolved?.key === rawSrc && asyncResolved.url === null;
  const failed = failedKey === rawSrc || missingAsync;

  if (failed || (!resolvedSrc && !isAsset)) {
    return (
      <span className="inline-flex items-center px-2.5 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-xs text-[var(--text-muted)]">
        Image unavailable: {alt || rawSrc}
      </span>
    );
  }

  if (!resolvedSrc) {
    return (
      <span className="inline-flex items-center px-2.5 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-xs text-[var(--text-muted)]">
        Loading image…
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolvedSrc}
      alt={alt || ''}
      referrerPolicy="no-referrer"
      onError={() => setFailedKey(rawSrc)}
      {...props}
    />
  );
}

const MarkdownPreviewPane = React.memo(function MarkdownPreviewPane({
  content,
  findQuery,
}: {
  content: string;
  findQuery: string;
}) {
  return (
    <div className="px-8 py-9 mx-auto markdown-prose">
      {findQuery.trim() && (
        <div className="mb-4 px-3 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-xs text-[var(--text-secondary)]">
          Matches for &ldquo;{findQuery}&rdquo;:{' '}
          <strong className="text-[var(--text-primary)]">
            {content.toLowerCase().split(findQuery.toLowerCase()).length - 1}
          </strong>
        </div>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMarkHighlight]}
        rehypePlugins={[[rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA]]}
        components={{
          h1: ({ children, ...props }) => {
            const id = String(children)
              .toLowerCase()
              .replace(/[^a-z0-9\s-]/g, '')
              .trim()
              .replace(/\s+/g, '-');
            return (
              <h1 data-heading-id={id} {...props}>
                {children}
              </h1>
            );
          },
          h2: ({ children, ...props }) => {
            const id = String(children)
              .toLowerCase()
              .replace(/[^a-z0-9\s-]/g, '')
              .trim()
              .replace(/\s+/g, '-');
            return (
              <h2 data-heading-id={id} {...props}>
                {children}
              </h2>
            );
          },
          h3: ({ children, ...props }) => {
            const id = String(children)
              .toLowerCase()
              .replace(/[^a-z0-9\s-]/g, '')
              .trim()
              .replace(/\s+/g, '-');
            return (
              <h3 data-heading-id={id} {...props}>
                {children}
              </h3>
            );
          },
          img: ({ src, alt, ...props }) => (
            <MarkdownAssetImage src={typeof src === 'string' ? src : undefined} alt={alt} {...props} />
          ),
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              onClick={(e) => {
                if (!href) return;
                if (/^https?:\/\//i.test(href)) {
                  e.preventDefault();
                  useWorkspaceStore.getState().openNewTab('browser', { url: href, title: href });
                  return;
                }
                const store = useWorkspaceStore.getState();
                const matched = matchWorkspaceFileByReference(href, store.workspaceFiles);
                if (matched) {
                  e.preventDefault();
                  store.openFileInTab(matched);
                }
              }}
              {...props}
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'autosaved' | 'saved';

interface MarkdownTabViewProps {
  tab: TabItem;
}

export function MarkdownTabView({ tab }: MarkdownTabViewProps) {
  const { settings, updateSettings, updateTab, upsertWorkspaceFile, addDownload } =
    useWorkspaceStore();

  const [content, setContent] = useState('');
  const [previewContent, setPreviewContent] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<MarkdownViewMode>(() =>
    normalizeMarkdownMode(settings.markdownDefaultMode)
  );
  const [showOutline, setShowOutline] = useState(false);
  const [showSourceLineNumbers, setShowSourceLineNumbers] = useState(true);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('autosaved');
  const [saveLabel, setSaveLabel] = useState<string>('Autosaved');
  const [findQuery, setFindQuery] = useState('');
  const [showPreviewFind, setShowPreviewFind] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const editorHandleRef = useRef<MarkdownEditorHandle | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!tab.fileId) return;
      const rec = await getWorkspaceFile(tab.fileId);
      if (!active) return;
      if (rec) {
        const text = rec.textContent ?? '';
        setContent(text);
        setPreviewContent(text);
        setSaveStatus('autosaved');
        setSaveLabel('Autosaved');
        setLoaded(true);
      }
    })();
    return () => {
      active = false;
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [tab.fileId]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [moreMenuOpen]);

  const outline = useMemo(() => extractMarkdownOutline(previewContent), [previewContent]);
  const stats = useMemo(() => countWordsAndChars(previewContent), [previewContent]);

  const persistLocalDraft = useCallback(
    async (textToSave: string) => {
      if (!tab.fileId) return;
      setSaveStatus('saving');
      setSaveLabel('Saving…');
      const rec = await getWorkspaceFile(tab.fileId);
      const filename = rec?.meta.name || tab.title || 'Untitled.md';
      const updatedMeta = {
        ...(rec?.meta || {
          id: tab.fileId,
          name: filename,
          kind: 'markdown' as const,
          folder: 'Notes',
        }),
        sizeBytes: new Blob([textToSave]).size,
        updatedAt: Date.now(),
      };
      await saveWorkspaceFile({
        id: tab.fileId,
        meta: updatedMeta,
        textContent: textToSave,
      });
      upsertWorkspaceFile(updatedMeta);
      updateTab(tab.id, { isDirty: false });
      setSaveStatus('autosaved');
      setSaveLabel('Autosaved');
    },
    [tab.fileId, tab.id, tab.title, updateTab, upsertWorkspaceFile]
  );

  const handleChange = useCallback(
    (next: string) => {
      setContent(next);
      setSaveStatus('unsaved');
      setSaveLabel('Unsaved');

      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(() => {
        setPreviewContent(next);
      }, 100);

      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        void persistLocalDraft(next);
      }, 900);

      if (!tab.isDirty) {
        updateTab(tab.id, { isDirty: true });
      }
    },
    [tab.id, tab.isDirty, updateTab, persistLocalDraft]
  );

  const handleSave = useCallback(
    async (saveAs = false) => {
      if (!tab.fileId) return;
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      setSaveStatus('saving');
      setSaveLabel('Saving…');

      const rec = await getWorkspaceFile(tab.fileId);
      const filename = rec?.meta.name || tab.title || 'Untitled.md';
      const updatedMeta = {
        ...(rec?.meta || {
          id: tab.fileId,
          name: filename,
          kind: 'markdown' as const,
          folder: 'Notes',
        }),
        sizeBytes: new Blob([content]).size,
        updatedAt: Date.now(),
      };

      await saveWorkspaceFile({
        id: tab.fileId,
        meta: updatedMeta,
        textContent: content,
      });

      const res = await saveTextDocument(tab.fileId, filename, content, saveAs);
      if (res.newFilename) {
        updatedMeta.name = res.newFilename;
        updateTab(tab.id, { title: res.newFilename });
      }
      if (saveAs && !res.savedToNativeFile) {
        addDownload({
          filename,
          url: `local://${filename}`,
          sizeBytes: updatedMeta.sizeBytes,
          progress: 100,
          status: 'completed',
          mimeType: 'text/markdown',
        });
      }

      upsertWorkspaceFile(updatedMeta);
      updateTab(tab.id, { isDirty: false });
      setSaveStatus('saved');
      setSaveLabel(res.savedToNativeFile ? 'Saved to disk' : saveAs ? 'Exported .md' : 'Saved');
    },
    [tab.fileId, tab.id, tab.title, content, updateTab, upsertWorkspaceFile, addDownload]
  );

  const handleExportZip = useCallback(async () => {
    if (!tab.fileId) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    setSaveStatus('saving');
    setSaveLabel('Bundling…');

    try {
      const rec = await getWorkspaceFile(tab.fileId);
      const filename = rec?.meta.name || tab.title || 'Untitled.md';
      const updatedMeta = {
        ...(rec?.meta || {
          id: tab.fileId,
          name: filename,
          kind: 'markdown' as const,
          folder: 'Notes',
        }),
        sizeBytes: new Blob([content]).size,
        updatedAt: Date.now(),
      };

      await saveWorkspaceFile({
        id: tab.fileId,
        meta: updatedMeta,
        textContent: content,
      });
      upsertWorkspaceFile(updatedMeta);
      updateTab(tab.id, { isDirty: false });

      const bundle = await exportMarkdownZipBundle({
        fileId: tab.fileId,
        filename,
        content,
        workspaceFiles: useWorkspaceStore.getState().workspaceFiles,
      });

      triggerBlobDownload(bundle.zipBlob, bundle.zipFilename);
      addDownload({
        filename: bundle.zipFilename,
        url: `local://${bundle.zipFilename}`,
        sizeBytes: bundle.zipBlob.size,
        progress: 100,
        status: 'completed',
        mimeType: 'application/zip',
      });

      setSaveStatus('saved');
      setSaveLabel(
        `Exported .zip (${bundle.bundledPaths.length} ${bundle.bundledPaths.length === 1 ? 'file' : 'files'})`
      );
    } catch {
      setSaveStatus('unsaved');
      setSaveLabel('Export failed');
    }
  }, [tab.fileId, tab.id, tab.title, content, updateTab, upsertWorkspaceFile, addDownload]);

  useEffect(() => {
    const onCommand = (e: Event) => {
      const detail = (e as CustomEvent<{ type: string; tabId: string }>).detail;
      if (!detail || detail.tabId !== tab.id) return;
      if (detail.type === 'save') {
        void handleSave(false);
      } else if (detail.type === 'save-as') {
        void handleSave(true);
      } else if (detail.type === 'find') {
        if (viewMode === 'read') {
          setShowPreviewFind((s) => !s);
        } else {
          setSearchTrigger((n) => n + 1);
        }
      }
    };
    window.addEventListener('folio:command', onCommand);
    return () => window.removeEventListener('folio:command', onCommand);
  }, [tab.id, handleSave, viewMode]);

  const handleModeSwitch = useCallback(
    (nextMode: MarkdownViewMode) => {
      setPreviewContent(content);
      setViewMode(nextMode);
      if (nextMode !== 'read') {
        requestAnimationFrame(() => editorHandleRef.current?.focus());
      }
    },
    [content]
  );

  const handleFormatAction = useCallback(
    (action: MarkdownFormatAction, payload?: MarkdownActionPayload) => {
      editorHandleRef.current?.applyAction(action, payload);
    },
    []
  );

  const handleOpenLink = useCallback((url: string) => {
    if (/^https?:\/\//i.test(url)) {
      useWorkspaceStore.getState().openNewTab('browser', { url, title: url });
      return;
    }
    const store = useWorkspaceStore.getState();
    const matched = matchWorkspaceFileByReference(url, store.workspaceFiles);
    if (matched) {
      store.openFileInTab(matched);
    }
  }, []);

  const handleEditorReady = useCallback((handle: MarkdownEditorHandle | null) => {
    editorHandleRef.current = handle;
  }, []);

  const jumpToHeading = (headingId: string, line: number) => {
    setScrollToLine(line);
    if (viewMode !== 'read') {
      editorHandleRef.current?.jumpToLine(line);
    } else if (previewRef.current) {
      const el = previewRef.current.querySelector(`[data-heading-id="${headingId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)]">
        Loading document…
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col min-h-0 bg-[var(--surface-canvas)]"
      data-markdown-mode={viewMode}
    >
      {/* Primary Document Header & Mode Switcher */}
      <div className="flex items-center justify-between h-10 px-3 border-b border-[var(--border-hairline)] bg-[var(--surface-chrome)] text-xs select-none gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Three-Mode Switcher: Live Preview (Default) / Source / Reading */}
          <div
            role="tablist"
            aria-label="Markdown editing mode"
            className="flex items-center p-0.5 rounded-md bg-[var(--surface-subtle)] border border-[var(--border-hairline)] shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'live'}
              onClick={() => handleModeSwitch('live')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                viewMode === 'live'
                  ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Live Preview</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'source'}
              onClick={() => handleModeSwitch('source')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                viewMode === 'source'
                  ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Source</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'read'}
              onClick={() => handleModeSwitch('read')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                viewMode === 'read'
                  ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Reading</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowOutline((v) => !v)}
            aria-label="Toggle document outline"
            aria-expanded={showOutline}
            className={`flex items-center gap-1 ml-1 px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
              showOutline
                ? 'bg-[var(--accent-soft)] text-[var(--accent-color)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
            }`}
          >
            <ListTree className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Outline</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (viewMode === 'read') setShowPreviewFind((s) => !s);
              else setSearchTrigger((n) => n + 1);
            }}
            aria-label="Find in document"
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] whitespace-nowrap"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Find</span>
          </button>
        </div>

        {/* Right: Save Status + Save + More Options */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            data-testid="markdown-save-status"
            className={`hidden sm:inline-flex items-center gap-1 text-[11px] mr-1 ${
              saveStatus === 'unsaved'
                ? 'text-amber-500 font-medium'
                : saveStatus === 'saved' || saveStatus === 'autosaved'
                  ? 'text-[var(--text-muted)]'
                  : 'text-[var(--text-muted)]'
            }`}
          >
            {(saveStatus === 'saved' || saveStatus === 'autosaved') && (
              <Check className="w-3 h-3 text-emerald-500" />
            )}
            <span>{saveLabel}</span>
          </span>

          <button
            type="button"
            onClick={() => void handleSave(false)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[var(--accent-color)] text-white hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <Save className="w-3 h-3" />
            <span>Save</span>
          </button>

          <button
            type="button"
            onClick={() => void handleExportZip()}
            title="Export document & linked assets as ZIP"
            aria-label="Export ZIP bundle"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[11px] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors whitespace-nowrap"
          >
            <Archive className="w-3 h-3 text-sky-400" />
            <span className="hidden sm:inline">Export</span>
          </button>

          <div ref={moreMenuRef} className="relative">
            <button
              type="button"
              aria-label="Document options"
              aria-expanded={moreMenuOpen}
              onClick={() => setMoreMenuOpen((v) => !v)}
              className={`flex items-center justify-center w-7 h-7 rounded-md border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors ${
                moreMenuOpen ? 'bg-[var(--surface-subtle)] text-[var(--text-primary)]' : ''
              }`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {moreMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-50 w-64 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] shadow-xl p-1.5 text-xs">
                <div className="px-2.5 py-2 mb-1 rounded bg-[var(--surface-subtle)] text-[11px] text-[var(--text-secondary)]">
                  <div className="font-medium text-[var(--text-primary)] truncate mb-1">
                    {tab.title}
                  </div>
                  <div className="flex items-center justify-between tabular-nums text-[var(--text-muted)]">
                    <span>{stats.words} words</span>
                    <span>{stats.chars} chars</span>
                    <span>{stats.lines} lines</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowSourceLineNumbers((v) => !v);
                    setMoreMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                >
                  <span className="flex items-center gap-2">
                    <Hash className="w-3.5 h-3.5" />
                    <span>Source Line Numbers</span>
                  </span>
                  <span className="text-[10px] font-medium text-[var(--accent-color)]">
                    {showSourceLineNumbers ? 'On' : 'Off'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    updateSettings({ markdownWordWrap: !settings.markdownWordWrap });
                    setMoreMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                >
                  <span className="flex items-center gap-2">
                    <WrapText className="w-3.5 h-3.5" />
                    <span>Word Wrap</span>
                  </span>
                  <span className="text-[10px] font-medium text-[var(--accent-color)]">
                    {settings.markdownWordWrap ? 'On' : 'Off'}
                  </span>
                </button>

                <div className="my-1 border-t border-[var(--border-hairline)]" />

                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    void handleExportZip();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                >
                  <Archive className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium">Export Bundle (.zip)</span>
                    <span className="block text-[10px] text-[var(--text-muted)]">
                      Doc + linked images &amp; assets
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    void handleSave(true);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save As (.md only)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compact Contextual Formatting Bar (shown in Live Preview & Source, hidden in Reading) */}
      {(viewMode === 'live' || viewMode === 'source') && (
        <MarkdownFormattingBar onAction={handleFormatAction} />
      )}

      {/* Optional Find Bar for Reading Mode */}
      {showPreviewFind && viewMode === 'read' && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-xs">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            placeholder="Find text in reading view..."
            autoFocus
            className="flex-1 bg-transparent text-[var(--text-primary)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setFindQuery('');
              setShowPreviewFind(false);
            }}
            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Close
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Document Outline Sidebar */}
        {showOutline && (
          <div className="w-56 shrink-0 border-r border-[var(--border-hairline)] bg-[var(--surface-chrome)] overflow-y-auto p-3">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-2">
              Table of Contents
            </div>
            {outline.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No headings found.</p>
            ) : (
              <nav className="space-y-0.5">
                {outline.map((h) => (
                  <button
                    key={`${h.id}-${h.line}`}
                    type="button"
                    onClick={() => jumpToHeading(h.id, h.line)}
                    style={{ paddingLeft: `${(h.level - 1) * 10 + 6}px` }}
                    className="w-full text-left py-1 pr-2 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] truncate block"
                  >
                    {h.text}
                  </button>
                ))}
              </nav>
            )}
          </div>
        )}

        {/* Single-Pane WYSIWYG Live Preview OR Raw Source Mode */}
        {(viewMode === 'live' || viewMode === 'source') && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <CodeMirrorEditor
              value={content}
              onChange={handleChange}
              mode={viewMode}
              isDark={isDark}
              fontSize={settings.markdownFontSize}
              lineHeight={settings.markdownLineHeight}
              wordWrap={settings.markdownWordWrap}
              showLineNumbers={showSourceLineNumbers}
              scrollToLine={scrollToLine}
              searchTrigger={searchTrigger}
              onOpenLink={handleOpenLink}
              onSaveShortcut={() => void handleSave(false)}
              onEditorReady={handleEditorReady}
            />
          </div>
        )}

        {/* Distraction-Free Reading Mode */}
        {viewMode === 'read' && (
          <div ref={previewRef} className="flex-1 min-h-0 overflow-y-auto bg-[var(--surface-canvas)]">
            <MarkdownPreviewPane content={previewContent} findQuery={findQuery} />
          </div>
        )}
      </div>

      {/* Quiet Bottom Status Strip */}
      <div className="flex items-center justify-between h-6 px-3 border-t border-[var(--border-hairline)] bg-[var(--surface-chrome)] text-[11px] text-[var(--text-muted)] tabular-nums select-none">
        <span className="truncate">{tab.title}</span>
        <span className="shrink-0">
          {stats.words} words · {stats.chars} chars · {stats.readingTimeMinutes} min read
        </span>
      </div>
    </div>
  );
}
