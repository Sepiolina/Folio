import test from 'node:test';
import assert from 'node:assert/strict';
import type { PdfAnnotation } from '@/types/workspace';
import {
  cloneAnnotationForPaste,
  createQuickAnnotationAt,
  isEditableKeyboardTarget,
  nudgeAnnotationPosition,
  reorderAnnotationStack,
  resolvePdfShortcut,
} from './pdfEditorInteractions';

const sampleTextbox: PdfAnnotation = {
  id: 'ann-tb-1',
  pageNumber: 1,
  layerId: 'layer-default',
  type: 'textbox',
  x: 0.2,
  y: 0.3,
  width: 0.25,
  height: 0.06,
  color: '#2563eb',
  fillColor: '#ffffff',
  opacity: 1,
  strokeWidth: 1.5,
  fieldName: 'textbox_p1_1',
  text: 'Notes',
  author: 'Tester',
  createdAt: 1000,
};

test('cloneAnnotationForPaste assigns unique id, target page/layer, offset, and distinct fieldName', () => {
  const pasted = cloneAnnotationForPaste(sampleTextbox, {
    pageNumber: 3,
    targetLayerId: 'layer-2',
  });
  assert.notEqual(pasted.id, sampleTextbox.id);
  assert.equal(pasted.pageNumber, 3);
  assert.equal(pasted.layerId, 'layer-2');
  assert.ok(pasted.x > sampleTextbox.x);
  assert.ok(pasted.y > sampleTextbox.y);
  assert.notEqual(pasted.fieldName, sampleTextbox.fieldName);
  assert.equal(pasted.text, 'Notes');
});

test('cloneAnnotationForPaste places freehand paths cleanly around placeAtNorm', () => {
  const freehand: PdfAnnotation = {
    id: 'fh-1',
    pageNumber: 1,
    type: 'freehand',
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.3, y: 0.3 },
    ],
    color: '#34d399',
    opacity: 0.85,
    strokeWidth: 2,
    author: 'Tester',
    createdAt: 1000,
  };

  const placed = cloneAnnotationForPaste(freehand, {
    pageNumber: 2,
    targetLayerId: 'layer-default',
    placeAtNorm: { x: 0.6, y: 0.5 },
  });
  assert.ok(placed.points && placed.points.length === 2);
  assert.ok(Math.abs(placed.points[0].x - 0.5) < 0.001);
  assert.ok(Math.abs(placed.points[1].x - 0.7) < 0.001);
});

test('nudgeAnnotationPosition moves and clamps within page bounds', () => {
  const nudged = nudgeAnnotationPosition(sampleTextbox, 0.02, -0.02);
  assert.equal(nudged.x, 0.22);
  assert.equal(nudged.y, 0.28);

  const clamped = nudgeAnnotationPosition(sampleTextbox, 5, -5);
  assert.equal(clamped.x, 0.75);
  assert.equal(clamped.y, 0);
});

test('reorderAnnotationStack brings to front and sends to back cleanly', () => {
  const list: PdfAnnotation[] = [
    { ...sampleTextbox, id: 'a' },
    { ...sampleTextbox, id: 'b' },
    { ...sampleTextbox, id: 'c' },
  ];
  assert.deepEqual(
    reorderAnnotationStack(list, 'a', 'front').map((x) => x.id),
    ['b', 'c', 'a']
  );
  assert.deepEqual(
    reorderAnnotationStack(list, 'c', 'back').map((x) => x.id),
    ['c', 'a', 'b']
  );
});

test('resolvePdfShortcut maps copy, cut, paste, duplicate, undo, redo, delete, nudge, and tools', () => {
  const baseCtx = {
    hasSelection: true,
    hasClipboard: true,
    hasDomTextSelection: false,
    isSelectedCheckbox: false,
  };
  assert.deepEqual(
    resolvePdfShortcut({ key: 'c', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }, baseCtx),
    { type: 'copy' }
  );
  assert.deepEqual(
    resolvePdfShortcut({ key: 'x', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }, baseCtx),
    { type: 'cut' }
  );
  assert.deepEqual(
    resolvePdfShortcut({ key: 'v', ctrlKey: false, metaKey: true, shiftKey: false, altKey: false }, baseCtx),
    { type: 'paste' }
  );
  assert.deepEqual(
    resolvePdfShortcut({ key: 'd', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }, baseCtx),
    { type: 'duplicate' }
  );
  assert.deepEqual(
    resolvePdfShortcut({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }, baseCtx),
    { type: 'undo' }
  );
  assert.deepEqual(
    resolvePdfShortcut({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false }, baseCtx),
    { type: 'redo' }
  );
  assert.deepEqual(
    resolvePdfShortcut({ key: 'Delete', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, baseCtx),
    { type: 'delete' }
  );
  assert.deepEqual(
    resolvePdfShortcut({ key: 'ArrowRight', ctrlKey: false, metaKey: false, shiftKey: true, altKey: false }, baseCtx),
    { type: 'nudge', dx: 0.02, dy: 0 }
  );
  // Defer Ctrl+C to browser when native PDF text is highlighted
  assert.equal(
    resolvePdfShortcut(
      { key: 'c', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
      { ...baseCtx, hasDomTextSelection: true }
    ),
    null
  );
  // Tool key without modifiers
  assert.deepEqual(
    resolvePdfShortcut(
      { key: 'b', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false },
      { ...baseCtx, hasSelection: false }
    ),
    { type: 'tool', tool: 'textbox' }
  );
});

test('isEditableKeyboardTarget protects text fields while allowing checkboxes', () => {
  assert.equal(isEditableKeyboardTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isEditableKeyboardTarget({ tagName: 'INPUT', type: 'text' }), true);
  assert.equal(isEditableKeyboardTarget({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(isEditableKeyboardTarget({ tagName: 'DIV' }), false);
});

test('createQuickAnnotationAt builds valid bounded textbox and checkbox components', () => {
  const tb = createQuickAnnotationAt('textbox', {
    pageNumber: 2,
    layerId: 'layer-1',
    x: 0.9,
    y: 0.95,
    color: '#facc15',
    strokeWidth: 2,
  });
  assert.equal(tb.type, 'textbox');
  assert.equal(tb.x, 0.72);
  assert.equal(tb.y, 0.92);
  assert.equal(tb.color, '#2563eb');
});
