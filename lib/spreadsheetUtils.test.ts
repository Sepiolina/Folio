import test from 'node:test';
import assert from 'node:assert/strict';
import {
  columnIndexToLabel,
  labelToColumnIndex,
  parseCellAddress,
  parseSpreadsheetFromInput,
  serializeWorkbook,
  evaluateCellDisplay,
  updateSheetCell,
  insertSheetRow,
  deleteSheetRow,
  insertSheetColumn,
  deleteSheetColumn,
  sortSheetByColumn,
  filterSheetRowIndices,
  addWorkbookSheet,
  renameWorkbookSheet,
  deleteWorkbookSheet,
} from './spreadsheetUtils';

test('columnIndexToLabel and labelToColumnIndex round-trip accurately', () => {
  assert.equal(columnIndexToLabel(0), 'A');
  assert.equal(columnIndexToLabel(25), 'Z');
  assert.equal(columnIndexToLabel(26), 'AA');
  assert.equal(columnIndexToLabel(27), 'AB');
  assert.equal(labelToColumnIndex('A'), 0);
  assert.equal(labelToColumnIndex('Z'), 25);
  assert.equal(labelToColumnIndex('AA'), 26);
  assert.deepEqual(parseCellAddress('C12'), { row: 11, col: 2 });
});

test('CSV parses, edits, and round-trips cleanly', () => {
  const csv = 'Item,Qty,Unit Price\nAgar Plate,24,3.5\nPipette Tips,100,0.25';
  const wb = parseSpreadsheetFromInput({
    filename: 'lab.csv',
    textContent: csv,
    minRows: 4,
    minCols: 4,
  });
  assert.equal(wb.sourceFormat, 'csv');
  assert.equal(wb.sheets[0].rows[0][0], 'Item');
  assert.equal(wb.sheets[0].rows[1][1], '24');

  const edited = updateSheetCell(wb.sheets[0], 1, 1, '30');
  const exported = serializeWorkbook({ ...wb, sheets: [edited] }, 'csv');
  assert.ok(exported.text?.includes('Agar Plate,30,3.5'));
});

test('XLSX and XLS binary round-trip preserves multiple sheets and formulas', () => {
  const wb = parseSpreadsheetFromInput({
    filename: 'sample.csv',
    textContent: 'Name,Score\nAlpha,10\nBeta,25\nTotal,=SUM(B2:B3)',
    minRows: 4,
    minCols: 3,
  });
  let multi = addWorkbookSheet(wb, 'Notes');
  multi = {
    ...multi,
    sheets: multi.sheets.map((s, idx) =>
      idx === 1 ? updateSheetCell(s, 0, 0, 'Reviewed') : s
    ),
  };

  for (const format of ['xlsx', 'xls'] as const) {
    const serialized = serializeWorkbook(multi, format);
    const reloaded = parseSpreadsheetFromInput({
      filename: `out.${format}`,
      binaryContent: serialized.bytes,
      minRows: 4,
      minCols: 3,
    });
    assert.equal(reloaded.sourceFormat, format);
    assert.equal(reloaded.sheets.length, 2);
    assert.equal(reloaded.sheets[0].rows[1][1], '10');
    assert.equal(reloaded.sheets[0].rows[3][1], format === 'xlsx' ? '=SUM(B2:B3)' : '35');
    assert.equal(reloaded.sheets[1].name, 'Notes');
    assert.equal(reloaded.sheets[1].rows[0][0], 'Reviewed');
  }
});

test('evaluateCellDisplay computes SUM, AVERAGE, MIN, MAX, COUNT, and arithmetic expressions', () => {
  const wb = parseSpreadsheetFromInput({
    filename: 'calc.csv',
    textContent: 'Val,Factor\n10,2\n20,3\n30,4',
    minRows: 5,
    minCols: 3,
  });
  const sheet = wb.sheets[0];
  assert.equal(evaluateCellDisplay('=SUM(A2:A4)', sheet), '60');
  assert.equal(evaluateCellDisplay('=AVERAGE(A2:A4)', sheet), '20');
  assert.equal(evaluateCellDisplay('=MIN(A2:A4)', sheet), '10');
  assert.equal(evaluateCellDisplay('=MAX(A2:A4)', sheet), '30');
  assert.equal(evaluateCellDisplay('=COUNT(A2:A4)', sheet), '3');
  assert.equal(evaluateCellDisplay('=A2*B2+5', sheet), '25');
});

test('row, column, sorting, filtering, and sheet management helpers behave deterministically', () => {
  const wb = parseSpreadsheetFromInput({
    filename: 'ops.csv',
    textContent: 'Sample,Count\nZeta,5\nAlpha,40\nBeta,12',
    minRows: 4,
    minCols: 2,
  });
  let sheet = wb.sheets[0];
  sheet = insertSheetRow(sheet, 2);
  assert.equal(sheet.rows.length, 5);
  sheet = deleteSheetRow(sheet, 2);
  assert.equal(sheet.rows.length, 4);

  sheet = insertSheetColumn(sheet, 1);
  assert.equal(sheet.rows[0].length, 3);
  sheet = deleteSheetColumn(sheet, 1);
  assert.equal(sheet.rows[0].length, 2);

  const sortedAsc = sortSheetByColumn(sheet, 1, 'asc', true);
  assert.equal(sortedAsc.rows[1][0], 'Zeta');
  assert.equal(sortedAsc.rows[3][0], 'Alpha');

  const filtered = filterSheetRowIndices(sheet, 'alpha', true);
  assert.deepEqual(filtered, [0, 2]);

  let multi = addWorkbookSheet(wb, 'Metrics');
  multi = renameWorkbookSheet(multi, 1, 'QA Metrics');
  assert.equal(multi.sheets[1].name, 'QA Metrics');
  multi = deleteWorkbookSheet(multi, 1);
  assert.equal(multi.sheets.length, 1);
});
