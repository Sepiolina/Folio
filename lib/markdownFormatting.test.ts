import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addGfmTableColumn,
  addGfmTableRow,
  computeCodeBlockChange,
  computeInlineWrapChange,
  computeLineHeadingChange,
  computeLinePrefixChange,
  computeLinkChange,
  computeTableInsertChange,
  htmlToMarkdownBasic,
  parseGfmTable,
  removeGfmTableColumn,
  removeGfmTableRow,
  serializeGfmTable,
  swapGfmTableColumns,
  swapGfmTableRows,
  updateGfmTableCell,
} from './markdownFormatting';

function applyEdit(doc: string, edit: ReturnType<typeof computeInlineWrapChange>): string {
  return doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
}

test('computeInlineWrapChange wraps and unwraps bold, italic, highlight, and code markers', () => {
  const base = 'Hello world today';
  const wrap = computeInlineWrapChange(base, 6, 11, '**', 'bold');
  const wrapped = applyEdit(base, wrap);
  assert.equal(wrapped, 'Hello **world** today');

  // Unwrapping when cursor selection is inside **...**
  const unwrap = computeInlineWrapChange(wrapped, 8, 13, '**', 'bold');
  assert.equal(applyEdit(wrapped, unwrap), base);

  // Highlight ==...== when no selection
  const hl = computeInlineWrapChange('Note: ', 6, 6, '==', 'highlight');
  assert.equal(applyEdit('Note: ', hl), 'Note: ==highlight==');
});

test('computeLineHeadingChange sets and toggles heading levels cleanly', () => {
  const doc = 'First line\nSecond line';
  const h2 = computeLineHeadingChange(doc, 0, 5, 2);
  assert.equal(applyEdit(doc, h2), '## First line\nSecond line');

  // Applying H2 again toggles heading back to paragraph
  const back = computeLineHeadingChange('## First line', 3, 3, 2);
  assert.equal(applyEdit('## First line', back), 'First line');
});

test('computeLinePrefixChange toggles bullets, ordered lists, task lists, and quotes', () => {
  const doc = 'Alpha\nBeta';
  const task = computeLinePrefixChange(doc, 0, doc.length, 'task');
  const tasked = applyEdit(doc, task);
  assert.equal(tasked, '- [ ] Alpha\n- [ ] Beta');

  const ordered = computeLinePrefixChange(tasked, 0, tasked.length, 'ordered');
  assert.equal(applyEdit(tasked, ordered), '1. Alpha\n2. Beta');

  const untoggled = computeLinePrefixChange('1. Alpha\n2. Beta', 0, 16, 'ordered');
  assert.equal(applyEdit('1. Alpha\n2. Beta', untoggled), 'Alpha\nBeta');
});

test('GFM table parser, cell update, row/col add, and serializer round-trip accurately', () => {
  const inserted = applyEdit('', computeTableInsertChange('', 0, 2, 1));
  const parsed = parseGfmTable(inserted);
  assert.ok(parsed);
  assert.equal(parsed.headers.length, 2);
  assert.equal(parsed.rows.length, 1);

  const updated = updateGfmTableCell(inserted.trim(), 0, 1, 'Done');
  const withRow = addGfmTableRow(updated);
  const withCol = addGfmTableColumn(withRow);
  const reparsed = parseGfmTable(withCol);
  assert.ok(reparsed);
  assert.equal(reparsed.headers.length, 3);
  assert.equal(reparsed.rows.length, 2);
  assert.equal(reparsed.rows[0][1], 'Done');

  const serialized = serializeGfmTable(reparsed);
  assert.ok(serialized.includes('| Done |'));
});

test('GFM table supports column/row removal and drag-drop row/column swapping with alignments preserved', () => {
  const raw = [
    '| Name | Role | Score |',
    '| :--- | :---: | ---: |',
    '| Alice | Eng | 95 |',
    '| Bob | Design | 88 |',
  ].join('\n');

  // Swap columns 0 and 2 (Name <-> Score)
  const swappedCols = swapGfmTableColumns(raw, 0, 2);
  const parsedCols = parseGfmTable(swappedCols);
  assert.ok(parsedCols);
  assert.deepEqual(parsedCols.headers, ['Score', 'Role', 'Name']);
  assert.deepEqual(parsedCols.alignments, ['right', 'center', 'left']);
  assert.deepEqual(parsedCols.rows[0], ['95', 'Eng', 'Alice']);
  assert.deepEqual(parsedCols.rows[1], ['88', 'Design', 'Bob']);

  // Swap rows 0 and 1 (Alice <-> Bob)
  const swappedRows = swapGfmTableRows(swappedCols, 0, 1);
  const parsedRows = parseGfmTable(swappedRows);
  assert.ok(parsedRows);
  assert.deepEqual(parsedRows.rows[0], ['88', 'Design', 'Bob']);
  assert.deepEqual(parsedRows.rows[1], ['95', 'Eng', 'Alice']);

  // Remove middle column (Role at index 1)
  const removedCol = removeGfmTableColumn(swappedRows, 1);
  const parsedRemovedCol = parseGfmTable(removedCol);
  assert.ok(parsedRemovedCol);
  assert.deepEqual(parsedRemovedCol.headers, ['Score', 'Name']);
  assert.deepEqual(parsedRemovedCol.alignments, ['right', 'left']);
  assert.deepEqual(parsedRemovedCol.rows[0], ['88', 'Bob']);

  // Remove first row
  const removedRow = removeGfmTableRow(removedCol, 0);
  const parsedRemovedRow = parseGfmTable(removedRow);
  assert.ok(parsedRemovedRow);
  assert.equal(parsedRemovedRow.rows.length, 1);
  assert.deepEqual(parsedRemovedRow.rows[0], ['95', 'Alice']);

  // Guard: refuse to remove the last remaining body row or last remaining column
  assert.equal(removeGfmTableRow(removedRow, 0), removedRow);
  const oneCol = removeGfmTableColumn(removedRow, 0);
  assert.equal(parseGfmTable(oneCol)?.headers.length, 1);
  assert.equal(removeGfmTableColumn(oneCol, 0), oneCol);
});

test('code block, link, and basic HTML paste produce valid Markdown', () => {
  const link = computeLinkChange('Check docs', 6, 10, 'https://folio.dev');
  assert.equal(applyEdit('Check docs', link), 'Check [docs](https://folio.dev)');

  const code = computeCodeBlockChange('const x = 1;', 0, 12, 'ts');
  assert.equal(applyEdit('const x = 1;', code), '```ts\nconst x = 1;\n```');

  const html = '<h2>Title</h2><p>Hello <strong>bold</strong> and <a href="https://a.b">link</a>.</p><ul><li>One</li><li>Two</li></ul>';
  const md = htmlToMarkdownBasic(html);
  assert.ok(md.includes('## Title'));
  assert.ok(md.includes('**bold**'));
  assert.ok(md.includes('[link](https://a.b)'));
  assert.ok(md.includes('- One'));
});
