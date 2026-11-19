'use client';

import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { isChunkLoadError } from '@/lib/dynamicRetry';

interface ChunkErrorBoundaryProps {
  resetKey?: string;
  children: React.ReactNode;
}

interface ChunkErrorBoundaryState {
  error: Error | null;
}

export class ChunkErrorBoundary extends React.Component<
  ChunkErrorBoundaryProps,
  ChunkErrorBoundaryState
> {
  constructor(props: ChunkErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ChunkErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (typeof window !== 'undefined' && isChunkLoadError(error)) {
      try {
        const key = 'folio:chunk-reload-ts';
        const last = Number(window.sessionStorage.getItem(key) || '0');
        if (!last || Date.now() - last > 15000) {
          window.sessionStorage.setItem(key, String(Date.now()));
          window.location.reload();
        }
      } catch {
        // Ignore sessionStorage restrictions and keep fallback UI
      }
    }
  }

  componentDidUpdate(prevProps: ChunkErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      const chunkMismatch = isChunkLoadError(this.state.error);
      return (
        <div className="flex-1 flex items-center justify-center p-8 bg-[var(--surface-canvas)]">
          <div className="max-w-md w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-chrome)] p-6 text-center space-y-3 shadow-lg">
            <div className="w-10 h-10 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {chunkMismatch ? 'Workspace view updated' : 'Unable to load workspace view'}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {chunkMismatch
                ? 'A newer version of this module is available on the server. Reload or retry to continue.'
                : this.state.error.message || 'An unexpected error occurred while rendering this view.'}
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
                className="px-3 py-1.5 rounded-md border border-[var(--border-hairline)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 rounded-md bg-[var(--accent-color)] text-white text-xs font-medium flex items-center gap-1.5 hover:opacity-90"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Reload App</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
