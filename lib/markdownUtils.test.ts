import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMarkdownOutline,
  countWordsAndChars,
  detectFileTypeFromName,
  remarkMarkHighlight,
} from './markdownUtils';

test('extractMarkdownOutline ignores headings inside fenced code blocks', () => {
  const md = [
    '# Introduction',
    'Some text here.',
    '```bash',
    '# This is a bash comment, not a heading',
    'echo "hello"',
    '```',
    '## Architecture',
    '### PDF Engine',
  ].join('\n');

  const headings = extractMarkdownOutline(md);
  assert.equal(headings.length, 3);
  assert.deepEqual(
    headings.map((h) => ({ level: h.level, text: h.text })),
    [
      { level: 1, text: 'Introduction' },
      { level: 2, text: 'Architecture' },
      { level: 3, text: 'PDF Engine' },
    ]
  );
});

test('countWordsAndChars returns accurate counts', () => {
  const stats = countWordsAndChars('Hello world\nThis is four words');
  assert.equal(stats.words, 6);
  assert.equal(stats.lines, 2);
});

test('detectFileTypeFromName maps extensions accurately', () => {
  assert.equal(detectFileTypeFromName('notes.MD'), 'markdown');
  assert.equal(detectFileTypeFromName('report.pdf'), 'pdf');
  assert.equal(detectFileTypeFromName('index.html'), 'html');
  assert.equal(detectFileTypeFromName('styles.css'), 'code');
  assert.equal(detectFileTypeFromName('ledger.csv'), 'spreadsheet');
  assert.equal(detectFileTypeFromName('legacy.xls'), 'spreadsheet');
  assert.equal(detectFileTypeFromName('inventory.XLSX'), 'spreadsheet');
});

test('remarkMarkHighlight converts <mark>...</mark> pairs while ignoring unclosed tags', () => {
  const tree = {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Hello ' },
          { type: 'html', value: '<mark>' },
          { type: 'text', value: 'highlighted' },
          { type: 'html', value: '</mark>' },
          { type: 'text', value: ' world ' },
          { type: 'html', value: '<script>' },
        ],
      },
    ],
  };

  remarkMarkHighlight()(tree);
  const para = tree.children[0];
  assert.equal(para.children.length, 4);
  assert.equal(para.children[1].data?.hName, 'mark');
  assert.equal(para.children[1].children?.[0].value, 'highlighted');
  assert.equal(para.children[3].value, '<script>');
});

test('remarkMarkHighlight converts ==...== syntax while ignoring inlineCode', () => {
  const tree = {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Important ==key phrase== here and ' },
          { type: 'inlineCode', value: '==not highlighted==' },
        ],
      },
    ],
  };
  remarkMarkHighlight()(tree);
  const para = tree.children[0];
  assert.equal(para.children.length, 4);
  assert.equal(para.children[1].data?.hName, 'mark');
  assert.equal(para.children[1].children?.[0].value, 'key phrase');
  assert.equal(para.children[3].value, '==not highlighted==');
});

