'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  ExternalLink,
  Loader2,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { TabItem } from '@/types/workspace';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { getWorkspaceFile, triggerBlobDownload } from '@/lib/storage';
import { resourceManager } from '@/lib/resourceManager';
import { parseJsonSafely } from '@/lib/dynamicRetry';

interface BrowserTabViewProps {
  tab: TabItem;
  reloadSignal: number;
}

export function BrowserTabView({ tab, reloadSignal }: BrowserTabViewProps) {
  const { updateTab, recordHistory, navigateBrowserTab, addDownload, updateDownload } =
    useWorkspaceStore();
  const [srcDocHtml, setSrcDocHtml] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const tabTitleRef = useRef(tab.title);

  useEffect(() => {
    tabTitleRef.current = tab.title;
  }, [tab.title]);

  const loadContent = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setErrorMsg(null);

    // Local HTML or image asset stored in IndexedDB
    if (tab.fileId) {
      setLoading(true);
      updateTab(tab.id, { isLoading: true, error: null });
      try {
        const rec = await getWorkspaceFile(tab.fileId);
        if (controller.signal.aborted) return;
        if (!rec) {
          throw new Error('Local file not found in workspace storage.');
        }
        if (rec.meta.kind === 'asset' && rec.binaryContent) {
          const mime = rec.meta.mimeType || 'image/png';
          let binaryStr = '';
          const chunk = 0x8000;
          for (let i = 0; i < rec.binaryContent.length; i += chunk) {
            binaryStr += String.fromCharCode(...rec.binaryContent.subarray(i, i + chunk));
          }
          const dataUrl = `data:${mime};base64,${btoa(binaryStr)}`;
          const safeName = rec.meta.name
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          setSrcDocHtml(
            `<!DOCTYPE html><html><body style="margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#141417;color:#e4e4e7;font-family:system-ui,sans-serif;padding:24px;box-sizing:border-box;"><img src="${dataUrl}" alt="${safeName}" style="max-width:100%;max-height:80vh;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,0.45);" /><div style="margin-top:12px;font-size:12px;opacity:0.75;">${safeName}</div></body></html>`
          );
          updateTab(tab.id, { isLoading: false, title: rec.meta.name });
        } else if (rec.textContent !== undefined) {
          setSrcDocHtml(rec.textContent);
          updateTab(tab.id, { isLoading: false, title: rec.meta.name });
        } else {
          throw new Error('Local file content unavailable.');
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : 'Unable to open local file.';
        setErrorMsg(msg);
        updateTab(tab.id, { isLoading: false, error: msg });
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
      return;
    }

    if (!tab.url || tab.url === 'about:blank') return;

    setLoading(true);
    updateTab(tab.id, { isLoading: true, error: null });

    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(tab.url)}&mode=meta`, {
        signal: controller.signal,
      });
      const rawText = await res.text();
      if (controller.signal.aborted) return;
      const parsed = parseJsonSafely<{
        html?: string;
        title?: string;
        finalUrl?: string;
        error?: string;
      }>(rawText);
      if (!parsed.ok) {
        throw new Error(
          res.ok
            ? 'Received an unexpected non-JSON response from proxy.'
            : `Proxy error (HTTP ${res.status}).`
        );
      }
      const data = parsed.data;
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSrcDocHtml(data.html || '');
      const resolvedTitle = data.title || tabTitleRef.current;
      const finalUrl = data.finalUrl || tab.url;
      updateTab(tab.id, {
        isLoading: false,
        title: resolvedTitle,
        url: finalUrl,
        error: null,
      });
      if (!tab.privateMode) {
        recordHistory(finalUrl, resolvedTitle);
      }
    } catch (err) {
      if (
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === 'AbortError')
      ) {
        return;
      }
      const msg = err instanceof Error ? err.message : 'Failed to load website.';
      setErrorMsg(msg);
      updateTab(tab.id, { isLoading: false, error: msg });
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [tab.id, tab.url, tab.fileId, tab.privateMode, updateTab, recordHistory]);

  useEffect(() => {
    resourceManager.registerFrame(tab.id, tab.id);
    const id = setTimeout(() => {
      void loadContent();
    }, 0);
    return () => {
      clearTimeout(id);
      abortRef.current?.abort();
      abortRef.current = null;
      resourceManager.unregisterFrame(tab.id);
      setSrcDocHtml('');
    };
  }, [tab.id, tab.url, tab.fileId, reloadSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for link clicks inside proxied iframe
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'folio:navigate' && typeof e.data.url === 'string') {
        navigateBrowserTab(tab.id, e.data.url);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [tab.id, navigateBrowserTab]);

  const handleSaveSnapshotHtml = () => {
    if (!srcDocHtml) return;
    const filename = `${(tab.title || 'page').replace(/[^a-zA-Z0-9._-]+/g, '_')}.html`;
    const blob = new Blob([srcDocHtml], { type: 'text/html;charset=utf-8' });
    const dlId = addDownload({
      filename,
      url: tab.url || 'local://snapshot',
      sizeBytes: blob.size,
      progress: 100,
      status: 'completed',
      mimeType: 'text/html',
    });
    triggerBlobDownload(blob, filename);
    updateDownload(dlId, { status: 'completed', progress: 100 });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--surface-canvas)] relative">
      {/* Subtle Zoom & Page Utility Strip */}
      <div className="flex items-center justify-between h-8 px-3 border-b border-[var(--border-hairline)] bg-[var(--surface-chrome)] text-xs text-[var(--text-secondary)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate max-w-md text-[var(--text-muted)]">
            {tab.fileId ? `Local Sandbox · ${tab.title}` : tab.url}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => updateTab(tab.id, { zoom: Math.max(0.6, +(tab.zoom - 0.1).toFixed(2)) })}
            aria-label="Zoom out page"
            className="p-1 rounded hover:bg-[var(--surface-subtle)]"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="tabular-nums w-10 text-center text-[11px]">
            {Math.round((tab.zoom || 1) * 100)}%
          </span>
          <button
            type="button"
            onClick={() => updateTab(tab.id, { zoom: Math.min(1.8, +(tab.zoom + 0.1).toFixed(2)) })}
            aria-label="Zoom in page"
            className="p-1 rounded hover:bg-[var(--surface-subtle)]"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {srcDocHtml && (
            <button
              type="button"
              onClick={handleSaveSnapshotHtml}
              aria-label="Download HTML page"
              title="Download HTML snapshot"
              className="flex items-center gap-1 ml-2 px-2 py-0.5 rounded hover:bg-[var(--surface-subtle)] text-[11px]"
            >
              <Download className="w-3 h-3" />
              <span>Save HTML</span>
            </button>
          )}

          {tab.url && !tab.fileId && (
            <a
              href={tab.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 ml-1 px-2 py-0.5 rounded hover:bg-[var(--surface-subtle)] text-[11px]"
              title="Open directly in system browser tab"
            >
              <ExternalLink className="w-3 h-3" />
              <span>External</span>
            </a>
          )}
        </div>
      </div>

      {/* Main Viewport */}
      <div className="flex-1 relative min-h-0 overflow-auto bg-white">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--surface-canvas)]/80 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-color)]" />
              <span>Loading {tab.url || tab.title}…</span>
            </div>
          </div>
        )}

        {errorMsg ? (
          <div className="h-full flex flex-col items-center justify-center p-8 bg-[var(--surface-canvas)] text-center">
            <AlertCircle className="w-8 h-8 text-rose-400 mb-3" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
              Unable to load page in workspace frame
            </h3>
            <p className="text-xs text-[var(--text-muted)] max-w-md mb-4">{errorMsg}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadContent}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-chrome)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
              {tab.url && !tab.fileId && (
                <a
                  href={tab.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--accent-color)] text-xs font-medium text-white"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Externally</span>
                </a>
              )}
            </div>
          </div>
        ) : (
          <iframe
            title={tab.title || 'Browser content'}
            srcDoc={srcDocHtml}
            sandbox="allow-scripts allow-forms"
            style={{
              width: `${100 / (tab.zoom || 1)}%`,
              height: `${100 / (tab.zoom || 1)}%`,
              transform: `scale(${tab.zoom || 1})`,
              transformOrigin: '0 0',
            }}
            className="border-0 bg-white block"
          />
        )}
      </div>
    </div>
  );
}
