import type { PdfAnnotation, PdfLayer } from '@/types/workspace';

export const DEFAULT_LAYER_ID = 'layer-default';

export function createDefaultLayer(): PdfLayer {
  return {
    id: DEFAULT_LAYER_ID,
    name: 'Layer 1',
    visible: true,
    locked: false,
    order: 0,
  };
}

export function ensureLayers(layers?: PdfLayer[] | null): PdfLayer[] {
  if (!layers || layers.length === 0) {
    return [createDefaultLayer()];
  }
  const seen = new Set<string>();
  const clean: PdfLayer[] = [];
  for (const layer of layers) {
    if (!layer || !layer.id || seen.has(layer.id)) continue;
    seen.add(layer.id);
    clean.push({
      id: layer.id,
      name: layer.name?.trim() || 'Untitled Layer',
      visible: layer.visible !== false,
      locked: Boolean(layer.locked),
      order: typeof layer.order === 'number' ? layer.order : clean.length,
    });
  }
  if (clean.length === 0) {
    return [createDefaultLayer()];
  }
  return clean
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((layer, idx) => ({ ...layer, order: idx }));
}

export function sortLayersTopDown(layers: PdfLayer[]): PdfLayer[] {
  return ensureLayers(layers).slice().sort((a, b) => b.order - a.order);
}

export function sortLayersBottomUp(layers: PdfLayer[]): PdfLayer[] {
  return ensureLayers(layers);
}

export function createLayer(existing: PdfLayer[], name?: string): PdfLayer {
  const normalized = ensureLayers(existing);
  const nextNum = normalized.length + 1;
  const maxOrder = normalized.reduce((acc, l) => Math.max(acc, l.order), -1);
  return {
    id: `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: name?.trim() || `Layer ${nextNum}`,
    visible: true,
    locked: false,
    order: maxOrder + 1,
  };
}

export function moveLayer(
  layers: PdfLayer[],
  layerId: string,
  direction: 'up' | 'down'
): PdfLayer[] {
  const bottomUp = ensureLayers(layers);
  const idx = bottomUp.findIndex((l) => l.id === layerId);
  if (idx === -1) return bottomUp;

  const swapIdx = direction === 'up' ? idx + 1 : idx - 1;
  if (swapIdx < 0 || swapIdx >= bottomUp.length) return bottomUp;

  const copy = bottomUp.map((l) => ({ ...l }));
  const target = copy[idx];
  copy[idx] = copy[swapIdx];
  copy[swapIdx] = target;
  return copy.map((l, i) => ({ ...l, order: i }));
}

export function deleteLayer(
  layers: PdfLayer[],
  annotations: PdfAnnotation[],
  layerId: string
): { layers: PdfLayer[]; annotations: PdfAnnotation[]; fallbackLayerId: string } {
  const normalized = ensureLayers(layers);
  if (normalized.length <= 1) {
    return {
      layers: normalized,
      annotations,
      fallbackLayerId: normalized[0].id,
    };
  }
  const remaining = normalized
    .filter((l) => l.id !== layerId)
    .map((l, i) => ({ ...l, order: i }));
  const fallbackLayerId = remaining[remaining.length - 1].id;
  const filteredAnnotations = annotations.filter(
    (ann) => (ann.layerId || normalized[0].id) !== layerId
  );
  return {
    layers: remaining,
    annotations: filteredAnnotations,
    fallbackLayerId,
  };
}

export function resolveAnnotationLayerId(ann: PdfAnnotation, layers: PdfLayer[]): string {
  const normalized = ensureLayers(layers);
  if (ann.layerId && normalized.some((l) => l.id === ann.layerId)) {
    return ann.layerId;
  }
  return normalized[0].id;
}

export function getLayerById(layers: PdfLayer[], layerId?: string): PdfLayer {
  const normalized = ensureLayers(layers);
  if (layerId) {
    const found = normalized.find((l) => l.id === layerId);
    if (found) return found;
  }
  return normalized[0];
}

export function isLayerLocked(layers: PdfLayer[], layerId?: string): boolean {
  return getLayerById(layers, layerId).locked;
}

export function isLayerVisible(layers: PdfLayer[], layerId?: string): boolean {
  return getLayerById(layers, layerId).visible;
}

export function getVisibleOrderedAnnotations(
  annotations: PdfAnnotation[],
  layers: PdfLayer[]
): PdfAnnotation[] {
  const normalized = ensureLayers(layers);
  const layerMap = new Map<string, PdfLayer>();
  for (const l of normalized) layerMap.set(l.id, l);
  const defaultId = normalized[0].id;

  return annotations
    .map((ann, idx) => {
      const lid = ann.layerId && layerMap.has(ann.layerId) ? ann.layerId : defaultId;
      const layer = layerMap.get(lid)!;
      return { ann, idx, layer };
    })
    .filter((entry) => entry.layer.visible)
    .sort((a, b) => {
      if (a.layer.order !== b.layer.order) return a.layer.order - b.layer.order;
      return a.idx - b.idx;
    })
    .map((entry) => entry.ann);
}

export function getHiddenLayerAnnotations(
  annotations: PdfAnnotation[],
  layers: PdfLayer[]
): PdfAnnotation[] {
  const normalized = ensureLayers(layers);
  const layerMap = new Map<string, PdfLayer>();
  for (const l of normalized) layerMap.set(l.id, l);
  const defaultId = normalized[0].id;

  return annotations.filter((ann) => {
    const lid = ann.layerId && layerMap.has(ann.layerId) ? ann.layerId : defaultId;
    return !layerMap.get(lid)!.visible;
  });
}

export function countAnnotationsOnLayer(
  annotations: PdfAnnotation[],
  layers: PdfLayer[],
  layerId: string
): number {
  const normalized = ensureLayers(layers);
  const defaultId = normalized[0].id;
  const validIds = new Set(normalized.map((l) => l.id));
  return annotations.filter((ann) => {
    const lid = ann.layerId && validIds.has(ann.layerId) ? ann.layerId : defaultId;
    return lid === layerId;
  }).length;
}
