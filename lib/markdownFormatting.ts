export interface TextEditSpec {
  from: number;
  to: number;
  insert: string;
  selectionAnchor: number;
  selectionHead: number;
}

export type GfmAlignment = 'left' | 'center' | 'right';

export interface ParsedGfmTable {
  headers: string[];
  alignments: GfmAlignment[];
  rows: string[][];
}

export function computeInlineWrapChange(
  docText: string,
  from: number,
  to: number,
  marker: string,
  placeholder: string
): TextEditSpec {
  const mLen = marker.length;
  const selected = docText.slice(from, to);

  // Case 1: selection itself includes outer markers
  if (
    selected.length >= mLen * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(mLen, selected.length - mLen);
    return {
      from,
      to,
      insert: inner,
      selectionAnchor: from,
      selectionHead: from + inner.length,
    };
  }

  // Case 2: markers sit immediately outside selection
  const before = docText.slice(Math.max(0, from - mLen), from);
  const after = docText.slice(to, Math.min(docText.length, to + mLen));
  if (before === marker && after === marker && from >= mLen) {
    return {
      from: from - mLen,
      to: to + mLen,
      insert: selected,
      selectionAnchor: from - mLen,
      selectionHead: from - mLen + selected.length,
    };
  }

  // Case 3: wrap selection or placeholder
  const inner = selected || placeholder;
  const insert = `${marker}${inner}${marker}`;
  return {
    from,
    to,
    insert,
    selectionAnchor: from + mLen,
    selectionHead: from + mLen + inner.length,
  };
}

function getLineSpan(docText: string, from: number, to: number): { blockFrom: number; blockTo: number; lines: string[] } {
  const blockFrom = docText.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
  const nextNl = docText.indexOf('\n', to);
  const blockTo = nextNl === -1 ? docText.length : nextNl;
  const blockText = docText.slice(blockFrom, blockTo);
  return {
    blockFrom,
    blockTo,
    lines: blockText.split('\n'),
  };
}

export function computeLineHeadingChange(
  docText: string,
  from: number,
  to: number,
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6
): TextEditSpec {
  const { blockFrom, blockTo, lines } = getLineSpan(docText, from, to);
  const prefix = level === 0 ? '' : `${'#'.repeat(level)} `;

  const allAlreadyLevel =
    level > 0 && lines.every((l) => l.startsWith(prefix) && !l.startsWith('#'.repeat(level + 1)));

  const transformed = lines.map((line) => {
    const stripped = line.replace(/^\s*#{1,6}\s+/, '');
    if (level === 0 || allAlreadyLevel) {
      return stripped;
    }
    return `${prefix}${stripped}`;
  });

  const insert = transformed.join('\n');
  const caret = blockFrom + insert.length;
  return {
    from: blockFrom,
    to: blockTo,
    insert,
    selectionAnchor: caret,
    selectionHead: caret,
  };
}

export function computeLinePrefixChange(
  docText: string,
  from: number,
  to: number,
  kind: 'bullet' | 'ordered' | 'task' | 'quote'
): TextEditSpec {
  const { blockFrom, blockTo, lines } = getLineSpan(docText, from, to);

  const isBullet = (l: string) => /^\s*[-*+]\s+(?!\[[ xX]\])/.test(l);
  const isOrdered = (l: string) => /^\s*\d+\.\s+/.test(l);
  const isTask = (l: string) => /^\s*[-*+]\s+\[[ xX]\]\s+/.test(l);
  const isQuote = (l: string) => /^\s*>\s?/.test(l);

  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  const targetLines = nonEmpty.length > 0 ? nonEmpty : lines;

  const alreadySet =
    kind === 'bullet'
      ? targetLines.every(isBullet)
      : kind === 'ordered'
        ? targetLines.every(isOrdered)
        : kind === 'task'
          ? targetLines.every(isTask)
          : targetLines.every(isQuote);

  const stripPrefix = (line: string): { indent: string; body: string } => {
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    const rest = line.slice(indent.length);
    const body = rest
      .replace(/^[-*+]\s+\[[ xX]\]\s+/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/^>\s?/, '');
    return { indent, body };
  };

  let ordIdx = 1;
  const transformed = lines.map((line) => {
    const { indent, body } = stripPrefix(line);
    if (alreadySet) {
      return `${indent}${body}`;
    }
    if (kind === 'bullet') return `${indent}- ${body}`;
    if (kind === 'ordered') return `${indent}${ordIdx++}. ${body}`;
    if (kind === 'task') return `${indent}- [ ] ${body}`;
    return `${indent}> ${body}`;
  });

  const insert = transformed.join('\n');
  const caret = blockFrom + insert.length;
  return {
    from: blockFrom,
    to: blockTo,
    insert,
    selectionAnchor: caret,
    selectionHead: caret,
  };
}

export function computeCodeBlockChange(
  docText: string,
  from: number,
  to: number,
  lang = 'typescript'
): TextEditSpec {
  const selected = docText.slice(from, to);
  const prefixNl = from > 0 && docText[from - 1] !== '\n' ? '\n' : '';
  const suffixNl = to < docText.length && docText[to] !== '\n' ? '\n' : '';
  const body = selected || 'code here';
  const openFence = `${prefixNl}\`\`\`${lang}\n`;
  const closeFence = `\n\`\`\`${suffixNl}`;
  const insert = `${openFence}${body}${closeFence}`;
  return {
    from,
    to,
    insert,
    selectionAnchor: from + openFence.length,
    selectionHead: from + openFence.length + body.length,
  };
}

export function computeLinkChange(
  docText: string,
  from: number,
  to: number,
  defaultUrl = 'https://example.com'
): TextEditSpec {
  const selected = docText.slice(from, to);
  if (selected) {
    const insert = `[${selected}](${defaultUrl})`;
    const urlStart = from + selected.length + 3;
    return {
      from,
      to,
      insert,
      selectionAnchor: urlStart,
      selectionHead: urlStart + defaultUrl.length,
    };
  }
  const label = 'Link text';
  const insert = `[${label}](${defaultUrl})`;
  return {
    from,
    to,
    insert,
    selectionAnchor: from + 1,
    selectionHead: from + 1 + label.length,
  };
}

export function computeImageInsertChange(
  docText: string,
  pos: number,
  alt: string,
  url: string
): TextEditSpec {
  const cleanAlt = alt.trim() || 'image';
  const prefixNl = pos > 0 && docText[pos - 1] !== '\n' ? '\n' : '';
  const suffixNl = pos < docText.length && docText[pos] !== '\n' ? '\n' : '';
  const insert = `${prefixNl}![${cleanAlt}](${url})${suffixNl}`;
  const caret = pos + insert.length;
  return {
    from: pos,
    to: pos,
    insert,
    selectionAnchor: caret,
    selectionHead: caret,
  };
}

export function computeTableInsertChange(
  docText: string,
  pos: number,
  cols = 3,
  rows = 2
): TextEditSpec {
  const safeCols = Math.max(2, Math.min(8, cols));
  const safeRows = Math.max(1, Math.min(12, rows));
  const headers = Array.from({ length: safeCols }, (_, i) => `Column ${i + 1}`);
  const alignments: GfmAlignment[] = Array.from({ length: safeCols }, () => 'left');
  const bodyRows = Array.from({ length: safeRows }, (_, r) =>
    Array.from({ length: safeCols }, (__, c) => (r === 0 && c === 0 ? 'Item' : ''))
  );
  const tableMd = serializeGfmTable({ headers, alignments, rows: bodyRows });
  const prefixNl = pos > 0 && docText[pos - 1] !== '\n' ? '\n\n' : '';
  const suffixNl = pos < docText.length && docText[pos] !== '\n' ? '\n\n' : '\n';
  const insert = `${prefixNl}${tableMd}${suffixNl}`;
  const firstCellOffset = insert.indexOf('Item');
  return {
    from: pos,
    to: pos,
    insert,
    selectionAnchor: pos + firstCellOffset,
    selectionHead: pos + firstCellOffset + 4,
  };
}

export function computeHrInsertChange(docText: string, pos: number): TextEditSpec {
  const prefixNl = pos > 0 && docText[pos - 1] !== '\n' ? '\n\n' : '';
  const insert = `${prefixNl}---\n\n`;
  const caret = pos + insert.length;
  return {
    from: pos,
    to: pos,
    insert,
    selectionAnchor: caret,
    selectionHead: caret,
  };
}

function splitTableRowCells(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) trimmed = trimmed.slice(0, -1);

  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '\\' && i + 1 < trimmed.length && trimmed[i + 1] === '|') {
      current += '\\|';
      i++;
    } else if (ch === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseGfmTable(raw: string): ParsedGfmTable | null {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const headers = splitTableRowCells(lines[0]);
  const delimCells = splitTableRowCells(lines[1]);
  if (headers.length === 0 || delimCells.length === 0) return null;
  if (!delimCells.every((c) => /^:?-{1,}:?$/.test(c))) return null;

  const colCount = Math.max(headers.length, delimCells.length);
  const normHeaders = Array.from({ length: colCount }, (_, i) => headers[i] ?? '');
  const alignments: GfmAlignment[] = Array.from({ length: colCount }, (_, i) => {
    const d = delimCells[i] || '---';
    if (d.startsWith(':') && d.endsWith(':')) return 'center';
    if (d.endsWith(':')) return 'right';
    return 'left';
  });

  const rows = lines.slice(2).map((rowLine) => {
    const cells = splitTableRowCells(rowLine);
    return Array.from({ length: colCount }, (_, i) => cells[i] ?? '');
  });

  return { headers: normHeaders, alignments, rows };
}

export function serializeGfmTable(table: ParsedGfmTable): string {
  const escapeCell = (s: string) => s.replace(/\r?\n/g, ' ').replace(/(?<!\\)\|/g, '\\|').trim();
  const colCount = table.headers.length;
  const headerLine = `| ${table.headers.map(escapeCell).join(' | ')} |`;
  const delimLine = `| ${Array.from({ length: colCount }, (_, i) => {
    const align = table.alignments[i] || 'left';
    if (align === 'center') return ':---:';
    if (align === 'right') return '---:';
    return ':---';
  }).join(' | ')} |`;
  const rowLines = table.rows.map(
    (r) => `| ${Array.from({ length: colCount }, (_, i) => escapeCell(r[i] ?? '')).join(' | ')} |`
  );
  return [headerLine, delimLine, ...rowLines].join('\n');
}

export function updateGfmTableCell(
  raw: string,
  rowIdx: number, // -1 for header, >= 0 for body row
  colIdx: number,
  newValue: string
): string {
  const parsed = parseGfmTable(raw);
  if (!parsed) return raw;
  if (colIdx < 0 || colIdx >= parsed.headers.length) return raw;

  if (rowIdx === -1) {
    parsed.headers[colIdx] = newValue;
  } else if (rowIdx >= 0 && rowIdx < parsed.rows.length) {
    parsed.rows[rowIdx][colIdx] = newValue;
  }
  return serializeGfmTable(parsed);
}

export function addGfmTableRow(raw: string): string {
  const parsed = parseGfmTable(raw);
  if (!parsed) return raw;
  parsed.rows.push(Array.from({ length: parsed.headers.length }, () => ''));
  return serializeGfmTable(parsed);
}

export function addGfmTableColumn(raw: string): string {
  const parsed = parseGfmTable(raw);
  if (!parsed) return raw;
  parsed.headers.push(`Column ${parsed.headers.length + 1}`);
  parsed.alignments.push('left');
  parsed.rows.forEach((r) => r.push(''));
  return serializeGfmTable(parsed);
}

export function removeGfmTableColumn(raw: string, colIdx?: number): string {
  const parsed = parseGfmTable(raw);
  if (!parsed || parsed.headers.length <= 1) return raw;
  const targetIdx = colIdx === undefined ? parsed.headers.length - 1 : colIdx;
  if (targetIdx < 0 || targetIdx >= parsed.headers.length) return raw;

  parsed.headers.splice(targetIdx, 1);
  parsed.alignments.splice(targetIdx, 1);
  parsed.rows = parsed.rows.map((row) => row.filter((_, idx) => idx !== targetIdx));
  return serializeGfmTable(parsed);
}

export function removeGfmTableRow(raw: string, rowIdx?: number): string {
  const parsed = parseGfmTable(raw);
  if (!parsed || parsed.rows.length <= 1) return raw;
  const targetIdx = rowIdx === undefined ? parsed.rows.length - 1 : rowIdx;
  if (targetIdx < 0 || targetIdx >= parsed.rows.length) return raw;

  parsed.rows.splice(targetIdx, 1);
  return serializeGfmTable(parsed);
}

export function swapGfmTableColumns(raw: string, colA: number, colB: number): string {
  const parsed = parseGfmTable(raw);
  if (!parsed) return raw;
  const count = parsed.headers.length;
  if (colA < 0 || colB < 0 || colA >= count || colB >= count || colA === colB) {
    return raw;
  }

  [parsed.headers[colA], parsed.headers[colB]] = [parsed.headers[colB], parsed.headers[colA]];
  [parsed.alignments[colA], parsed.alignments[colB]] = [parsed.alignments[colB], parsed.alignments[colA]];
  for (const row of parsed.rows) {
    [row[colA], row[colB]] = [row[colB], row[colA]];
  }
  return serializeGfmTable(parsed);
}

export function swapGfmTableRows(raw: string, rowA: number, rowB: number): string {
  const parsed = parseGfmTable(raw);
  if (!parsed) return raw;
  const count = parsed.rows.length;
  if (rowA < 0 || rowB < 0 || rowA >= count || rowB >= count || rowA === rowB) {
    return raw;
  }

  [parsed.rows[rowA], parsed.rows[rowB]] = [parsed.rows[rowB], parsed.rows[rowA]];
  return serializeGfmTable(parsed);
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function htmlToMarkdownBasic(html: string): string {
  let out = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');

  // Preformatted blocks first
  out = out.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, code) => {
    return `\n\`\`\`\n${decodeHtmlEntities(code.replace(/<[^>]+>/g, ''))}\n\`\`\`\n`;
  });
  out = out.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => {
    return `\n\`\`\`\n${decodeHtmlEntities(code.replace(/<[^>]+>/g, ''))}\n\`\`\`\n`;
  });

  // Headings
  for (let lvl = 1; lvl <= 6; lvl++) {
    const re = new RegExp(`<h${lvl}[^>]*>([\\s\\S]*?)<\\/h${lvl}>`, 'gi');
    out = out.replace(re, (_, inner) => `\n${'#'.repeat(lvl)} ${inner.replace(/<[^>]+>/g, '').trim()}\n`);
  }

  // Blockquotes & Horizontal rules
  out = out.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
    const clean = inner.replace(/<\/?p[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').trim();
    return `\n${clean.split(/\r?\n/).map((l: string) => `> ${l.trim()}`).join('\n')}\n`;
  });
  out = out.replace(/<hr\s*\/?>/gi, '\n---\n');

  // Lists
  out = out.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_: string, inner: string) => {
    let idx = 1;
    return `\n${inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (__: string, li: string) => `${idx++}. ${li.trim()}\n`)}\n`;
  });
  out = out.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_: string, inner: string) => {
    return `\n${inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (__: string, li: string) => `- ${li.trim()}\n`)}\n`;
  });

  // Inline formatting
  out = out.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  out = out.replace(/<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, '![$2]($1)');
  out = out.replace(/<img[^>]*src=["']([^"']+)["'][^>]*\/?>/gi, '![]($1)');
  out = out.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  out = out.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');
  out = out.replace(/<(del|s|strike)[^>]*>([\s\S]*?)<\/\1>/gi, '~~$2~~');
  out = out.replace(/<mark[^>]*>([\s\S]*?)<\/mark>/gi, '==$1==');
  out = out.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Paragraphs & line breaks
  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(/<\/p>/gi, '\n\n').replace(/<p[^>]*>/gi, '');
  out = out.replace(/<[^>]+>/g, '');

  return decodeHtmlEntities(out).replace(/\n{3,}/g, '\n\n').trim();
}
