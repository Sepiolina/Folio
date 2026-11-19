import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePageRange,
  formatPageExportFilename,
  estimateImageExportSizeBytes,
  formatBytes,
} from './pageRange';

test('parsePageRange parses complex ranges and sorts uniquely', () => {
  const res = parsePageRange('1-3, 8, 2, 10-12', 15);
  assert.equal(res.valid, true);
  assert.deepEqual(res.pages, [1, 2, 3, 8, 10, 11, 12]);
});

test('parsePageRange rejects invalid bounds and descending ranges', () => {
  assert.equal(parsePageRange('1-20', 10).valid, false);
  assert.equal(parsePageRange('8-4', 10).valid, false);
  assert.equal(parsePageRange('0, 2', 10).valid, false);
  assert.equal(parsePageRange('abc', 10).valid, false);
  assert.equal(parsePageRange('', 10).valid, false);
});

test('formatPageExportFilename creates padded sequential filenames', () => {
  assert.equal(formatPageExportFilename('Annual Report.pdf', 4, 12, 'png'), 'Annual_Report_page_004.png');
  assert.equal(formatPageExportFilename('Deck.pdf', 45, 1200, 'jpeg'), 'Deck_page_0045.jpg');
});

test('estimateImageExportSizeBytes scales monotonically with DPI and page count', () => {
  const s150 = estimateImageExportSizeBytes(1, 612, 792, 150, 'png');
  const s300 = estimateImageExportSizeBytes(1, 612, 792, 300, 'png');
  assert.ok(s300 > s150 * 3);
  assert.equal(formatBytes(1024 * 1024), '1.0 MB');
});
