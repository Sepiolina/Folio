'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { ensureSampleWorkspaceSeeded } from '@/lib/sampleData';
import { ingestLocalFile, openFilesWithPicker } from '@/lib/fileOpener';
import { getNextSuspensionDelayMs } from '@/lib/tabLifecycle';
import { TitleTabBar } from '@/components/layout/TitleTabBar';
import { NavigationBar } from '@/components/layout/NavigationBar';
import { WorkspaceSidebar } from '@/components/layout/WorkspaceSidebar';
import { HomeTabView } from '@/components/browser/HomeTabView';
import { BrowserTabView } from '@/components/browser/BrowserTabView';
import { MarkdownTabView } from '@/components/markdown/MarkdownTabView';
import { PdfStudioView } from '@/components/pdf/PdfStudioView';
import { PdfBatchToolsView } from '@/components/pdf/PdfBatchToolsView';
import { SpreadsheetTabView } from '@/components/spreadsheet/SpreadsheetTabView';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { PerfDiagnosticsModal } from '@/components/diagnostics/PerfDiagnosticsModal';
import { ChunkErrorBoundary } from '@/components/app/ChunkErrorBoundary';

export function WorkspaceShell() {
  const {
    tabs,
    activeTabId,
    settings,
    setWorkspaceFiles,
    upsertWorkspaceFile,
    openFileInTab,
    openNewTab,
    closeTab,
    reopenClosedTab,
    suspendEligibleTabs,
  } = useWorkspaceStore();

  const addressInputRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [reloadSignal, setReloadSignal] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  // Seed default workspace files (Markdown, HTML, Multi-Page PDF, AcroForm PDF)
  useEffect(() => {
    ensureSampleWorkspaceSeeded()
      .then((files) => setWorkspaceFiles(files))
      .catch(() => {});
  }, [setWorkspaceFiles]);

  // Sync light / dark / system theme + accent attribute on <html>
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const shouldBeDark =
        settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
      root.classList.toggle('dark', shouldBeDark);
      root.setAttribute('data-accent', settings.accentColor);
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme, settings.accentColor]);

  // Event-driven next-deadline tab suspension timer (zero idle polling)
  useEffect(() => {
    if (!settings.autoSuspendTabs) return;
    const timeoutMs = Math.max(1, settings.autoSuspendMinutes) * 60 * 1000;
    const delayMs = getNextSuspensionDelayMs(tabs, activeTabId, timeoutMs, Date.now());
    if (delayMs === null) return;
    const timer = setTimeout(() => {
      suspendEligibleTabs();
    }, Math.max(250, delayMs));
    return () => clearTimeout(timer);
  }, [tabs, activeTabId, settings.autoSuspendTabs, settings.autoSuspendMinutes, suspendEligibleTabs]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (e.key === 'Escape') {
        setSettingsOpen(false);
        setDiagnosticsOpen(false);
        return;
      }

      if (!mod) return;

      if (key === 't' && !e.shiftKey) {
        e.preventDefault();
        openNewTab('home');
      } else if (key === 't' && e.shiftKey) {
        e.preventDefault();
        reopenClosedTab();
      } else if (key === 'w') {
        e.preventDefault();
        closeTab(activeTabId);
      } else if (key === 'l') {
        e.preventDefault();
        addressInputRef.current?.focus();
        addressInputRef.current?.select();
      } else if (key === 'o') {
        e.preventDefault();
        const files = await openFilesWithPicker();
        for (const f of files) {
          upsertWorkspaceFile(f);
          openFileInTab(f);
        }
      } else if (key === 's' && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('folio:command', { detail: { type: 'save', tabId: activeTabId } }));
      } else if (key === 's' && e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('folio:command', { detail: { type: 'save-as', tabId: activeTabId } }));
      } else if (key === 'f') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('folio:command', { detail: { type: 'find', tabId: activeTabId } }));
      } else if (key === 'd' && e.shiftKey && settings.developerDiagnostics) {
        e.preventDefault();
        setDiagnosticsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTabId,
    settings.developerDiagnostics,
    openNewTab,
    reopenClosedTab,
    closeTab,
    upsertWorkspaceFile,
    openFileInTab,
  ]);

  const handleGlobalDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    for (const file of files) {
      const meta = await ingestLocalFile(file);
      upsertWorkspaceFile(meta);
      openFileInTab(meta);
    }
  };

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragActive(true);
        }
      }}
      onDragLeave={() => setDragActive(false)}
      onDropCapture={() => setDragActive(false)}
      onDrop={handleGlobalDrop}
      className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--surface-canvas)] text-[var(--text-primary)] relative"
    >
      <TitleTabBar onOpenSettings={() => setSettingsOpen(true)} />
      <NavigationBar
        addressInputRef={addressInputRef}
        onTriggerReload={() => setReloadSignal((n) => n + 1)}
      />

      <main className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
        <WorkspaceSidebar />

        <ChunkErrorBoundary resetKey={activeTab?.id}>
          {activeTab?.type === 'home' && <HomeTabView tabId={activeTab.id} />}
          {activeTab?.type === 'browser' && (
            <BrowserTabView key={activeTab.id} tab={activeTab} reloadSignal={reloadSignal} />
          )}
          {activeTab?.type === 'markdown' && (
            <MarkdownTabView key={activeTab.id} tab={activeTab} />
          )}
          {activeTab?.type === 'pdf' && (
            <PdfStudioView key={activeTab.id} tab={activeTab} />
          )}
          {activeTab?.type === 'spreadsheet' && (
            <SpreadsheetTabView key={activeTab.id} tab={activeTab} />
          )}
          {activeTab?.type === 'batch' && <PdfBatchToolsView tabUrl={activeTab.url} />}
        </ChunkErrorBoundary>
      </main>

      {dragActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 pointer-events-none">
          <div className="px-6 py-4 rounded-xl border border-[var(--accent-color)] bg-[var(--surface-chrome)] text-sm font-medium text-[var(--text-primary)] shadow-xl">
            Drop PDF, Spreadsheet, Markdown, or HTML file to open in Folio
          </div>
        </div>
      )}

      {settingsOpen && (
        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
        />
      )}

      {diagnosticsOpen && settings.developerDiagnostics && (
        <PerfDiagnosticsModal
          open={diagnosticsOpen}
          onClose={() => setDiagnosticsOpen(false)}
        />
      )}
    </div>
  );
}
