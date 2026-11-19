'use client';

import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  Layers,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Unlock,
} from 'lucide-react';
import type { PdfAnnotation, PdfLayer } from '@/types/workspace';
import { countAnnotationsOnLayer, sortLayersTopDown } from '@/lib/pdfLayers';

interface PdfLayersPanelProps {
  layers: PdfLayer[];
  activeLayerId: string;
  annotations: PdfAnnotation[];
  onSelectLayer: (layerId: string) => void;
  onAddLayer: () => void;
  onRenameLayer: (layerId: string, name: string) => void;
  onToggleVisible: (layerId: string) => void;
  onToggleLocked: (layerId: string) => void;
  onMoveLayer: (layerId: string, direction: 'up' | 'down') => void;
  onDeleteLayer: (layerId: string) => void;
}

export function PdfLayersPanel({
  layers,
  activeLayerId,
  annotations,
  onSelectLayer,
  onAddLayer,
  onRenameLayer,
  onToggleVisible,
  onToggleLocked,
  onMoveLayer,
  onDeleteLayer,
}: PdfLayersPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const topDownLayers = sortLayersTopDown(layers);

  const commitRename = (layerId: string) => {
    const trimmed = draftName.trim();
    if (trimmed) {
      onRenameLayer(layerId, trimmed);
    }
    setEditingId(null);
  };

  return (
    <div className="space-y-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" />
          <span>{layers.length} {layers.length === 1 ? 'layer' : 'layers'}</span>
        </span>
        <button
          type="button"
          onClick={onAddLayer}
          aria-label="Add PDF layer"
          className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--accent-color)] text-white text-[11px] font-medium hover:opacity-90"
        >
          <Plus className="w-3 h-3" />
          <span>New Layer</span>
        </button>
      </div>

      <p className="text-[10px] text-[var(--text-muted)] leading-snug">
        New components and annotations are placed on the active layer. Hidden layers are omitted from export.
      </p>

      <div className="space-y-1.5">
        {topDownLayers.map((layer, topIdx) => {
          const isActive = layer.id === activeLayerId;
          const itemCount = countAnnotationsOnLayer(annotations, layers, layer.id);
          const isEditing = editingId === layer.id;

          return (
            <div
              key={layer.id}
              className={`rounded-lg border p-2 transition-colors ${
                isActive
                  ? 'border-[var(--accent-color)] bg-[var(--accent-soft)]/35'
                  : 'border-[var(--border-hairline)] bg-[var(--surface-subtle)]'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => onToggleVisible(layer.id)}
                  aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                  className={`p-1 rounded hover:bg-[var(--surface-chrome)] shrink-0 ${
                    layer.visible ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] opacity-55'
                  }`}
                >
                  {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => onToggleLocked(layer.id)}
                  aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`}
                  title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                  className={`p-1 rounded hover:bg-[var(--surface-chrome)] shrink-0 ${
                    layer.locked ? 'text-amber-400' : 'text-[var(--text-muted)]'
                  }`}
                >
                  {layer.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>

                {isEditing ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <input
                      type="text"
                      value={draftName}
                      autoFocus
                      aria-label={`Layer name for ${layer.name}`}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitRename(layer.id);
                        } else if (e.key === 'Escape') {
                          setEditingId(null);
                        }
                      }}
                      onBlur={() => commitRename(layer.id)}
                      className="flex-1 min-w-0 h-6 px-1.5 rounded bg-[var(--surface-chrome)] border border-[var(--accent-color)] text-[11px] text-[var(--text-primary)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => commitRename(layer.id)}
                      aria-label="Confirm layer name"
                      className="p-0.5 text-emerald-400"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectLayer(layer.id)}
                    className="flex-1 min-w-0 text-left flex items-center justify-between gap-1.5 py-0.5"
                  >
                    <span
                      className={`truncate text-[11px] ${
                        isActive ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                      } ${!layer.visible ? 'line-through opacity-60' : ''}`}
                    >
                      {layer.name}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] tabular-nums shrink-0">
                      {itemCount}
                    </span>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-1 mt-1.5 pt-1.5 border-t border-[var(--border-hairline)]/60">
                <span className="text-[10px] text-[var(--text-muted)]">
                  {isActive ? 'Active target' : 'Click to target'}
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(layer.id);
                      setDraftName(layer.name);
                    }}
                    aria-label={`Rename ${layer.name}`}
                    title="Rename layer"
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-chrome)]"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={topIdx === 0}
                    onClick={() => onMoveLayer(layer.id, 'up')}
                    aria-label={`Move ${layer.name} up`}
                    title="Bring forward"
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-chrome)] disabled:opacity-30"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={topIdx === topDownLayers.length - 1}
                    onClick={() => onMoveLayer(layer.id, 'down')}
                    aria-label={`Move ${layer.name} down`}
                    title="Send backward"
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-chrome)] disabled:opacity-30"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={layers.length <= 1}
                    onClick={() => onDeleteLayer(layer.id)}
                    aria-label={`Delete ${layer.name}`}
                    title={layers.length <= 1 ? 'Cannot delete the only layer' : 'Delete layer'}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-rose-400 hover:bg-[var(--surface-chrome)] disabled:opacity-30"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
