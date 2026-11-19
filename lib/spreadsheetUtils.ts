import * as XLSX from 'xlsx';

export type SpreadsheetFormat = 'csv' | 'xls' | 'xlsx';

export interface SpreadsheetSheet {
  name: string;
  rows: string[][];
}

export interface SpreadsheetWorkbook {
  sheets: SpreadsheetSheet[];
  activeSheetIndex: number;
  sourceFormat: SpreadsheetFormat;
}

const DEFAULT_MIN_ROWS = 20;
const DEFAULT_MIN_COLS = 8;

/**
 * Converts a 0-based column index to an Excel-style column label (0 -> A, 25 -> Z, 26 -> AA).
 */
export function columnIndexToLabel(index: number): string {
  if (index < 0 || !Number.isInteger(index)) return '';
  let n = index;
  let label = '';
  while (n >= 0) {
    label = String.fromCharCode((n % 26) + 65) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

/**
 * Converts an Excel-style column label (e.g. "A", "AA") to a 0-based column index.
 */
export function labelToColumnIndex(label: string): number {
  const clean = label.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(clean)) return -1;
  let idx = 0;
  for (let i = 0; i < clean.length; i++) {
    idx = idx * 26 + (clean.charCodeAt(i) - 64);
  }
  return idx - 1;
}

/**
 * Parses a cell address like "B3" into 0-based { row, col }.
 */
export function parseCellAddress(address: string): { row: number; col: number } | null {
  const match = address.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  const col = labelToColumnIndex(match[1]);
  const row = Number(match[2]) - 1;
  if (col < 0 || row < 0) return null;
  return { row, col };
}

/**
 * Formats 0-based { row, col } to an Excel-style cell reference like "B3".
 */
export function formatCellAddress(row: number, col: number): string {
  return `${columnIndexToLabel(col)}${row + 1}`;
}

export function detectSpreadsheetFormat(filename: string): SpreadsheetFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xls')) return 'xls';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  return 'csv';
}

/**
 * Normalizes a 2D array to rectangular shape with at least `minRows` x `minCols`.
 */
export function normalizeGridRows(
  rows: string[][],
  minRows = DEFAULT_MIN_ROWS,
  minCols = DEFAULT_MIN_COLS
): string[][] {
  let maxCols = minCols;
  for (const r of rows) {
    if (r.length > maxCols) maxCols = r.length;
  }
  const targetRows = Math.max(minRows, rows.length);
  const out: string[][] = [];
  for (let r = 0; r < targetRows; r++) {
    const src = rows[r] || [];
    const rowCopy = new Array<string>(maxCols).fill('');
    for (let c = 0; c < src.length; c++) {
      rowCopy[c] = src[c] ?? '';
    }
    out.push(rowCopy);
  }
  return out;
}

/**
 * Parses a `.csv`, `.tsv`, `.xls`, or `.xlsx` file into a normalized SpreadsheetWorkbook.
 */
export function parseSpreadsheetFromInput(input: {
  filename: string;
  textContent?: string;
  binaryContent?: Uint8Array;
  minRows?: number;
  minCols?: number;
}): SpreadsheetWorkbook {
  const sourceFormat = detectSpreadsheetFormat(input.filename);
  const minRows = input.minRows ?? DEFAULT_MIN_ROWS;
  const minCols = input.minCols ?? DEFAULT_MIN_COLS;

  let wb: XLSX.WorkBook;
  if (input.binaryContent && input.binaryContent.byteLength > 0) {
    wb = XLSX.read(input.binaryContent, { type: 'array', cellFormula: true });
  } else {
    const text = input.textContent ?? '';
    wb = XLSX.read(text, { type: 'string', raw: false });
  }

  const sheets: SpreadsheetSheet[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const ref = ws?.['!ref'];
    if (!ws || !ref) {
      return { name, rows: normalizeGridRows([], minRows, minCols) };
    }
    const range = XLSX.utils.decode_range(ref);
    const rowCount = range.e.r - range.s.r + 1;
    const colCount = range.e.c - range.s.c + 1;
    const rawRows: string[][] = Array.from({ length: rowCount }, () =>
      new Array<string>(colCount).fill('')
    );

    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr] as XLSX.CellObject | undefined;
        if (!cell) continue;
        if (cell.f) {
          rawRows[r - range.s.r][c - range.s.c] = `=${cell.f}`;
        } else if (cell.w !== undefined && cell.t !== 'n') {
          rawRows[r - range.s.r][c - range.s.c] = String(cell.w);
        } else if (cell.v !== undefined && cell.v !== null) {
          rawRows[r - range.s.r][c - range.s.c] = String(cell.v);
        }
      }
    }

    return {
      name,
      rows: normalizeGridRows(rawRows, minRows, minCols),
    };
  });

  if (sheets.length === 0) {
    sheets.push({ name: 'Sheet1', rows: normalizeGridRows([], minRows, minCols) });
  }

  return {
    sheets,
    activeSheetIndex: 0,
    sourceFormat,
  };
}

/**
 * Trims trailing completely-empty rows and columns while preserving at least 1x1 cell for serialization.
 */
export function trimTrailingEmptyGrid(rows: string[][]): string[][] {
  let lastRow = -1;
  let lastCol = -1;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if ((rows[r][c] ?? '').trim() !== '') {
        if (r > lastRow) lastRow = r;
        if (c > lastCol) lastCol = c;
      }
    }
  }
  if (lastRow === -1 || lastCol === -1) {
    return [['']];
  }
  const out: string[][] = [];
  for (let r = 0; r <= lastRow; r++) {
    out.push(rows[r].slice(0, lastCol + 1).map((v) => v ?? ''));
  }
  return out;
}

function toTypedCell(raw: string, sheet: SpreadsheetSheet, evalForCsv: boolean): XLSX.CellObject | string | number {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  if (trimmed.startsWith('=')) {
    if (evalForCsv) {
      return evaluateCellDisplay(trimmed, sheet);
    }
    const evaluated = evaluateCellDisplay(trimmed, sheet);
    const numVal = Number(evaluated);
    if (evaluated !== '' && !Number.isNaN(numVal) && Number.isFinite(numVal)) {
      return { t: 'n', v: numVal, f: trimmed.slice(1) };
    }
    return { t: 's', v: evaluated, f: trimmed.slice(1) };
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return raw;
}

/**
 * Serializes a SpreadsheetWorkbook into `.csv`, `.xls`, or `.xlsx` payload.
 */
export function serializeWorkbook(
  workbook: SpreadsheetWorkbook,
  format: SpreadsheetFormat
): { bytes: Uint8Array; text?: string; mimeType: string; extension: string } {
  const wb = XLSX.utils.book_new();
  const isCsv = format === 'csv';

  const sheetsToWrite = isCsv
    ? [workbook.sheets[workbook.activeSheetIndex] || workbook.sheets[0]]
    : workbook.sheets;

  sheetsToWrite.forEach((sheet, idx) => {
    const trimmed = trimTrailingEmptyGrid(sheet.rows);
    const typedAoA = trimmed.map((row) => row.map((cell) => toTypedCell(cell, sheet, isCsv)));
    const ws = XLSX.utils.aoa_to_sheet(typedAoA);
    const safeName = (sheet.name || `Sheet${idx + 1}`).slice(0, 31).replace(/[\\/?*[\]:]/g, '_') || `Sheet${idx + 1}`;
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  });

  if (isCsv) {
    const firstSheetName = wb.SheetNames[0];
    const csvText = XLSX.utils.sheet_to_csv(wb.Sheets[firstSheetName]);
    const encoder = new TextEncoder();
    return {
      bytes: encoder.encode(csvText),
      text: csvText,
      mimeType: 'text/csv;charset=utf-8',
      extension: 'csv',
    };
  }

  const out = XLSX.write(wb, {
    type: 'array',
    bookType: format === 'xls' ? 'xls' : 'xlsx',
  }) as ArrayBuffer | Uint8Array;

  const bytes = out instanceof Uint8Array ? out : new Uint8Array(out);
  return {
    bytes,
    mimeType:
      format === 'xls'
        ? 'application/vnd.ms-excel'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: format,
  };
}

function collectRangeNumericValues(
  startRef: string,
  endRef: string,
  sheet: SpreadsheetSheet,
  visited: Set<string>
): number[] {
  const start = parseCellAddress(startRef);
  const end = parseCellAddress(endRef);
  if (!start || !end) return [];
  const rMin = Math.min(start.row, end.row);
  const rMax = Math.max(start.row, end.row);
  const cMin = Math.min(start.col, end.col);
  const cMax = Math.max(start.col, end.col);

  const nums: number[] = [];
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      const key = formatCellAddress(r, c);
      if (visited.has(key)) continue;
      const raw = sheet.rows[r]?.[c] ?? '';
      if (raw.trim() === '') continue;
      const resolved = raw.startsWith('=')
        ? evaluateCellDisplay(raw, sheet, new Set([...visited, key]))
        : raw;
      const n = Number(resolved);
      if (resolved.trim() !== '' && Number.isFinite(n)) {
        nums.push(n);
      }
    }
  }
  return nums;
}

function evalSimpleArithmetic(expr: string): number | null {
  // Tokenize numbers and + - * / ( ) safely without eval
  const tokens = expr.match(/\d+(?:\.\d+)?|[()+\-*/]/g);
  if (!tokens || tokens.join('') !== expr.replace(/\s+/g, '')) return null;

  let pos = 0;
  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    while (pos < tokens!.length && (tokens![pos] === '+' || tokens![pos] === '-')) {
      const op = tokens![pos++];
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number | null {
    let left = parseFactor();
    if (left === null) return null;
    while (pos < tokens!.length && (tokens![pos] === '*' || tokens![pos] === '/')) {
      const op = tokens![pos++];
      const right = parseFactor();
      if (right === null) return null;
      if (op === '/' && right === 0) return null;
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  function parseFactor(): number | null {
    if (pos >= tokens!.length) return null;
    const tok = tokens![pos];
    if (tok === '-') {
      pos++;
      const inner = parseFactor();
      return inner === null ? null : -inner;
    }
    if (tok === '(') {
      pos++;
      const inner = parseExpr();
      if (inner === null || tokens![pos] !== ')') return null;
      pos++;
      return inner;
    }
    if (/^\d+(?:\.\d+)?$/.test(tok)) {
      pos++;
      return Number(tok);
    }
    return null;
  }

  const res = parseExpr();
  return pos === tokens.length ? res : null;
}

/**
 * Evaluates simple spreadsheet formulas (=SUM(A1:A5), =AVERAGE(...), =MIN(...), =MAX(...), =COUNT(...), =A1+B1)
 * safely without dynamic eval. Returns the raw string if not a formula.
 */
export function evaluateCellDisplay(
  raw: string,
  sheet: SpreadsheetSheet,
  visited = new Set<string>()
): string {
  if (!raw || !raw.startsWith('=')) return raw;
  const formula = raw.slice(1).trim();
  if (!formula) return '';

  const fnMatch = formula.match(/^(SUM|AVERAGE|AVG|MIN|MAX|COUNT)\(\s*([A-Za-z]+\d+)\s*:\s*([A-Za-z]+\d+)\s*\)$/i);
  if (fnMatch) {
    const fn = fnMatch[1].toUpperCase();
    const values = collectRangeNumericValues(fnMatch[2], fnMatch[3], sheet, visited);
    if (fn === 'COUNT') return String(values.length);
    if (values.length === 0) return '0';
    if (fn === 'SUM') {
      const sum = values.reduce((acc, v) => acc + v, 0);
      return Number.isInteger(sum) ? String(sum) : String(Number(sum.toFixed(4)));
    }
    if (fn === 'AVERAGE' || fn === 'AVG') {
      const avg = values.reduce((acc, v) => acc + v, 0) / values.length;
      return Number.isInteger(avg) ? String(avg) : String(Number(avg.toFixed(4)));
    }
    if (fn === 'MIN') return String(Math.min(...values));
    if (fn === 'MAX') return String(Math.max(...values));
  }

  // Substitute single cell references like B2 with numeric values
  const substituted = formula.replace(/\b([A-Za-z]+\d+)\b/g, (ref) => {
    const addr = parseCellAddress(ref);
    if (!addr) return ref;
    const key = formatCellAddress(addr.row, addr.col);
    if (visited.has(key)) return 'NaN';
    const cellRaw = sheet.rows[addr.row]?.[addr.col] ?? '0';
    const resolved = cellRaw.startsWith('=')
      ? evaluateCellDisplay(cellRaw, sheet, new Set([...visited, key]))
      : cellRaw;
    const n = Number(resolved);
    return resolved.trim() === '' ? '0' : Number.isFinite(n) ? String(n) : 'NaN';
  });

  if (substituted.includes('NaN')) return '#VALUE!';
  const numResult = evalSimpleArithmetic(substituted);
  if (numResult === null || !Number.isFinite(numResult)) {
    return raw;
  }
  return Number.isInteger(numResult) ? String(numResult) : String(Number(numResult.toFixed(4)));
}

export function updateSheetCell(
  sheet: SpreadsheetSheet,
  row: number,
  col: number,
  value: string
): SpreadsheetSheet {
  const nextRows = sheet.rows.map((r, rIdx) => {
    if (rIdx !== row) return r;
    const copy = [...r];
    copy[col] = value;
    return copy;
  });
  return { ...sheet, rows: nextRows };
}

export function insertSheetRow(sheet: SpreadsheetSheet, atIndex: number): SpreadsheetSheet {
  const colCount = sheet.rows[0]?.length || DEFAULT_MIN_COLS;
  const clamped = Math.max(0, Math.min(sheet.rows.length, atIndex));
  const newRow = new Array<string>(colCount).fill('');
  const nextRows = [
    ...sheet.rows.slice(0, clamped),
    newRow,
    ...sheet.rows.slice(clamped),
  ];
  return { ...sheet, rows: nextRows };
}

export function deleteSheetRow(sheet: SpreadsheetSheet, rowIndex: number): SpreadsheetSheet {
  if (sheet.rows.length <= 1) {
    return { ...sheet, rows: [new Array<string>(sheet.rows[0]?.length || DEFAULT_MIN_COLS).fill('')] };
  }
  const nextRows = sheet.rows.filter((_, idx) => idx !== rowIndex);
  return { ...sheet, rows: nextRows };
}

export function insertSheetColumn(sheet: SpreadsheetSheet, atIndex: number): SpreadsheetSheet {
  const colCount = sheet.rows[0]?.length || 0;
  const clamped = Math.max(0, Math.min(colCount, atIndex));
  const nextRows = sheet.rows.map((row) => [
    ...row.slice(0, clamped),
    '',
    ...row.slice(clamped),
  ]);
  return { ...sheet, rows: nextRows };
}

export function deleteSheetColumn(sheet: SpreadsheetSheet, colIndex: number): SpreadsheetSheet {
  const colCount = sheet.rows[0]?.length || 1;
  if (colCount <= 1) {
    return { ...sheet, rows: sheet.rows.map(() => ['']) };
  }
  const nextRows = sheet.rows.map((row) => row.filter((_, idx) => idx !== colIndex));
  return { ...sheet, rows: nextRows };
}

export function sortSheetByColumn(
  sheet: SpreadsheetSheet,
  colIndex: number,
  direction: 'asc' | 'desc',
  hasHeaderRow: boolean
): SpreadsheetSheet {
  const startIdx = hasHeaderRow ? 1 : 0;
  const headerRows = sheet.rows.slice(0, startIdx);
  const bodyRows = sheet.rows.slice(startIdx);

  const nonEmpty: string[][] = [];
  const empty: string[][] = [];
  for (const r of bodyRows) {
    if (r.some((cell) => cell.trim() !== '')) {
      nonEmpty.push(r);
    } else {
      empty.push(r);
    }
  }

  nonEmpty.sort((a, b) => {
    const valA = (a[colIndex] ?? '').trim();
    const valB = (b[colIndex] ?? '').trim();
    const numA = Number(valA);
    const numB = Number(valB);
    const bothNumeric = valA !== '' && valB !== '' && Number.isFinite(numA) && Number.isFinite(numB);
    const cmp = bothNumeric
      ? numA - numB
      : valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
    return direction === 'asc' ? cmp : -cmp;
  });

  return {
    ...sheet,
    rows: [...headerRows, ...nonEmpty, ...empty],
  };
}

export function filterSheetRowIndices(
  sheet: SpreadsheetSheet,
  query: string,
  hasHeaderRow: boolean
): number[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return sheet.rows.map((_, i) => i);
  }
  const indices: number[] = [];
  sheet.rows.forEach((row, idx) => {
    if (hasHeaderRow && idx === 0) {
      indices.push(idx);
      return;
    }
    if (row.some((cell) => cell.toLowerCase().includes(trimmed))) {
      indices.push(idx);
    }
  });
  return indices;
}

export function addWorkbookSheet(
  workbook: SpreadsheetWorkbook,
  desiredName?: string
): SpreadsheetWorkbook {
  const existingNames = new Set(workbook.sheets.map((s) => s.name.toLowerCase()));
  let candidate = desiredName?.trim() || `Sheet${workbook.sheets.length + 1}`;
  let suffix = workbook.sheets.length + 1;
  while (existingNames.has(candidate.toLowerCase())) {
    suffix += 1;
    candidate = `Sheet${suffix}`;
  }
  const newSheet: SpreadsheetSheet = {
    name: candidate,
    rows: normalizeGridRows([], DEFAULT_MIN_ROWS, DEFAULT_MIN_COLS),
  };
  return {
    ...workbook,
    sheets: [...workbook.sheets, newSheet],
    activeSheetIndex: workbook.sheets.length,
  };
}

export function renameWorkbookSheet(
  workbook: SpreadsheetWorkbook,
  index: number,
  name: string
): SpreadsheetWorkbook {
  const clean = name.trim().slice(0, 31);
  if (!clean || index < 0 || index >= workbook.sheets.length) return workbook;
  return {
    ...workbook,
    sheets: workbook.sheets.map((s, idx) => (idx === index ? { ...s, name: clean } : s)),
  };
}

export function deleteWorkbookSheet(
  workbook: SpreadsheetWorkbook,
  index: number
): SpreadsheetWorkbook {
  if (workbook.sheets.length <= 1 || index < 0 || index >= workbook.sheets.length) {
    return workbook;
  }
  const nextSheets = workbook.sheets.filter((_, idx) => idx !== index);
  const nextActive = Math.min(workbook.activeSheetIndex, nextSheets.length - 1);
  return {
    ...workbook,
    sheets: nextSheets,
    activeSheetIndex: nextActive,
  };
}
