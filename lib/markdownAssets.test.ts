import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUniqueAssetPath,
  collectRelatedWorkspaceFiles,
  extractMarkdownReferences,
  isWorkspaceAssetRef,
  matchWorkspaceFileByReference,
  type WorkspaceFileLike,
} from './markdownAssets';

test('buildUniqueAssetPath sanitizes filenames and increments collisions', () => {
  assert.equal(buildUniqueAssetPath('My Diagram (1).PNG', []), 'assets/My-Diagram-1.png');
  assert.equal(
    buildUniqueAssetPath('My Diagram (1).PNG', ['assets/My-Diagram-1.png']),
    'assets/My-Diagram-1-2.png'
  );
  assert.equal(
    buildUniqueAssetPath('My Diagram (1).PNG', ['assets/My-Diagram-1.png', 'assets/My-Diagram-1-2.png']),
    'assets/My-Diagram-1-3.png'
  );
});

test('isWorkspaceAssetRef excludes external schemes and anchors', () => {
  assert.equal(isWorkspaceAssetRef('assets/photo.png'), true);
  assert.equal(isWorkspaceAssetRef('./diagram.svg'), true);
  assert.equal(isWorkspaceAssetRef('https://example.com/a.png'), false);
  assert.equal(isWorkspaceAssetRef('data:image/png;base64,AAA'), false);
  assert.equal(isWorkspaceAssetRef('blob:http://localhost:3000/123'), false);
  assert.equal(isWorkspaceAssetRef('#heading'), false);
});

test('extractMarkdownReferences parses images, links, wikilinks, and html while skipping code', () => {
  const md = [
    '# Title',
    '![Hero](assets/hero.png "Hero Banner")',
    'See [Notes](Endospore%20Research%20Notes.md#checklist) and [Web](https://example.com).',
    'Also [[Project Plan|Plan]] and ![[assets/chart.webp]].',
    '<img src="./assets/inline.jpg" alt="inline" />',
    '',
    '```markdown',
    '![Ignored](assets/codeblock.png)',
    '[Ignored](Ignored.md)',
    '```',
    '',
    'Inline `![AlsoIgnored](assets/inline-code.png)` text.',
    '',
    '[ref-logo]: assets/logo.svg "Logo"',
  ].join('\n');

  const refs = extractMarkdownReferences(md);
  assert.deepEqual(refs, [
    'assets/hero.png',
    'Endospore Research Notes.md',
    'assets/logo.svg',
    'Project Plan',
    'assets/chart.webp',
    'assets/inline.jpg',
  ]);
});

test('collectRelatedWorkspaceFiles traces linked docs and assets while excluding unrelated files and cycles', () => {
  const files: WorkspaceFileLike[] = [
    { id: 'doc-root', name: 'Main Report.md', kind: 'markdown' },
    { id: 'doc-linked', name: 'Endospore Research Notes.md', kind: 'markdown' },
    { id: 'doc-deep', name: 'Appendix.md', kind: 'markdown' },
    { id: 'doc-unrelated', name: 'Personal Journal.md', kind: 'markdown' },
    { id: 'asset-1', name: 'assets/cover.png', kind: 'asset' },
    { id: 'asset-2', name: 'assets/stain-microscopy.jpg', kind: 'asset' },
    { id: 'asset-3', name: 'assets/appendix-chart.svg', kind: 'asset' },
    { id: 'asset-unrelated', name: 'assets/vacation.png', kind: 'asset' },
    { id: 'pdf-linked', name: 'World_of_Microbes.pdf', kind: 'pdf' },
    { id: 'pdf-unrelated', name: 'Unused_Form.pdf', kind: 'pdf' },
  ];

  const contents: Record<string, string> = {
    'doc-root': [
      '# Main Report',
      '![Cover](assets/cover.png)',
      'Read [Research Notes](Endospore%20Research%20Notes.md) and [External](https://example.com).',
      'Ref: [Source PDF](World_of_Microbes.pdf)',
    ].join('\n'),
    'doc-linked': [
      '# Research Notes',
      '![Microscopy](assets/stain-microscopy.jpg)',
      'Back to [Main](Main%20Report.md) or forward to [[Appendix]].',
    ].join('\n'),
    'doc-deep': [
      '# Appendix',
      '<img src="assets/appendix-chart.svg" />',
      'Missing ref: ![Ghost](assets/does-not-exist.png)',
    ].join('\n'),
    'doc-unrelated': [
      '# Unrelated',
      '![Vacation](assets/vacation.png)',
      '[Unused](Unused_Form.pdf)',
    ].join('\n'),
  };

  const result = collectRelatedWorkspaceFiles({
    rootFileId: 'doc-root',
    rootFilename: 'Main Report.md',
    rootContent: contents['doc-root'],
    files,
    getTextContent: (f) => contents[f.id],
  });

  const bundledNames = result.entries.map((e) => e.zipPath);
  assert.deepEqual(bundledNames, [
    'Main Report.md',
    'assets/cover.png',
    'Endospore Research Notes.md',
    'World_of_Microbes.pdf',
    'assets/stain-microscopy.jpg',
    'Appendix.md',
    'assets/appendix-chart.svg',
  ]);
  assert.equal(bundledNames.includes('Personal Journal.md'), false);
  assert.equal(bundledNames.includes('assets/vacation.png'), false);
  assert.equal(bundledNames.includes('Unused_Form.pdf'), false);
  assert.deepEqual(result.missingRefs, ['assets/does-not-exist.png']);
});

test('matchWorkspaceFileByReference matches basename fallback cleanly', () => {
  const files: WorkspaceFileLike[] = [
    { id: 'a1', name: 'assets/diagram.png', kind: 'asset' },
    { id: 'm1', name: 'Notes.md', kind: 'markdown' },
  ];
  assert.equal(matchWorkspaceFileByReference('./diagram.png', files)?.id, 'a1');
  assert.equal(matchWorkspaceFileByReference('Notes', files)?.id, 'm1');
});
