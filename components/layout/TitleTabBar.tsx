'use client';

import React, { useState } from 'react';
import {
  FileText,
  FileCode2,
  FileSpreadsheet,
  Globe,
  Layers,
  Plus,
  RotateCcw,
  Settings,
  Sun,
  Moon,
  X,
  Compass,
  Loader2,
} from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { TabItem } from '@/types/workspace';

interface TitleTabBarProps {
  onOpenSettings: () => void;
}

function getTabIcon(tab: TabItem) {
  if (tab.isLoading) {
    return <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-color)] shrink-0" />;
  }
  switch (tab.type) {
    case 'pdf':
      return <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
    case 'markdown':
      return <FileCode2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    case 'spreadsheet':
      return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    case 'browser':
      return <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    case 'batch':
      return <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    case 'settings':
      return <Settings className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />;
    default:
      return <Compass className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />;
  }
}

export function TitleTabBar({ onOpenSettings }: TitleTabBarProps) {
  const {
    tabs,
    activeTabId,
    closedTabs,
    settings,
    setActiveTab,
    closeTab,
    openNewTab,
    reopenClosedTab,
    reorderTabs,
    updateSettings,
  } = useWorkspaceStore();

  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const toggleTheme = () => {
    const next = settings.theme === 'dark' ? 'light' : 'dark';
    updateSettings({ theme: next });
  };

  return (
    <div
      className="flex items-center h-9 px-2 gap-1 border-b border-[var(--border-hairline)] bg-[var(--surface-canvas)] select-none overflow-x-auto"
      role="tablist"
      aria-label="Workspace tabs"
    >
      {/* Workspace Brand & Settings Button */}
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Folio workspace settings"
        title="Folio — Workspace settings"
        className="group flex items-center gap-1.5 h-7 px-2 mr-1 rounded-md text-xs font-semibold tracking-tight text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] active:bg-[var(--surface-chrome)] transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]"
      >
        <span className="font-display whitespace-nowrap">Folio</span>
        <Settings className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors shrink-0" />
      </button>

      {/* Tabs Strip */}
      <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-scrollbar">
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const isSuspended = !isActive && tab.lifecycleState === 'suspended';
          return (
            <div
              key={tab.id}
              draggable
              onDragStart={() => setDragIdx(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx !== null && dragIdx !== index) {
                  reorderTabs(dragIdx, index);
                }
                setDragIdx(null);
              }}
              className={`group flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-md text-xs transition-colors max-w-[200px] min-w-[110px] shrink-0 border ${
                isActive
                  ? 'bg-[var(--surface-chrome)] text-[var(--text-primary)] border-[var(--border-strong)]'
                  : isSuspended
                    ? 'bg-transparent text-[var(--text-muted)] opacity-60 border-transparent hover:opacity-100 hover:bg-[var(--surface-subtle)]'
                    : 'bg-transparent text-[var(--text-secondary)] border-transparent hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]'
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 flex-1 min-w-0 text-left focus-visible:outline-none"
                title={
                  isSuspended
                    ? `${tab.title} — Suspended to save memory (click to restore)`
                    : tab.url
                      ? `${tab.title} — ${tab.url}`
                      : tab.title
                }
              >
                {getTabIcon(tab)}
                <span className="truncate whitespace-nowrap font-medium">
                  {tab.title || 'Untitled'}
                </span>
                {tab.isDirty && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)] shrink-0"
                    title="Unsaved changes"
                    aria-label="Unsaved changes"
                  />
                )}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                aria-label={`Close tab ${tab.title}`}
                className={`p-0.5 rounded hover:bg-[var(--surface-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-opacity ${
                  isActive ? 'opacity-80 hover:opacity-100' : 'opacity-0 group-hover:opacity-80'
                }`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => openNewTab('home')}
          aria-label="New tab"
          title="New tab (Ctrl/Cmd+T)"
          className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right Utility Controls */}
      <div className="flex items-center gap-1 shrink-0 pl-2">
        {closedTabs.length > 0 && (
          <button
            type="button"
            onClick={reopenClosedTab}
            aria-label="Reopen closed tab"
            title="Reopen closed tab (Ctrl/Cmd+Shift+T)"
            className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={settings.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={settings.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors"
        >
          {settings.theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}
