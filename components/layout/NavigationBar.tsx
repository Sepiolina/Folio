'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Cookie,
  Download,
  LayoutGrid,
  Lock,
  PanelLeft,
  RotateCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  Globe,
  FileText,
  FileCode2,
  FileSpreadsheet,
} from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import {
  openFilesWithPicker,
  openMarkdownFilesWithPicker,
  createNewMarkdownFile,
  createNewSpreadsheetFile,
} from '@/lib/fileOpener';
import { clearOriginCookiesAndCaches, countOriginCookies } from '@/lib/storage';
import { getSiteConnectionInfo, urlMatchesHost } from '@/lib/urlUtils';
import {
  buildBatchToolsUrl,
  buildMarkdownTemplateContent,
  type BatchOp,
  type MarkdownTemplateKind,
} from '@/lib/toolsHelper';
import { DownloadsPopover } from './DownloadsPopover';
import { ToolsPopover } from './ToolsPopover';

interface NavigationBarProps {
  addressInputRef: React.RefObject<HTMLInputElement | null>;
  onTriggerReload?: () => void;
}

export function NavigationBar({ addressInputRef, onTriggerReload }: NavigationBarProps) {
  const {
    tabs,
    activeTabId,
    bookmarks,
    history,
    downloads,
    workspaceFiles,
    sidebarOpen,
    navigateBrowserTab,
    goBackTab,
    goForwardTab,
    toggleBookmarkForUrl,
    toggleSidebar,
    setSidebarSection,
    openFileInTab,
    upsertWorkspaceFile,
    openNewTab,
    updateTab,
    setActiveTab,
    clearSiteDataForHost,
    clearDownloads,
  } = useWorkspaceStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const [draftValue, setDraftValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [siteInfoOpen, setSiteInfoOpen] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [encryptionDetailsOpen, setEncryptionDetailsOpen] = useState(false);
  const [cookiesDropdownOpen, setCookiesDropdownOpen] = useState(true);
  const [cookieCount, setCookieCount] = useState(0);
  const [clearedNotice, setClearedNotice] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const downloadsAreaRef = useRef<HTMLDivElement>(null);

  const derivedValue = !activeTab
    ? ''
    : activeTab.type === 'browser'
      ? activeTab.url || ''
      : activeTab.type === 'markdown' || activeTab.type === 'pdf' || activeTab.type === 'spreadsheet'
        ? activeTab.title
        : activeTab.type === 'batch'
          ? 'folio://pdf-batch-tools'
          : '';

  const inputValue = focused ? draftValue : derivedValue;

  const canGoBack =
    activeTab?.type === 'browser' && (activeTab.browserHistoryIndex ?? 0) > 0;
  const canGoForward =
    activeTab?.type === 'browser' &&
    activeTab.browserHistoryIndex < (activeTab.browserHistory?.length ?? 0) - 1;

  const isHttps = activeTab?.type === 'browser' && activeTab.url?.startsWith('https://');
  const isHttp = activeTab?.type === 'browser' && activeTab.url?.startsWith('http://');
  const isBookmarked =
    activeTab?.type === 'browser' &&
    Boolean(activeTab.url && bookmarks.some((b) => b.url === activeTab.url));

  const siteInfo = React.useMemo(
    () => getSiteConnectionInfo(activeTab?.url, activeTab?.type),
    [activeTab?.url, activeTab?.type]
  );

  const hostHistoryCount = React.useMemo(() => {
    if (siteInfo.status === 'local') return history.length;
    return history.filter((h) => urlMatchesHost(h.url, siteInfo.host)).length;
  }, [history, siteInfo]);

  useEffect(() => {
    if (!siteInfoOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        setSiteInfoOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSiteInfoOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [siteInfoOpen]);

  useEffect(() => {
    if (!downloadsOpen && !toolsOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (downloadsAreaRef.current && !downloadsAreaRef.current.contains(e.target as Node)) {
        setDownloadsOpen(false);
        setToolsOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDownloadsOpen(false);
        setToolsOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [downloadsOpen, toolsOpen]);

  const handleToggleSiteInfo = () => {
    setDownloadsOpen(false);
    setToolsOpen(false);
    setSiteInfoOpen((prev) => {
      const next = !prev;
      if (next) {
        setCookieCount(countOriginCookies());
        setClearedNotice(null);
      }
      return next;
    });
  };

  const handleClearHostSiteData = async () => {
    if (siteInfo.status === 'local') return;
    await clearOriginCookiesAndCaches();
    const clearedHist = clearSiteDataForHost(siteInfo.host);
    setCookieCount(countOriginCookies());
    setClearedNotice(
      `Cleared cookies, cache, and ${clearedHist} history item(s) for ${siteInfo.host}.`
    );
  };

  const suggestions = React.useMemo(() => {
    if (!focused) return [];
    const q = inputValue.trim().toLowerCase();
    const combined = [
      ...bookmarks.map((b) => ({ kind: 'bookmark' as const, title: b.title, url: b.url })),
      ...history.map((h) => ({ kind: 'history' as const, title: h.title, url: h.url })),
    ];
    const seen = new Set<string>();
    const out: Array<{ kind: 'bookmark' | 'history'; title: string; url: string }> = [];
    for (const item of combined) {
      if (seen.has(item.url)) continue;
      if (!q || item.title.toLowerCase().includes(q) || item.url.toLowerCase().includes(q)) {
        seen.add(item.url);
        out.push(item);
        if (out.length >= 6) break;
      }
    }
    return out;
  }, [focused, inputValue, bookmarks, history]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTab) return;
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setFocused(false);
    navigateBrowserTab(activeTab.id, trimmed);
  };

  const handleOpenLocalFiles = async () => {
    const opened = await openFilesWithPicker();
    for (const meta of opened) {
      upsertWorkspaceFile(meta);
      openFileInTab(meta);
    }
  };

  const handleOpenMarkdownFiles = async () => {
    const opened = await openMarkdownFilesWithPicker();
    for (const meta of opened) {
      upsertWorkspaceFile(meta);
      openFileInTab(meta, 'markdown');
    }
  };

  const handleNewMarkdown = async (template: MarkdownTemplateKind = 'blank') => {
    const stamp = new Date().toISOString().slice(11, 16).replace(':', '');
    const prefix = template === 'meeting' ? 'Meeting' : template === 'spec' ? 'Project_Doc' : 'Note';
    const filename = `${prefix}_${stamp}.md`;
    const body = buildMarkdownTemplateContent(template, filename);
    const meta = await createNewMarkdownFile(filename, body);
    upsertWorkspaceFile(meta);
    openFileInTab(meta, 'markdown');
  };

  const handleNewSheet = async () => {
    const stamp = new Date().toISOString().slice(11, 16).replace(':', '');
    const meta = await createNewSpreadsheetFile(`Sheet_${stamp}.xlsx`, 'xlsx');
    upsertWorkspaceFile(meta);
    openFileInTab(meta, 'spreadsheet');
  };

  const activeDownloadsCount = downloads.filter((d) => d.status === 'downloading').length;

  return (
    <div
      ref={containerRef}
      className="flex items-center h-11 px-2.5 gap-1.5 border-b border-[var(--border-hairline)] bg-[var(--surface-chrome)] select-none"
    >
      {/* Left Browser Navigation */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          disabled={!canGoBack}
          onClick={() => activeTab && goBackTab(activeTab.id)}
          aria-label="Back"
          title="Back"
          className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={!canGoForward}
          onClick={() => activeTab && goForwardTab(activeTab.id)}
          aria-label="Forward"
          title="Forward"
          className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={activeTab?.type !== 'browser'}
          onClick={() => onTriggerReload?.()}
          aria-label="Reload page"
          title="Reload"
          className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <RotateCw className={`w-3.5 h-3.5 ${activeTab?.isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Center Unified Address / Search Bar */}
      <form ref={formRef} onSubmit={handleSubmit} className="relative flex-1 min-w-0 max-w-4xl mx-auto">
        <div
          className={`flex items-center h-8 px-3 gap-2 rounded-lg border transition-colors ${
            focused
              ? 'bg-[var(--surface-elevated)] border-[var(--accent-color)]'
              : 'bg-[var(--surface-subtle)] border-transparent hover:border-[var(--border-hairline)]'
          }`}
        >
          <button
            type="button"
            onClick={handleToggleSiteInfo}
            aria-label="Site encryption and data info"
            aria-expanded={siteInfoOpen}
            title="View connection encryption, cookies, and site data"
            className={`flex items-center justify-center p-1 -ml-1 rounded transition-colors shrink-0 ${
              siteInfoOpen
                ? 'bg-[var(--surface-chrome)] text-[var(--text-primary)]'
                : 'hover:bg-[var(--surface-chrome)]'
            }`}
          >
            {activeTab?.type === 'pdf' ? (
              <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : activeTab?.type === 'markdown' ? (
              <FileCode2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            ) : activeTab?.type === 'spreadsheet' ? (
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : isHttps ? (
              <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-label="HTTPS secure" />
            ) : isHttp ? (
              <Unlock className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-label="Not encrypted (HTTP)" />
            ) : (
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            )}
          </button>

          <input
            ref={addressInputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onFocus={(e) => {
              setDraftValue(derivedValue);
              setFocused(true);
              requestAnimationFrame(() => e.target.select());
            }}
            onBlur={() => setTimeout(() => setFocused(false), 160)}
            placeholder="Search or type a URL"
            aria-label="Address and search bar"
            className="flex-1 min-w-0 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />

          {activeTab?.type === 'browser' && activeTab.url && !activeTab.url.startsWith('local://') && (
            <button
              type="button"
              onClick={() => toggleBookmarkForUrl(activeTab.url!, activeTab.title)}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              title={isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
              className="p-1 rounded hover:bg-[var(--surface-chrome)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0"
            >
              <Bookmark
                className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-amber-400 text-amber-400' : ''}`}
              />
            </button>
          )}
        </div>

        {/* Site Encryption & Cookies / Site Data Dropdown */}
        {siteInfoOpen && (
          <div
            role="dialog"
            aria-label="Site information and security"
            className="absolute left-0 top-9 z-40 w-80 max-w-[92vw] rounded-xl border border-[var(--border-strong)] bg-[var(--surface-elevated)] shadow-xl overflow-hidden text-xs"
          >
            {/* Header: Encryption Status */}
            <div className="p-3.5 border-b border-[var(--border-hairline)] space-y-1.5">
              <div className="flex items-center gap-2">
                {siteInfo.status === 'secure' ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : siteInfo.status === 'insecure' ? (
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <Lock className="w-4 h-4 text-[var(--accent-color)] shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--text-primary)]">
                    {siteInfo.headline}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                    {siteInfo.host}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                {siteInfo.subline}
              </p>

              {/* Expandable Encryption Details */}
              <button
                type="button"
                onClick={() => setEncryptionDetailsOpen((v) => !v)}
                aria-expanded={encryptionDetailsOpen}
                className="w-full flex items-center justify-between pt-1 text-[11px] font-medium text-[var(--accent-color)] hover:underline"
              >
                <span>Encryption & isolation details</span>
                {encryptionDetailsOpen ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>

              {encryptionDetailsOpen && (
                <div className="mt-1.5 p-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] space-y-1.5 text-[11px]">
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">Protocol</span>
                    <span className="text-[var(--text-primary)] font-medium text-right">
                      {siteInfo.protocolLabel}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">Sandbox</span>
                    <span className="text-[var(--text-primary)] text-right">
                      {siteInfo.isolationLabel}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">Cookie policy</span>
                    <span className="text-[var(--text-primary)] text-right">
                      {siteInfo.cookiePolicyLabel}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Dropdown Section: Cookies & Site Data */}
            <div className="p-2.5 space-y-2">
              <button
                type="button"
                onClick={() => setCookiesDropdownOpen((v) => !v)}
                aria-expanded={cookiesDropdownOpen}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-[var(--surface-subtle)] transition-colors"
              >
                <span className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
                  <Cookie className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  <span>Cookies & site data</span>
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] tabular-nums">
                  <span>
                    {cookieCount + hostHistoryCount}{' '}
                    {cookieCount + hostHistoryCount === 1 ? 'record' : 'records'}
                  </span>
                  {cookiesDropdownOpen ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </span>
              </button>

              {cookiesDropdownOpen && (
                <div className="px-2 pb-1 space-y-2">
                  <div className="p-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] space-y-1 text-[11px] text-[var(--text-secondary)] tabular-nums">
                    <div className="flex justify-between">
                      <span>Origin cookies</span>
                      <span className="text-[var(--text-primary)] font-medium">{cookieCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        {siteInfo.status === 'local' ? 'Recorded history' : `History (${siteInfo.host})`}
                      </span>
                      <span className="text-[var(--text-primary)] font-medium">{hostHistoryCount}</span>
                    </div>
                  </div>

                  {clearedNotice && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-[11px]">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>{clearedNotice}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {siteInfo.status !== 'local' ? (
                      <button
                        type="button"
                        onClick={() => void handleClearHostSiteData()}
                        className="w-full flex items-center justify-center gap-1.5 h-8 px-3 rounded-md bg-[var(--accent-color)] text-white text-[11px] font-medium hover:opacity-90 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear cookies & site data for {siteInfo.host}</span>
                      </button>
                    ) : (
                      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                        Local workspace tabs do not store site cookies. Manage global browsing data in Workspace Settings.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Address Bar Autocomplete Dropdown */}
        {focused && !siteInfoOpen && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-9 z-40 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] shadow-lg overflow-hidden py-1">
            {suggestions.map((item) => (
              <button
                key={item.url}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (activeTab) {
                    setFocused(false);
                    navigateBrowserTab(activeTab.id, item.url);
                  }
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs hover:bg-[var(--surface-subtle)] transition-colors"
              >
                {item.kind === 'bookmark' ? (
                  <Bookmark className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : (
                  <Globe className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                )}
                <span className="truncate font-medium text-[var(--text-primary)]">{item.title}</span>
                <span className="truncate text-[var(--text-muted)] ml-auto max-w-[45%]">
                  {item.url}
                </span>
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Right Workspace Actions */}
      <div ref={downloadsAreaRef} className="relative flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => {
            setSiteInfoOpen(false);
            setDownloadsOpen(false);
            setToolsOpen((prev) => !prev);
          }}
          aria-label="Tools"
          aria-expanded={toolsOpen}
          title="Workspace tools"
          className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            toolsOpen
              ? 'bg-[var(--accent-soft)] text-[var(--accent-color)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Tools</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSiteInfoOpen(false);
            setToolsOpen(false);
            setDownloadsOpen((prev) => !prev);
          }}
          aria-label="Downloads"
          aria-expanded={downloadsOpen}
          title="Downloads"
          className={`relative flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
            downloadsOpen
              ? 'bg-[var(--accent-soft)] text-[var(--accent-color)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          {activeDownloadsCount > 0 && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]" />
          )}
        </button>

        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          aria-expanded={sidebarOpen}
          title="Toggle workspace sidebar"
          className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
            sidebarOpen
              ? 'bg-[var(--accent-soft)] text-[var(--accent-color)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
          }`}
        >
          <PanelLeft className="w-3.5 h-3.5" />
        </button>

        {toolsOpen && (
          <ToolsPopover
            onClose={() => setToolsOpen(false)}
            onOpenFile={() => void handleOpenLocalFiles()}
            onOpenMarkdownFile={() => void handleOpenMarkdownFiles()}
            onNewNote={(tpl) => void handleNewMarkdown(tpl)}
            onNewSheet={() => void handleNewSheet()}
            onOpenBatchTools={(op?: BatchOp) => {
              const url = buildBatchToolsUrl(op);
              const existing = tabs.find((t) => t.type === 'batch');
              if (existing) {
                updateTab(existing.id, { url });
                setActiveTab(existing.id);
              } else {
                openNewTab('batch', { title: 'PDF Batch Tools', url });
              }
            }}
          />
        )}

        {downloadsOpen && (
          <DownloadsPopover
            downloads={downloads}
            workspaceFiles={workspaceFiles}
            onClose={() => setDownloadsOpen(false)}
            onOpenWorkspaceFile={(file) => openFileInTab(file)}
            onShowAllDownloads={() => setSidebarSection('downloads')}
            onClearDownloads={clearDownloads}
          />
        )}
      </div>
    </div>
  );
}
