import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDownloadSubtext,
  getDownloadFileCategory,
  getRecentDownloads,
  findMatchingWorkspaceFile,
} from './downloadsHelper';
import type { DownloadItem, WorkspaceFileMeta } from '@/types/workspace';

test('formatDownloadSubtext formats completed, downloading, cancelled, and failed items', () => {
  assert.equal(
    formatDownloadSubtext({ status: 'completed', sizeBytes: 156 * 1024 * 1024, progress: 100 }),
    'Completed — 156 MB'
  );
  assert.equal(
    formatDownloadSubtext({ status: 'completed', sizeBytes: 0, progress: 100 }),
    'Completed'
  );
  assert.equal(
    formatDownloadSubtext({ status: 'downloading', sizeBytes: 1024 * 1024, progress: 42 }),
    'Downloading (42%) — 1.0 MB'
  );
  assert.equal(
    formatDownloadSubtext({ status: 'cancelled', sizeBytes: 2048, progress: 10 }),
    'Cancelled — 2.0 KB'
  );
  assert.equal(
    formatDownloadSubtext({ status: 'error', sizeBytes: 512, progress: 0 }),
    'Failed'
  );
});

test('getDownloadFileCategory classifies archives, PDFs, spreadsheets, Markdown, images, HTML, and scripts', () => {
  assert.equal(getDownloadFileCategory('agent-main.zip'), 'archive');
  assert.equal(getDownloadFileCategory('report_solid.pdf'), 'pdf');
  assert.equal(getDownloadFileCategory('inventory.xlsx'), 'spreadsheet');
  assert.equal(getDownloadFileCategory('ledger.xls'), 'spreadsheet');
  assert.equal(getDownloadFileCategory('export.csv'), 'spreadsheet');
  assert.equal(getDownloadFileCategory('Notes.md'), 'markdown');
  assert.equal(getDownloadFileCategory('page_001.png'), 'image');
  assert.equal(getDownloadFileCategory('snapshot.html'), 'html');
  assert.equal(getDownloadFileCategory('build-exe.bat'), 'code');
  assert.equal(getDownloadFileCategory('README.unknown'), 'file');
});

test('getRecentDownloads caps items to requested limit in order', () => {
  const sample: DownloadItem[] = Array.from({ length: 8 }, (_, idx) => ({
    id: `dl_${idx}`,
    filename: `file_${idx}.pdf`,
    url: `local://file_${idx}.pdf`,
    sizeBytes: 1024,
    progress: 100,
    status: 'completed',
    createdAt: idx,
  }));

  const recent = getRecentDownloads(sample, 5);
  assert.equal(recent.length, 5);
  assert.equal(recent[0].id, 'dl_0');
  assert.equal(recent[4].id, 'dl_4');
  assert.deepEqual(getRecentDownloads(sample, 0), []);
});

test('findMatchingWorkspaceFile locates local workspace files by name or local URL', () => {
  const files: WorkspaceFileMeta[] = [
    {
      id: 'ws_1',
      name: 'World_of_Microbes.pdf',
      kind: 'pdf',
      sizeBytes: 9300,
      updatedAt: 1000,
    },
    {
      id: 'ws_2',
      name: 'Notes.md',
      kind: 'markdown',
      sizeBytes: 500,
      updatedAt: 2000,
    },
  ];

  assert.equal(
    findMatchingWorkspaceFile({ filename: 'World_of_Microbes.pdf', url: 'local://x' }, files)?.id,
    'ws_1'
  );
  assert.equal(
    findMatchingWorkspaceFile({ filename: 'other.md', url: 'local://ws_2' }, files)?.id,
    'ws_2'
  );
  assert.equal(
    findMatchingWorkspaceFile({ filename: 'missing.zip', url: 'https://example.com/a.zip' }, files),
    undefined
  );
});
