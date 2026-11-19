'use client';

import React, { useState } from 'react';
import { Activity, Check, Keyboard, Monitor, Moon, Sun, Trash2, X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { clearOriginCookiesAndCaches, countOriginCookies } from '@/lib/storage';
import type { AccentColor, MarkdownViewMode, PdfLayoutMode, SearchEngine, ThemeMode } from '@/types/workspace';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onOpenDiagnostics?: () => void;
}

const SHORTCUTS = [
  { keys: 'Ctrl / Cmd + T', action: 'New tab' },
  { keys: 'Ctrl / Cmd + W', action: 'Close current tab' },
  { keys: 'Ctrl / Cmd + Shift + T', action: 'Reopen closed tab' },
  { keys: 'Ctrl / Cmd + L', action: 'Focus address / search bar' },
  { keys: 'Ctrl / Cmd + O', action: 'Open local file' },
  { keys: 'Ctrl / Cmd + S', action: 'Save current Markdown or PDF' },
  { keys: 'Ctrl / Cmd + Shift + S', action: 'Save As / Export copy' },
  { keys: 'Ctrl / Cmd + F', action: 'Find in document' },
  { keys: 'Ctrl / Cmd + Shift + D', action: 'Toggle Performance Diagnostics (Developer)' },
  { keys: 'Escape', action: 'Close active dialog' },
];

export function SettingsDialog({ open, onClose, onOpenDiagnostics }: SettingsDialogProps) {
  const { settings, history, updateSettings, clearHistory, clearSiteDataForHost } = useWorkspaceStore();
  const [section, setSection] = useState<'appearance' | 'browser' | 'markdown' | 'pdf' | 'shortcuts'>('appearance');
  const [dataClearedNotice, setDataClearedNotice] = useState<string | null>(null);
  const [cookieCount, setCookieCount] = useState(() => countOriginCookies());

  if (!open) return null;

  const handleClearAllSiteData = async () => {
    const { clearedCookies } = await clearOriginCookiesAndCaches();
    const clearedHist = clearSiteDataForHost('*');
    setCookieCount(countOriginCookies());
    setDataClearedNotice(
      `Cleared ${clearedCookies} cookie(s), cache, and ${clearedHist} browsing history item(s).`
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="w-full max-w-2xl h-[74vh] flex flex-col rounded-xl border border-[var(--border-strong)] bg-[var(--surface-chrome)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-hairline)]">
          <h2 id="settings-title" className="text-sm font-semibold text-[var(--text-primary)]">
            Workspace Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Left Settings Nav */}
          <nav className="w-44 shrink-0 border-r border-[var(--border-hairline)] p-2.5 space-y-0.5 text-xs">
            {[
              { id: 'appearance' as const, label: 'Appearance' },
              { id: 'browser' as const, label: 'Browser & General' },
              { id: 'markdown' as const, label: 'Markdown' },
              { id: 'pdf' as const, label: 'PDF Studio' },
              { id: 'shortcuts' as const, label: 'Shortcuts' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full text-left px-3 py-2 rounded-md font-medium transition-colors ${
                  section === item.id
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-color)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Right Panel */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
            {section === 'appearance' && (
              <>
                <div>
                  <div className="font-semibold text-[var(--text-primary)] mb-2">Theme Mode</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'light' as ThemeMode, label: 'Light', icon: Sun },
                      { id: 'dark' as ThemeMode, label: 'Dark', icon: Moon },
                      { id: 'system' as ThemeMode, label: 'System', icon: Monitor },
                    ].map((t) => {
                      const Icon = t.icon;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => updateSettings({ theme: t.id })}
                          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border font-medium ${
                            settings.theme === t.id
                              ? 'border-[var(--accent-color)] bg-[var(--accent-soft)] text-[var(--accent-color)]'
                              : 'border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)]'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="font-semibold text-[var(--text-primary)] mb-2">Accent Color</div>
                  <div className="flex items-center gap-2.5">
                    {(
                      [
                        { id: 'blue', hex: '#3b82f6' },
                        { id: 'indigo', hex: '#6366f1' },
                        { id: 'emerald', hex: '#10b981' },
                        { id: 'amber', hex: '#f59e0b' },
                        { id: 'rose', hex: '#f43f5e' },
                        { id: 'slate', hex: '#64748b' },
                      ] as Array<{ id: AccentColor; hex: string }>
                    ).map((ac) => (
                      <button
                        key={ac.id}
                        type="button"
                        onClick={() => updateSettings({ accentColor: ac.id })}
                        aria-label={`Accent color ${ac.id}`}
                        className={`w-7 h-7 rounded-full border transition-transform ${
                          settings.accentColor === ac.id
                            ? 'ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--surface-chrome)] scale-105'
                            : 'border-white/20'
                        }`}
                        style={{ backgroundColor: ac.hex }}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            {section === 'browser' && (
              <>
                <label className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-[var(--text-primary)]">Restore previous session</div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Reopen open workspace tabs automatically on startup.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.restoreSession}
                    onChange={(e) => updateSettings({ restoreSession: e.target.checked })}
                    className="accent-[var(--accent-color)]"
                  />
                </label>

                <div>
                  <label className="block font-medium text-[var(--text-primary)] mb-1.5">
                    Default Search Engine
                  </label>
                  <select
                    value={settings.searchEngine}
                    onChange={(e) => updateSettings({ searchEngine: e.target.value as SearchEngine })}
                    className="w-full h-8 px-2.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)]"
                  >
                    <option value="duckduckgo">DuckDuckGo</option>
                    <option value="google">Google</option>
                    <option value="bing">Bing</option>
                    <option value="custom">Custom Search URL</option>
                  </select>
                </div>

                {settings.searchEngine === 'custom' && (
                  <div>
                    <label className="block font-medium text-[var(--text-primary)] mb-1.5">
                      Custom Search Template (use {'{query}'})
                    </label>
                    <input
                      type="text"
                      value={settings.customSearchUrl}
                      onChange={(e) => updateSettings({ customSearchUrl: e.target.value })}
                      className="w-full h-8 px-2.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)]"
                    />
                  </div>
                )}

                <div className="pt-3 border-t border-[var(--border-hairline)] space-y-2.5">
                  <div className="font-semibold text-[var(--text-primary)]">
                    Privacy, Cookies &amp; Site Data
                  </div>
                  <div className="p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] space-y-1 text-[11px] text-[var(--text-secondary)] tabular-nums">
                    <div className="flex justify-between">
                      <span>Origin cookies</span>
                      <span className="text-[var(--text-primary)] font-medium">{cookieCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Browsing history records</span>
                      <span className="text-[var(--text-primary)] font-medium">{history.length}</span>
                    </div>
                  </div>

                  {dataClearedNotice && (
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-[11px]">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>{dataClearedNotice}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleClearAllSiteData()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 font-medium transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear all site data &amp; cookies</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearHistory();
                        setDataClearedNotice('Cleared browsing history.');
                      }}
                      className="px-3 py-1.5 rounded-md border border-[var(--border-hairline)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors"
                    >
                      Clear Browsing History
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--border-hairline)] space-y-3">
                  <div className="font-semibold text-[var(--text-primary)]">
                    Memory &amp; Tab Lifecycle
                  </div>

                  <label className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-[var(--text-primary)]">
                        Auto-suspend inactive tabs
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Unloads idle browser and document views while keeping unsaved or loading tabs protected.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.autoSuspendTabs}
                      onChange={(e) => updateSettings({ autoSuspendTabs: e.target.checked })}
                      className="accent-[var(--accent-color)]"
                    />
                  </label>

                  {settings.autoSuspendTabs && (
                    <div>
                      <label className="block font-medium text-[var(--text-primary)] mb-1.5">
                        Suspend Inactive Tabs After
                      </label>
                      <select
                        value={settings.autoSuspendMinutes}
                        onChange={(e) => updateSettings({ autoSuspendMinutes: Number(e.target.value) })}
                        className="w-full h-8 px-2.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)]"
                      >
                        <option value={1}>1 minute</option>
                        <option value={5}>5 minutes</option>
                        <option value={15}>15 minutes (Recommended)</option>
                        <option value={30}>30 minutes</option>
                        <option value={60}>60 minutes</option>
                      </select>
                    </div>
                  )}

                  <label className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-[var(--text-primary)]">
                        Developer Performance Diagnostics
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Enables on-demand memory, canvas, worker, and tab lifecycle inspection (Ctrl/Cmd+Shift+D).
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.developerDiagnostics}
                      onChange={(e) => updateSettings({ developerDiagnostics: e.target.checked })}
                      className="accent-[var(--accent-color)]"
                    />
                  </label>

                  {settings.developerDiagnostics && onOpenDiagnostics && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenDiagnostics();
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border-hairline)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] font-medium transition-colors"
                    >
                      <Activity className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                      <span>Open Performance Diagnostics</span>
                    </button>
                  )}
                </div>
              </>
            )}

            {section === 'markdown' && (
              <>
                <div>
                  <label className="block font-medium text-[var(--text-primary)] mb-1.5">
                    Default View Mode
                  </label>
                  <select
                    value={settings.markdownDefaultMode}
                    onChange={(e) =>
                      updateSettings({ markdownDefaultMode: e.target.value as MarkdownViewMode })
                    }
                    className="w-full h-8 px-2.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)]"
                  >
                    <option value="live">Live Preview (Default)</option>
                    <option value="source">Source Mode</option>
                    <option value="read">Reading Mode</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-[var(--text-primary)]">Editor Font Size</span>
                    <span className="tabular-nums">{settings.markdownFontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={20}
                    value={settings.markdownFontSize}
                    onChange={(e) => updateSettings({ markdownFontSize: Number(e.target.value) })}
                    className="w-full accent-[var(--accent-color)]"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-[var(--text-primary)]">Line Height</span>
                    <span className="tabular-nums">{settings.markdownLineHeight}</span>
                  </div>
                  <input
                    type="range"
                    min={1.3}
                    max={2.0}
                    step={0.05}
                    value={settings.markdownLineHeight}
                    onChange={(e) => updateSettings({ markdownLineHeight: Number(e.target.value) })}
                    className="w-full accent-[var(--accent-color)]"
                  />
                </div>

                <label className="flex items-center justify-between">
                  <span className="font-medium text-[var(--text-primary)]">Word Wrap in Editor</span>
                  <input
                    type="checkbox"
                    checked={settings.markdownWordWrap}
                    onChange={(e) => updateSettings({ markdownWordWrap: e.target.checked })}
                    className="accent-[var(--accent-color)]"
                  />
                </label>
              </>
            )}

            {section === 'pdf' && (
              <>
                <div>
                  <label className="block font-medium text-[var(--text-primary)] mb-1.5">
                    Default Page Layout
                  </label>
                  <select
                    value={settings.pdfDefaultLayout}
                    onChange={(e) =>
                      updateSettings({ pdfDefaultLayout: e.target.value as PdfLayoutMode })
                    }
                    className="w-full h-8 px-2.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)]"
                  >
                    <option value="continuous">Continuous Scroll</option>
                    <option value="single">Single Page</option>
                    <option value="two-page">Two-Page Spread</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-[var(--text-primary)] mb-1.5">
                      Default Image Format
                    </label>
                    <select
                      value={settings.pdfDefaultExportFormat}
                      onChange={(e) =>
                        updateSettings({ pdfDefaultExportFormat: e.target.value as 'png' | 'jpeg' })
                      }
                      className="w-full h-8 px-2.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)]"
                    >
                      <option value="png">PNG (Lossless)</option>
                      <option value="jpeg">JPEG</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-[var(--text-primary)] mb-1.5">
                      Default Export DPI
                    </label>
                    <select
                      value={settings.pdfDefaultExportDpi}
                      onChange={(e) =>
                        updateSettings({ pdfDefaultExportDpi: Number(e.target.value) })
                      }
                      className="w-full h-8 px-2.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)]"
                    >
                      <option value={72}>72 DPI</option>
                      <option value={150}>150 DPI</option>
                      <option value={200}>200 DPI</option>
                      <option value={300}>300 DPI</option>
                      <option value={600}>600 DPI</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {section === 'shortcuts' && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)] mb-2">
                  <Keyboard className="w-4 h-4" />
                  <span>Keyboard Shortcuts</span>
                </div>
                <div className="divide-y divide-[var(--border-hairline)] border border-[var(--border-hairline)] rounded-lg overflow-hidden">
                  {SHORTCUTS.map((s) => (
                    <div key={s.keys} className="flex items-center justify-between px-3 py-2">
                      <span className="text-[var(--text-primary)]">{s.action}</span>
                      <kbd className="px-2 py-0.5 rounded bg-[var(--surface-subtle)] border border-[var(--border-hairline)] font-mono text-[11px] text-[var(--text-secondary)]">
                        {s.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
