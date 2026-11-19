import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LAYER_ID,
  countAnnotationsOnLayer,
  createDefaultLayer,
  createLayer,
  deleteLayer,
  ensureLayers,
  getHiddenLayerAnnotations,
  getVisibleOrderedAnnotations,
  isLayerLocked,
  moveLayer,
  sortLayersTopDown,
} from './pdfLayers';
import type { PdfAnnotation, PdfLayer } from '@/types/workspace';

function makeAnn(id: string, layerId?: string): PdfAnnotation {
  return {
    id,
    pageNumber: 1,
    layerId,
    type: 'textbox',
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.05,
    color: '#111827',
    opacity: 1,
    strokeWidth: 1.5,
    text: id,
    author: 'Tester',
    createdAt: 1000,
  };
}

test('ensureLayers always yields at least one sorted layer', () => {
  const empty = ensureLayers([]);
  assert.equal(empty.length, 1);
  assert.equal(empty[0].id, DEFAULT_LAYER_ID);

  const l1 = createDefaultLayer();
  const l2 = createLayer([l1], 'Form Inputs');
  const sortedTopDown = sortLayersTopDown([l1, l2]);
  assert.equal(sortedTopDown[0].id, l2.id);
  assert.equal(sortedTopDown[1].id, l1.id);
});

test('moveLayer swaps stack order up and down cleanly', () => {
  const base: PdfLayer[] = [
    { id: 'a', name: 'A', visible: true, locked: false, order: 0 },
    { id: 'b', name: 'B', visible: true, locked: false, order: 1 },
    { id: 'c', name: 'C', visible: true, locked: false, order: 2 },
  ];
  const movedUp = moveLayer(base, 'a', 'up');
  assert.deepEqual(
    movedUp.map((l) => l.id),
    ['b', 'a', 'c']
  );
  const movedDown = moveLayer(movedUp, 'c', 'down');
  assert.deepEqual(
    movedDown.map((l) => l.id),
    ['b', 'c', 'a']
  );
});

test('getVisibleOrderedAnnotations respects visibility and z-order, and tracks hidden items', () => {
  const layers: PdfLayer[] = [
    { id: 'bg', name: 'Background', visible: true, locked: false, order: 0 },
    { id: 'hidden', name: 'Hidden', visible: false, locked: false, order: 1 },
    { id: 'fg', name: 'Foreground', visible: true, locked: true, order: 2 },
  ];
  const anns = [
    makeAnn('fg-1', 'fg'),
    makeAnn('hid-1', 'hidden'),
    makeAnn('bg-1', 'bg'),
    makeAnn('unassigned'),
  ];

  const visible = getVisibleOrderedAnnotations(anns, layers);
  assert.deepEqual(
    visible.map((a) => a.id),
    ['bg-1', 'unassigned', 'fg-1']
  );

  const hidden = getHiddenLayerAnnotations(anns, layers);
  assert.deepEqual(
    hidden.map((a) => a.id),
    ['hid-1']
  );

  assert.equal(isLayerLocked(layers, 'fg'), true);
  assert.equal(isLayerLocked(layers, 'bg'), false);
  assert.equal(countAnnotationsOnLayer(anns, layers, 'bg'), 2);
});

test('deleteLayer deletes targeted layer items and refuses deleting the last layer', () => {
  const layers: PdfLayer[] = [
    { id: 'l1', name: 'Layer 1', visible: true, locked: false, order: 0 },
    { id: 'l2', name: 'Layer 2', visible: true, locked: false, order: 1 },
  ];
  const anns = [makeAnn('a1', 'l1'), makeAnn('a2', 'l2')];
  const res1 = deleteLayer(layers, anns, 'l2');
  assert.equal(res1.layers.length, 1);
  assert.equal(res1.annotations.length, 1);
  assert.equal(res1.annotations[0].id, 'a1');

  const res2 = deleteLayer(res1.layers, res1.annotations, 'l1');
  assert.equal(res2.layers.length, 1);
  assert.equal(res2.annotations.length, 1);
});
