'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Cpu, Layers, PauseCircle, RefreshCw, Trash2, X } from 'lucide-react';
import { resourceManager, type ResourceSnapshot } from '@/lib/resourceManager';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { isTabEligibleForSuspension } from '@/lib/tabLifecycle';
import { formatBytes } from '@/lib/pageRange';

interface PerfDiagnosticsModalProps {
  open: boolean;
  onClose: () => void;
}

export function PerfDiagnosticsModal({ open, onClose }: PerfDiagnosticsModalProps) {
  const { tabs, activeTabId, suspendTab, suspendEligibleTabs } = useWorkspaceStore();
  const [snapshot, setSnapshot] = useState<ResourceSnapshot>(() => resourceManager.getSnapshot());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = resourceManager.subscribe(() => {
      setSnapshot(resourceManager.getSnapshot());
    });
    return unsubscribe;
  }, []);

  if (!open) return null;

  const activeCount = tabs.filter((t) => t.id === activeTabId).length;
  const suspendedCount = tabs.filter((t) => t.id !== activeTabId && t.lifecycleState === 'suspended').length;
  const inactiveCount = Math.max(0, tabs.length - activeCount - suspendedCount);

  const handleRefresh = () => {
    setSnapshot(resourceManager.getSnapshot());
    setStatusMessage('Snapshot refreshed.');
  };

  const handleReleaseCaches = () => {
    resourceManager.releaseIdleCaches();
    setSnapshot(resourceManager.getSnapshot());
    setStatusMessage('Cleared idle thumbnail LRU cache.');
  };

  const handleSuspendAllInactive = () => {
    let count = 0;
    for (const tab of tabs) {
      if (isTabEligibleForSuspension(tab, activeTabId)) {
        suspendTab(tab.id);
        count += 1;
      }
    }
    setSnapshot(resourceManager.getSnapshot());
    setStatusMessage(
      count > 0
        ? `Suspended ${count} eligible inactive tab(s).`
        : 'No eligible inactive tabs to suspend (active, loading, or unsaved tabs are protected).'
    );
  };

  const handleRunDueSuspension = () => {
    const count = suspendEligibleTabs();
    setSnapshot(resourceManager.getSnapshot());
    setStatusMessage(
      count > 0 ? `Suspended ${count} idle tab(s) past timeout.` : 'No tabs currently past auto-suspend deadline.'
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="perf-diagnostics-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-[var(--border-strong)] bg-[var(--surface-chrome)] shadow-2xl overflow-hidden text-xs">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-hairline)]">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--accent-color)]" />
            <h2 id="perf-diagnostics-title" className="text-sm font-semibold text-[var(--text-primary)]">
              Developer Performance &amp; Resource Diagnostics
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close diagnostics"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* JS Heap Section */}
          <div className="p-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                <Cpu className="w-3.5 h-3.5 text-sky-400" />
                JS Renderer Heap (Chromium)
              </span>
              <span className="tabular-nums font-medium text-[var(--text-primary)]">
                {snapshot.jsHeapUsedBytes !== null
                  ? `${formatBytes(snapshot.jsHeapUsedBytes)} / ${formatBytes(snapshot.jsHeapTotalBytes || 0)}`
                  : 'Unavailable in this browser'}
              </span>
            </div>
            {snapshot.jsHeapLimitBytes !== null && (
              <div className="flex justify-between text-[11px] text-[var(--text-muted)] tabular-nums">
                <span>JS Heap Limit</span>
                <span>{formatBytes(snapshot.jsHeapLimitBytes)}</span>
              </div>
            )}
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              JS heap measures the main renderer process only; sandboxed frame processes and GPU canvas textures are managed separately by the browser.
            </p>
          </div>

          {/* Tab Lifecycle & Tracked Resources */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] space-y-1.5 tabular-nums">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)] mb-1">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Tab Lifecycle ({tabs.length})</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--text-secondary)]">Active</span>
                <span className="text-[var(--text-primary)] font-medium">{activeCount}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--text-secondary)]">Inactive</span>
                <span className="text-[var(--text-primary)] font-medium">{inactiveCount}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--text-secondary)]">Suspended</span>
                <span className="text-[var(--text-primary)] font-medium">{suspendedCount}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--text-secondary)]">Active Frames</span>
                <span className="text-[var(--text-primary)] font-medium">{snapshot.activeFrames}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] space-y-1.5 tabular-nums">
              <div className="font-semibold text-[var(--text-primary)] mb-1">
                PDF, Canvas &amp; Cache Pools
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--text-secondary)]">Open PDFs / Workers</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {snapshot.openPdfDocs} / {snapshot.activePdfWorkers}
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--text-secondary)]">Rendered Canvases</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {snapshot.renderedCanvases} ({formatBytes(snapshot.canvasEstimatedBytes)})
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--text-secondary)]">Thumbnail LRU</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {snapshot.cachedThumbnails}/24 ({formatBytes(snapshot.cachedThumbnailBytes)})
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--text-secondary)]">Blob URLs / Jobs</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {snapshot.trackedObjectUrls} / {snapshot.runningExportJobs}
                </span>
              </div>
            </div>
          </div>

          {statusMessage && (
            <div className="px-3 py-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[11px] text-[var(--text-secondary)]">
              {statusMessage}
            </div>
          )}

          {/* Action Controls */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] font-medium"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleSuspendAllInactive}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] font-medium"
            >
              <PauseCircle className="w-3.5 h-3.5" />
              <span>Suspend Inactive Tabs</span>
            </button>
            <button
              type="button"
              onClick={handleRunDueSuspension}
              className="px-3 py-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium"
            >
              Check Due Timeouts
            </button>
            <button
              type="button"
              onClick={handleReleaseCaches}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Release Idle Caches</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
