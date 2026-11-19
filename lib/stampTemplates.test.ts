import test from 'node:test';
import assert from 'node:assert/strict';
import {
  annotationToStampTemplate,
  buildStampAnnotation,
  DEFAULT_STAMP_TEMPLATES,
  normalizeStampLabel,
  resolveStampColors,
  resolveStampTemplateSubtext,
} from './stampTemplates';

test('DEFAULT_STAMP_TEMPLATES provides seeded presets with valid colors and styles', () => {
  assert.ok(DEFAULT_STAMP_TEMPLATES.length >= 4);
  for (const tpl of DEFAULT_STAMP_TEMPLATES) {
    assert.ok(tpl.label.length > 0);
    assert.match(tpl.color, /^#[0-9a-fA-F]{6}$/);
    assert.ok(['outline', 'solid', 'badge'].includes(tpl.style));
  }
});

test('resolveStampTemplateSubtext replaces {date} token accurately', () => {
  const d = new Date(2026, 10, 16); // 2026-11-16
  assert.equal(resolveStampTemplateSubtext('Signed {date}', d), 'Signed 2026-11-16');
  assert.equal(resolveStampTemplateSubtext('   ', d), '');
});

test('normalizeStampLabel falls back to STAMP only when empty', () => {
  assert.equal(normalizeStampLabel('  Approved QA  '), 'Approved QA');
  assert.equal(normalizeStampLabel('   '), 'STAMP');
});

test('resolveStampColors computes contrasting text and backgrounds across styles', () => {
  const solid = resolveStampColors('#16a34a', 'solid');
  assert.equal(solid.backgroundColor, '#16a34a');
  assert.equal(solid.textColor, '#ffffff');

  const badge = resolveStampColors('#e11d48', 'badge');
  assert.equal(badge.textColor, '#e11d48');
  assert.match(badge.backgroundColor, /^rgba\(225, 29, 72, 0\.14\)$/);

  const outline = resolveStampColors('#2563eb', 'outline');
  assert.equal(outline.borderColor, '#2563eb');
  assert.equal(outline.textColor, '#2563eb');
});

test('buildStampAnnotation creates bounded stamp annotation with expanded height when subtext exists', () => {
  const plain = buildStampAnnotation({
    pageNumber: 1,
    layerId: 'layer-default',
    x: 0.5,
    y: 0.5,
    label: 'PAID',
    color: '#16a34a',
    style: 'solid',
  });
  const withSub = buildStampAnnotation({
    pageNumber: 2,
    layerId: 'layer-default',
    x: 0.99,
    y: 0.99,
    label: 'APPROVED BY ENGINEERING',
    subtext: '{date}',
    color: '#2563eb',
    style: 'badge',
    now: new Date(2026, 10, 16),
  });

  assert.equal(plain.type, 'stamp');
  assert.equal(plain.stampLabel, 'PAID');
  assert.equal(plain.stampStyle, 'solid');
  assert.ok(withSub.height > plain.height);
  assert.equal(withSub.stampSubtext, '2026-11-16');
  assert.ok(withSub.x + withSub.width <= 0.98001);
  assert.ok(withSub.y + withSub.height <= 0.98001);

  const tpl = annotationToStampTemplate(withSub);
  assert.equal(tpl.label, 'APPROVED BY ENGINEERING');
  assert.equal(tpl.subtext, '2026-11-16');
  assert.equal(tpl.style, 'badge');
  assert.equal(tpl.color, '#2563eb');
});
