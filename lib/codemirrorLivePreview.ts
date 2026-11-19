import { RangeSetBuilder, StateField, type EditorState, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import {
  addGfmTableColumn,
  addGfmTableRow,
  parseGfmTable,
  removeGfmTableColumn,
  removeGfmTableRow,
  swapGfmTableColumns,
  swapGfmTableRows,
  updateGfmTableCell,
} from './markdownFormatting';
import { isWorkspaceAssetRef } from './markdownAssets';
import { getCachedWorkspaceAssetUrl, resolveWorkspaceAssetUrl } from './markdownAssetStore';

export interface LivePreviewOptions {
  onOpenLink?: (url: string) => void;
}

function isSelectionOverlapping(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.from <= to && range.to >= from) {
      return true;
    }
  }
  return false;
}

function isSelectionOnLine(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos);
  return isSelectionOverlapping(state, line.from, line.to);
}

class HeadingTagWidget extends WidgetType {
  constructor(readonly level: number) {
    super();
  }
  eq(other: HeadingTagWidget) {
    return other.level === this.level;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-lp-heading-tag';
    span.textContent = `H${this.level}`;
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
}

class BulletWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-lp-bullet';
    span.textContent = '•';
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
}

class TaskCheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly markerFrom: number,
    readonly markerTo: number
  ) {
    super();
  }
  eq(other: TaskCheckboxWidget) {
    return (
      other.checked === this.checked &&
      other.markerFrom === this.markerFrom &&
      other.markerTo === this.markerTo
    );
  }
  toDOM(view: EditorView) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.checked;
    input.className = 'cm-lp-checkbox';
    input.setAttribute('aria-label', this.checked ? 'Completed task' : 'Incomplete task');
    input.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    input.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const current = view.state.sliceDoc(this.markerFrom, this.markerTo);
      const isCurrentlyChecked = /x/i.test(current);
      view.dispatch({
        changes: {
          from: this.markerFrom,
          to: this.markerTo,
          insert: isCurrentlyChecked ? '[ ]' : '[x]',
        },
      });
    });
    return input;
  }
  ignoreEvent() {
    return true;
  }
}

class HorizontalRuleWidget extends WidgetType {
  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'cm-lp-hr-wrap';
    const hr = document.createElement('hr');
    hr.className = 'cm-lp-hr';
    wrap.appendChild(hr);
    return wrap;
  }
}

class CodeLangBadgeWidget extends WidgetType {
  constructor(readonly lang: string) {
    super();
  }
  eq(other: CodeLangBadgeWidget) {
    return other.lang === this.lang;
  }
  toDOM() {
    const badge = document.createElement('span');
    badge.className = 'cm-lp-code-lang';
    badge.textContent = this.lang;
    return badge;
  }
}

class LinkExternalArrowWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly onOpenLink?: (url: string) => void
  ) {
    super();
  }
  eq(other: LinkExternalArrowWidget) {
    return other.url === this.url;
  }
  toDOM() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cm-lp-link-btn';
    btn.textContent = '↗';
    btn.title = `Open ${this.url}`;
    btn.setAttribute('aria-label', `Open link ${this.url}`);
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onOpenLink?.(this.url);
    });
    return btn;
  }
  ignoreEvent() {
    return true;
  }
}

class InlineImageWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string,
    readonly lineFrom: number
  ) {
    super();
  }
  eq(other: InlineImageWidget) {
    return other.url === this.url && other.alt === this.alt && other.lineFrom === this.lineFrom;
  }
  toDOM(view: EditorView) {
    const fig = document.createElement('figure');
    fig.className = 'cm-lp-image-figure';
    fig.addEventListener('click', () => {
      view.dispatch({ selection: { anchor: this.lineFrom } });
      view.focus();
    });

    const img = document.createElement('img');
    img.alt = this.alt || 'Embedded image';
    img.className = 'cm-lp-image';
    img.referrerPolicy = 'no-referrer';

    const fallback = document.createElement('div');
    fallback.className = 'cm-lp-image-fallback';
    fallback.style.display = 'none';
    fallback.textContent = `Image unavailable: ${this.alt || this.url}`;

    const showFallback = () => {
      img.style.display = 'none';
      fallback.style.display = 'inline-flex';
    };

    img.onerror = showFallback;

    if (isWorkspaceAssetRef(this.url)) {
      const cached = getCachedWorkspaceAssetUrl(this.url);
      if (cached) {
        img.src = cached;
      } else {
        img.style.display = 'none';
        void resolveWorkspaceAssetUrl(this.url).then((resolved) => {
          if (!fig.isConnected) return;
          if (resolved) {
            img.src = resolved;
            img.style.display = 'block';
            fallback.style.display = 'none';
          } else {
            showFallback();
          }
        });
      }
    } else {
      img.src = this.url;
    }

    fig.appendChild(img);
    fig.appendChild(fallback);

    if (this.alt) {
      const cap = document.createElement('figcaption');
      cap.className = 'cm-lp-image-caption';
      cap.textContent = this.alt;
      fig.appendChild(cap);
    }

    return fig;
  }
  ignoreEvent(event: Event) {
    return event.type === 'click';
  }
}

class InteractiveTableWidget extends WidgetType {
  constructor(
    readonly raw: string,
    readonly from: number,
    readonly to: number
  ) {
    super();
  }

  eq(other: InteractiveTableWidget) {
    return other.raw === this.raw && other.from === this.from && other.to === this.to;
  }

  private renderTableInto(container: HTMLElement, view: EditorView) {
    const parsed = parseGfmTable(this.raw);
    if (!parsed) {
      container.textContent = this.raw;
      return;
    }

    container.innerHTML = '';

    const toolbar = document.createElement('div');
    toolbar.className = 'cm-lp-table-bar';

    const label = document.createElement('span');
    label.className = 'cm-lp-table-label';
    label.textContent = `Table · ${parsed.rows.length}×${parsed.headers.length}`;
    toolbar.appendChild(label);

    const actions = document.createElement('div');
    actions.className = 'cm-lp-table-actions';

    let activeRowIdx: number | null = null;
    let activeColIdx: number | null = null;
    let dragPayload: { kind: 'col' | 'row'; index: number } | null = null;

    const readLatestRawFromInputs = () => {
      let currentRaw = this.raw;
      const inputs = container.querySelectorAll<HTMLInputElement>('input[data-row][data-col]');
      inputs.forEach((inp) => {
        const r = Number(inp.dataset.row);
        const c = Number(inp.dataset.col);
        currentRaw = updateGfmTableCell(currentRaw, r, c, inp.value);
      });
      return currentRaw;
    };

    const addRowBtn = document.createElement('button');
    addRowBtn.type = 'button';
    addRowBtn.className = 'cm-lp-table-action';
    addRowBtn.textContent = '+ Row';
    addRowBtn.title = 'Add row';
    addRowBtn.addEventListener('mousedown', (e) => e.preventDefault());
    addRowBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nextRaw = addGfmTableRow(readLatestRawFromInputs());
      view.dispatch({ changes: { from: this.from, to: this.to, insert: nextRaw } });
    });

    const removeRowBtn = document.createElement('button');
    removeRowBtn.type = 'button';
    removeRowBtn.className = 'cm-lp-table-action cm-lp-table-action-danger';
    removeRowBtn.textContent = '- Row';
    removeRowBtn.disabled = parsed.rows.length <= 1;
    removeRowBtn.title = parsed.rows.length <= 1 ? 'At least 1 row is required' : 'Remove active or last row';
    removeRowBtn.setAttribute('aria-label', 'Remove row');
    removeRowBtn.addEventListener('mousedown', (e) => e.preventDefault());
    removeRowBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetRow =
        activeRowIdx !== null && activeRowIdx >= 0 && activeRowIdx < parsed.rows.length
          ? activeRowIdx
          : parsed.rows.length - 1;
      const nextRaw = removeGfmTableRow(readLatestRawFromInputs(), targetRow);
      if (nextRaw !== this.raw) {
        view.dispatch({ changes: { from: this.from, to: this.to, insert: nextRaw } });
      }
    });

    const addColBtn = document.createElement('button');
    addColBtn.type = 'button';
    addColBtn.className = 'cm-lp-table-action';
    addColBtn.textContent = '+ Col';
    addColBtn.title = 'Add column';
    addColBtn.addEventListener('mousedown', (e) => e.preventDefault());
    addColBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nextRaw = addGfmTableColumn(readLatestRawFromInputs());
      view.dispatch({ changes: { from: this.from, to: this.to, insert: nextRaw } });
    });

    const removeColBtn = document.createElement('button');
    removeColBtn.type = 'button';
    removeColBtn.className = 'cm-lp-table-action cm-lp-table-action-danger';
    removeColBtn.textContent = '- Col';
    removeColBtn.disabled = parsed.headers.length <= 1;
    removeColBtn.title =
      parsed.headers.length <= 1 ? 'At least 1 column is required' : 'Remove active or last column';
    removeColBtn.setAttribute('aria-label', 'Remove column');
    removeColBtn.addEventListener('mousedown', (e) => e.preventDefault());
    removeColBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetCol =
        activeColIdx !== null && activeColIdx >= 0 && activeColIdx < parsed.headers.length
          ? activeColIdx
          : parsed.headers.length - 1;
      const nextRaw = removeGfmTableColumn(readLatestRawFromInputs(), targetCol);
      if (nextRaw !== this.raw) {
        view.dispatch({ changes: { from: this.from, to: this.to, insert: nextRaw } });
      }
    });

    const rawBtn = document.createElement('button');
    rawBtn.type = 'button';
    rawBtn.className = 'cm-lp-table-action';
    rawBtn.textContent = '</> Source';
    rawBtn.title = 'Edit raw Markdown pipes';
    rawBtn.addEventListener('mousedown', (e) => e.preventDefault());
    rawBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({ selection: { anchor: this.from } });
      view.focus();
    });

    const makeDivider = () => {
      const sep = document.createElement('span');
      sep.className = 'cm-lp-table-divider';
      sep.setAttribute('aria-hidden', 'true');
      return sep;
    };

    actions.appendChild(addRowBtn);
    actions.appendChild(removeRowBtn);
    actions.appendChild(makeDivider());
    actions.appendChild(addColBtn);
    actions.appendChild(removeColBtn);
    actions.appendChild(makeDivider());
    actions.appendChild(rawBtn);
    toolbar.appendChild(actions);
    container.appendChild(toolbar);

    const scroll = document.createElement('div');
    scroll.className = 'cm-lp-table-scroll';
    const table = document.createElement('table');
    table.className = 'cm-lp-table';

    const formatCellHtml = (rawText: string): string => {
      const escaped = rawText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      if (!escaped) return '<span class="cm-lp-table-empty">·</span>';
      return escaped
        .replace(/`([^`]+)`/g, '<code class="cm-lp-inline-code">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/==([^=]+)==/g, '<mark class="cm-lp-highlight">$1</mark>');
    };

    const readDragPayload = (e: DragEvent): { kind: 'col' | 'row'; index: number } | null => {
      if (dragPayload) return dragPayload;
      try {
        const rawData = e.dataTransfer?.getData('text/plain');
        if (!rawData) return null;
        const parsedData = JSON.parse(rawData) as { kind?: string; index?: number };
        if (
          (parsedData.kind === 'col' || parsedData.kind === 'row') &&
          typeof parsedData.index === 'number'
        ) {
          return { kind: parsedData.kind, index: parsedData.index };
        }
      } catch {
        // Ignore malformed drag data
      }
      return null;
    };

    const clearDropIndicators = () => {
      table
        .querySelectorAll('.cm-lp-table-col-drop, .cm-lp-table-row-drop, .cm-lp-table-dragging')
        .forEach((el) => {
          el.classList.remove('cm-lp-table-col-drop', 'cm-lp-table-row-drop', 'cm-lp-table-dragging');
        });
    };

    const makeCellControl = (val: string, rowIdx: number, colIdx: number, isHeader: boolean) => {
      const cellWrap = document.createElement('div');
      cellWrap.className = 'cm-lp-table-cell-wrap';

      const displayBtn = document.createElement('button');
      displayBtn.type = 'button';
      displayBtn.className = isHeader
        ? 'cm-lp-table-cell cm-lp-table-cell-head'
        : 'cm-lp-table-cell';
      displayBtn.style.textAlign = parsed.alignments[colIdx] || 'left';
      displayBtn.setAttribute(
        'aria-label',
        isHeader
          ? `Edit header column ${colIdx + 1}: ${val || 'empty'}`
          : `Edit row ${rowIdx + 1} column ${colIdx + 1}: ${val || 'empty'}`
      );
      displayBtn.innerHTML = formatCellHtml(val);

      const openEditor = () => {
        activeRowIdx = isHeader ? null : rowIdx;
        activeColIdx = colIdx;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = val;
        input.dataset.row = String(rowIdx);
        input.dataset.col = String(colIdx);
        input.className = isHeader ? 'cm-lp-table-input cm-lp-table-input-head' : 'cm-lp-table-input';
        input.style.textAlign = parsed.alignments[colIdx] || 'left';
        input.setAttribute(
          'aria-label',
          isHeader ? `Table header column ${colIdx + 1}` : `Table row ${rowIdx + 1} column ${colIdx + 1}`
        );

        let committed = false;
        const commit = () => {
          if (committed) return;
          committed = true;
          const nextRaw = updateGfmTableCell(this.raw, rowIdx, colIdx, input.value);
          if (nextRaw !== this.raw) {
            view.dispatch({ changes: { from: this.from, to: this.to, insert: nextRaw } });
          } else {
            cellWrap.replaceChild(displayBtn, input);
          }
        };

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            committed = true;
            cellWrap.replaceChild(displayBtn, input);
          }
        });

        cellWrap.replaceChild(input, displayBtn);
        input.focus();
        input.select();
      };

      displayBtn.addEventListener('mousedown', (e) => e.stopPropagation());
      displayBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openEditor();
      });

      cellWrap.appendChild(displayBtn);
      return cellWrap;
    };

    const thead = document.createElement('thead');
    const headTr = document.createElement('tr');

    // Top-left gutter corner cell
    const cornerTh = document.createElement('th');
    cornerTh.className = 'cm-lp-table-gutter cm-lp-table-gutter-head';
    cornerTh.setAttribute('aria-hidden', 'true');
    headTr.appendChild(cornerTh);

    parsed.headers.forEach((h, cIdx) => {
      const th = document.createElement('th');
      th.style.textAlign = parsed.alignments[cIdx] || 'left';
      th.dataset.colIndex = String(cIdx);

      // Column control bar (drag grip to swap + remove column button)
      const colHandleBar = document.createElement('div');
      colHandleBar.className = 'cm-lp-table-col-handle';

      const colDragGrip = document.createElement('span');
      colDragGrip.className = 'cm-lp-table-drag-grip';
      colDragGrip.draggable = true;
      colDragGrip.dataset.colDrag = String(cIdx);
      colDragGrip.textContent = '⋮⋮';
      colDragGrip.title = 'Drag to swap column';
      colDragGrip.setAttribute('aria-label', `Drag column ${cIdx + 1} to swap`);
      colDragGrip.addEventListener('mousedown', (e) => e.stopPropagation());
      colDragGrip.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        dragPayload = { kind: 'col', index: cIdx };
        th.classList.add('cm-lp-table-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', JSON.stringify(dragPayload));
        }
      });
      colDragGrip.addEventListener('dragend', () => {
        dragPayload = null;
        clearDropIndicators();
      });

      colHandleBar.appendChild(colDragGrip);

      if (parsed.headers.length > 1) {
        const colRemoveBtn = document.createElement('button');
        colRemoveBtn.type = 'button';
        colRemoveBtn.className = 'cm-lp-table-mini-remove';
        colRemoveBtn.textContent = '×';
        colRemoveBtn.title = `Remove column ${cIdx + 1}`;
        colRemoveBtn.setAttribute('aria-label', `Remove column ${cIdx + 1}`);
        colRemoveBtn.addEventListener('mousedown', (e) => e.preventDefault());
        colRemoveBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const nextRaw = removeGfmTableColumn(readLatestRawFromInputs(), cIdx);
          if (nextRaw !== this.raw) {
            view.dispatch({ changes: { from: this.from, to: this.to, insert: nextRaw } });
          }
        });
        colHandleBar.appendChild(colRemoveBtn);
      }

      th.addEventListener('dragover', (e) => {
        const payload = readDragPayload(e);
        if (!payload || payload.kind !== 'col' || payload.index === cIdx) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        th.classList.add('cm-lp-table-col-drop');
      });
      th.addEventListener('dragleave', (e) => {
        if (!th.contains(e.relatedTarget as Node | null)) {
          th.classList.remove('cm-lp-table-col-drop');
        }
      });
      th.addEventListener('drop', (e) => {
        const payload = readDragPayload(e);
        clearDropIndicators();
        dragPayload = null;
        if (!payload || payload.kind !== 'col' || payload.index === cIdx) return;
        e.preventDefault();
        e.stopPropagation();
        const nextRaw = swapGfmTableColumns(readLatestRawFromInputs(), payload.index, cIdx);
        if (nextRaw !== this.raw) {
          view.dispatch({ changes: { from: this.from, to: this.to, insert: nextRaw } });
        }
      });

      th.appendChild(colHandleBar);
      th.appendChild(makeCellControl(h, -1, cIdx, true));
      headTr.appendChild(th);
    });
    thead.appendChild(headTr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    parsed.rows.forEach((row, rIdx) => {
      const tr = document.createElement('tr');
      tr.dataset.rowIndex = String(rIdx);

      // Left row gutter (drag grip to swap + remove row button)
      const gutterTd = document.createElement('td');
      gutterTd.className = 'cm-lp-table-gutter';
      const gutterWrap = document.createElement('div');
      gutterWrap.className = 'cm-lp-table-gutter-inner';

      const rowDragGrip = document.createElement('span');
      rowDragGrip.className = 'cm-lp-table-drag-grip';
      rowDragGrip.draggable = true;
      rowDragGrip.dataset.rowDrag = String(rIdx);
      rowDragGrip.textContent = '⋮⋮';
      rowDragGrip.title = 'Drag to swap row';
      rowDragGrip.setAttribute('aria-label', `Drag row ${rIdx + 1} to swap`);
      rowDragGrip.addEventListener('mousedown', (e) => e.stopPropagation());
      rowDragGrip.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        dragPayload = { kind: 'row', index: rIdx };
        tr.classList.add('cm-lp-table-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', JSON.stringify(dragPayload));
        }
      });
      rowDragGrip.addEventListener('dragend', () => {
        dragPayload = null;
        clearDropIndicators();
      });

      gutterWrap.appendChild(rowDragGrip);

      if (parsed.rows.length > 1) {
        const rowRemoveBtn = document.createElement('button');
        rowRemoveBtn.type = 'button';
        rowRemoveBtn.className = 'cm-lp-table-mini-remove cm-lp-table-row-remove';
        rowRemoveBtn.textContent = '×';
        rowRemoveBtn.title = `Remove row ${rIdx + 1}`;
        rowRemoveBtn.setAttribute('aria-label', `Remove row ${rIdx + 1}`);
        rowRemoveBtn.addEventListener('mousedown', (e) => e.preventDefault());
        rowRemoveBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const nextRaw = removeGfmTableRow(readLatestRawFromInputs(), rIdx);
          if (nextRaw !== this.raw) {
            view.dispatch({ changes: { from: this.from, to: this.to, insert: nextRaw } });
          }
        });
        gutterWrap.appendChild(rowRemoveBtn);
      }

      gutterTd.appendChild(gutterWrap);
      tr.appendChild(gutterTd);

      tr.addEventListener('dragover', (e) => {
        const payload = readDragPayload(e);
        if (!payload || payload.kind !== 'row' || payload.index === rIdx) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        tr.classList.add('cm-lp-table-row-drop');
      });
      tr.addEventListener('dragleave', (e) => {
        if (!tr.contains(e.relatedTarget as Node | null)) {
          tr.classList.remove('cm-lp-table-row-drop');
        }
      });
      tr.addEventListener('drop', (e) => {
        const payload = readDragPayload(e);
        clearDropIndicators();
        dragPayload = null;
        if (!payload || payload.kind !== 'row' || payload.index === rIdx) return;
        e.preventDefault();
        e.stopPropagation();
        const nextRaw = swapGfmTableRows(readLatestRawFromInputs(), payload.index, rIdx);
        if (nextRaw !== this.raw) {
          view.dispatch({ changes: { from: this.from, to: this.to, insert: nextRaw } });
        }
      });

      row.forEach((cell, cIdx) => {
        const td = document.createElement('td');
        td.style.textAlign = parsed.alignments[cIdx] || 'left';
        td.appendChild(makeCellControl(cell, rIdx, cIdx, false));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    scroll.appendChild(table);
    container.appendChild(scroll);
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-lp-table-wrap';
    this.renderTableInto(wrap, view);
    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

function buildBlockDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const items: Array<{ from: number; to: number; deco: Decoration }> = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'Table') {
        if (!isSelectionOverlapping(state, node.from, node.to)) {
          const raw = state.sliceDoc(node.from, node.to);
          if (parseGfmTable(raw)) {
            items.push({
              from: node.from,
              to: node.to,
              deco: Decoration.replace({
                block: true,
                widget: new InteractiveTableWidget(raw, node.from, node.to),
              }),
            });
          }
        }
        return false;
      }

      if (node.name === 'Image') {
        const line = state.doc.lineAt(node.from);
        const rawImg = state.sliceDoc(node.from, node.to);
        const match = rawImg.match(/^!\[([^\]]*)\]\((?:<([^>]+)>|([^)\s]+))(?:\s+(?:"[^"]*"|'[^']*'))?\)/);
        if (match) {
          const alt = match[1];
          const url = match[2] || match[3] || '';
          if (url) {
            items.push({
              from: line.to,
              to: line.to,
              deco: Decoration.widget({
                block: true,
                side: 1,
                widget: new InlineImageWidget(url, alt, line.from),
              }),
            });
          }
        }
        return false;
      }
    },
  });

  items.sort((a, b) => a.from - b.from || a.to - b.to);
  for (const it of items) {
    builder.add(it.from, it.to, it.deco);
  }
  return builder.finish();
}

const livePreviewBlockField = StateField.define<DecorationSet>({
  create(state) {
    return buildBlockDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged || tr.selection) {
      return buildBlockDecorations(tr.state);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function buildVisibleDecorations(view: EditorView, onOpenLink?: (url: string) => void): DecorationSet {
  const { state } = view;
  const decos: Array<{ from: number; to: number; deco: Decoration }> = [];
  const skipHighlightRanges: Array<{ from: number; to: number }> = [];
  const decoratedLines = new Set<number>();

  const pushSingleLineReplace = (from: number, to: number, widget?: WidgetType) => {
    if (from >= to) return;
    const l1 = state.doc.lineAt(from).number;
    const l2 = state.doc.lineAt(to).number;
    if (l1 !== l2) return;
    decos.push({
      from,
      to,
      deco: widget ? Decoration.replace({ widget }) : Decoration.replace({}),
    });
  };

  for (const { from: vFrom, to: vTo } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: vFrom,
      to: vTo,
      enter(node) {
        const name = node.name;

        // Headings
        if (name.startsWith('ATXHeading')) {
          const level = Number(name.slice('ATXHeading'.length)) || 1;
          const line = state.doc.lineAt(node.from);
          if (!decoratedLines.has(line.from)) {
            decoratedLines.add(line.from);
            decos.push({
              from: line.from,
              to: line.from,
              deco: Decoration.line({ class: `cm-lp-h cm-lp-h${level}` }),
            });
          }
          if (!isSelectionOnLine(state, line.from)) {
            const markNode = node.node.getChild('HeaderMark');
            if (markNode) {
              const afterSpace = state.sliceDoc(markNode.to, markNode.to + 1) === ' ' ? markNode.to + 1 : markNode.to;
              pushSingleLineReplace(markNode.from, afterSpace, new HeadingTagWidget(level));
            }
          }
          return;
        }

        // Bold
        if (name === 'StrongEmphasis') {
          decos.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-lp-bold' }),
          });
          if (!isSelectionOverlapping(state, node.from, node.to)) {
            for (const m of node.node.getChildren('EmphasisMark')) {
              pushSingleLineReplace(m.from, m.to);
            }
          }
          return;
        }

        // Italic
        if (name === 'Emphasis') {
          decos.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-lp-italic' }),
          });
          if (!isSelectionOverlapping(state, node.from, node.to)) {
            for (const m of node.node.getChildren('EmphasisMark')) {
              pushSingleLineReplace(m.from, m.to);
            }
          }
          return;
        }

        // Strikethrough
        if (name === 'Strikethrough') {
          decos.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-lp-strike' }),
          });
          if (!isSelectionOverlapping(state, node.from, node.to)) {
            for (const m of node.node.getChildren('StrikethroughMark')) {
              pushSingleLineReplace(m.from, m.to);
            }
          }
          return;
        }

        // Inline Code
        if (name === 'InlineCode') {
          skipHighlightRanges.push({ from: node.from, to: node.to });
          decos.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-lp-inline-code' }),
          });
          if (!isSelectionOverlapping(state, node.from, node.to)) {
            for (const m of node.node.getChildren('CodeMark')) {
              pushSingleLineReplace(m.from, m.to);
            }
          }
          return;
        }

        // Links
        if (name === 'Link') {
          const urlNode = node.node.getChild('URL');
          const urlStr = urlNode ? state.sliceDoc(urlNode.from, urlNode.to) : '';
          decos.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({
              class: 'cm-lp-link',
              attributes: urlStr ? { title: `${urlStr} (Click arrow to open)` } : undefined,
            }),
          });
          if (!isSelectionOverlapping(state, node.from, node.to)) {
            for (const m of node.node.getChildren('LinkMark')) {
              pushSingleLineReplace(m.from, m.to);
            }
            if (urlNode) {
              pushSingleLineReplace(urlNode.from, urlNode.to);
            }
            if (urlStr) {
              decos.push({
                from: node.to,
                to: node.to,
                deco: Decoration.widget({
                  side: 1,
                  widget: new LinkExternalArrowWidget(urlStr, onOpenLink),
                }),
              });
            }
          }
          return;
        }

        // Image inline syntax minimization when cursor is off that line
        if (name === 'Image') {
          if (!isSelectionOnLine(state, node.from)) {
            pushSingleLineReplace(node.from, node.to);
          }
          return false;
        }

        // Blockquotes
        if (name === 'Blockquote') {
          const startLine = state.doc.lineAt(node.from).number;
          const endLine = state.doc.lineAt(node.to).number;
          for (let ln = startLine; ln <= endLine; ln++) {
            const line = state.doc.line(ln);
            decos.push({
              from: line.from,
              to: line.from,
              deco: Decoration.line({ class: 'cm-lp-blockquote' }),
            });
          }
          return;
        }

        if (name === 'QuoteMark') {
          if (!isSelectionOnLine(state, node.from)) {
            const afterSpace = state.sliceDoc(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
            pushSingleLineReplace(node.from, afterSpace);
          }
          return;
        }

        // Task Marker ([ ] / [x]) -> interactive checkbox
        if (name === 'Task') {
          const line = state.doc.lineAt(node.from);
          const marker = node.node.getChild('TaskMarker');
          if (marker) {
            const markerText = state.sliceDoc(marker.from, marker.to);
            const checked = /x/i.test(markerText);
            if (!isSelectionOverlapping(state, marker.from, marker.to)) {
              pushSingleLineReplace(
                marker.from,
                marker.to,
                new TaskCheckboxWidget(checked, marker.from, marker.to)
              );
            }
            if (checked && marker.to + 1 < line.to) {
              decos.push({
                from: marker.to + 1,
                to: line.to,
                deco: Decoration.mark({ class: 'cm-lp-task-done' }),
              });
            }
          }
          return;
        }

        // List markers (-, *, 1.)
        if (name === 'ListMark') {
          const parent = node.node.parent;
          const isTaskItem = Boolean(parent?.getChild('Task'));
          const markText = state.sliceDoc(node.from, node.to);
          const isBullet = markText === '-' || markText === '*' || markText === '+';
          if (isTaskItem) {
            if (!isSelectionOnLine(state, node.from)) {
              const afterSpace = state.sliceDoc(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
              pushSingleLineReplace(node.from, afterSpace);
            }
          } else if (isBullet) {
            if (!isSelectionOnLine(state, node.from)) {
              pushSingleLineReplace(node.from, node.to, new BulletWidget());
            }
          } else {
            decos.push({
              from: node.from,
              to: node.to,
              deco: Decoration.mark({ class: 'cm-lp-ordered-mark' }),
            });
          }
          return;
        }

        // Horizontal Rule
        if (name === 'HorizontalRule') {
          if (!isSelectionOnLine(state, node.from)) {
            pushSingleLineReplace(node.from, node.to, new HorizontalRuleWidget());
          }
          return;
        }

        // Fenced Code Block
        if (name === 'FencedCode') {
          skipHighlightRanges.push({ from: node.from, to: node.to });
          const startLine = state.doc.lineAt(node.from).number;
          const endLine = state.doc.lineAt(node.to).number;
          const active = isSelectionOverlapping(state, node.from, node.to);

          for (let ln = startLine; ln <= endLine; ln++) {
            const line = state.doc.line(ln);
            const classes = ['cm-lp-codeblock-line'];
            if (ln === startLine) classes.push('cm-lp-codeblock-first');
            if (ln === endLine) classes.push('cm-lp-codeblock-last');
            decos.push({
              from: line.from,
              to: line.from,
              deco: Decoration.line({ class: classes.join(' ') }),
            });
          }

          if (!active) {
            const marks = node.node.getChildren('CodeMark');
            const info = node.node.getChild('CodeInfo');
            for (const m of marks) {
              pushSingleLineReplace(m.from, m.to);
            }
            if (info) {
              const lang = state.sliceDoc(info.from, info.to).trim();
              if (lang) {
                pushSingleLineReplace(info.from, info.to, new CodeLangBadgeWidget(lang));
              }
            }
          }
          return false;
        }
      },
    });

    // Inline Highlight syntax scan (`==text==` and `<mark>text</mark>`) on visible text
    const startLine = state.doc.lineAt(vFrom).number;
    const endLine = state.doc.lineAt(vTo).number;
    for (let ln = startLine; ln <= endLine; ln++) {
      const line = state.doc.line(ln);
      const inSkip = skipHighlightRanges.some((r) => line.from >= r.from && line.to <= r.to);
      if (inSkip) continue;

      const eqRe = /==([^=\n]+?)==/g;
      let m: RegExpExecArray | null;
      while ((m = eqRe.exec(line.text)) !== null) {
        const mFrom = line.from + m.index;
        const mTo = mFrom + m[0].length;
        if (skipHighlightRanges.some((r) => mFrom < r.to && mTo > r.from)) continue;
        decos.push({
          from: mFrom,
          to: mTo,
          deco: Decoration.mark({ class: 'cm-lp-highlight' }),
        });
        if (!isSelectionOverlapping(state, mFrom, mTo)) {
          pushSingleLineReplace(mFrom, mFrom + 2);
          pushSingleLineReplace(mTo - 2, mTo);
        }
      }

      const tagRe = /<mark>([^<\n]+?)<\/mark>/gi;
      while ((m = tagRe.exec(line.text)) !== null) {
        const mFrom = line.from + m.index;
        const mTo = mFrom + m[0].length;
        if (skipHighlightRanges.some((r) => mFrom < r.to && mTo > r.from)) continue;
        decos.push({
          from: mFrom,
          to: mTo,
          deco: Decoration.mark({ class: 'cm-lp-highlight' }),
        });
        if (!isSelectionOverlapping(state, mFrom, mTo)) {
          pushSingleLineReplace(mFrom, mFrom + 6);
          pushSingleLineReplace(mTo - 7, mTo);
        }
      }
    }
  }

  return Decoration.set(
    decos.map((d) => d.deco.range(d.from, d.to)),
    true
  );
}

function createLivePreviewPlugin(onOpenLink?: (url: string) => void) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildVisibleDecorations(view, onOpenLink);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildVisibleDecorations(update.view, onOpenLink);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}

const livePreviewBaseTheme = EditorView.baseTheme({
  '.cm-lp-h': {
    fontFamily: 'var(--font-display)',
    fontWeight: '700',
    letterSpacing: '-0.02em',
    color: 'var(--text-primary) !important',
    paddingTop: '10px',
    paddingBottom: '4px',
  },
  '.cm-lp-h span': {
    color: 'inherit',
  },
  '.cm-lp-h1': {
    fontSize: '1.85em',
    lineHeight: '1.25',
    borderBottom: '1px solid var(--border-hairline)',
    paddingBottom: '6px',
    marginBottom: '4px',
  },
  '.cm-lp-h2': {
    fontSize: '1.42em',
    lineHeight: '1.3',
    fontWeight: '650',
  },
  '.cm-lp-h3': {
    fontSize: '1.18em',
    lineHeight: '1.35',
    fontWeight: '600',
  },
  '.cm-lp-h4, .cm-lp-h5, .cm-lp-h6': {
    fontSize: '1.02em',
    lineHeight: '1.4',
    fontWeight: '600',
  },
  '.cm-lp-heading-tag': {
    display: 'inline-block',
    fontSize: '10px',
    fontWeight: '600',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted) !important',
    opacity: '0.55',
    marginRight: '8px',
    verticalAlign: 'middle',
    letterSpacing: '0.03em',
    userSelect: 'none',
  },
  '.cm-lp-bold': {
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  '.cm-lp-italic': {
    fontStyle: 'italic',
  },
  '.cm-lp-strike': {
    textDecoration: 'line-through',
    opacity: '0.68',
  },
  '.cm-lp-highlight': {
    backgroundColor: 'rgba(250, 204, 21, 0.3)',
    borderRadius: '3px',
    padding: '0 2px',
  },
  '.cm-lp-inline-code': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.88em',
    backgroundColor: 'var(--surface-subtle)',
    padding: '1px 5px',
    borderRadius: '4px',
    border: '1px solid var(--border-hairline)',
  },
  '.cm-lp-link': {
    color: 'var(--accent-color)',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
    cursor: 'text',
  },
  '.cm-lp-link-btn': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: '2px',
    padding: '0 3px',
    fontSize: '10px',
    color: 'var(--accent-color)',
    opacity: '0.7',
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    verticalAlign: 'baseline',
  },
  '.cm-lp-link-btn:hover': {
    opacity: '1',
  },
  '.cm-lp-blockquote': {
    borderLeft: '3px solid var(--accent-color)',
    paddingLeft: '14px !important',
    color: 'var(--text-secondary)',
    backgroundColor: 'rgba(128, 128, 140, 0.06)',
  },
  '.cm-lp-bullet': {
    color: 'var(--accent-color)',
    fontWeight: '700',
    fontSize: '1.1em',
    paddingRight: '2px',
    userSelect: 'none',
  },
  '.cm-lp-ordered-mark': {
    color: 'var(--accent-color)',
    fontWeight: '600',
  },
  '.cm-lp-checkbox': {
    width: '14px',
    height: '14px',
    verticalAlign: '-2px',
    marginRight: '4px',
    accentColor: 'var(--accent-color)',
    cursor: 'pointer',
  },
  '.cm-lp-task-done': {
    textDecoration: 'line-through',
    opacity: '0.6',
  },
  '.cm-lp-hr-wrap': {
    display: 'block',
    padding: '8px 0',
  },
  '.cm-lp-hr': {
    border: 'none',
    borderTop: '1px solid var(--border-strong)',
    margin: '0',
  },
  '.cm-lp-codeblock-line': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.88em',
    backgroundColor: 'var(--surface-subtle)',
    paddingLeft: '14px !important',
    paddingRight: '14px !important',
    borderLeft: '1px solid var(--border-hairline)',
    borderRight: '1px solid var(--border-hairline)',
  },
  '.cm-lp-codeblock-first': {
    borderTop: '1px solid var(--border-hairline)',
    borderTopLeftRadius: '6px',
    borderTopRightRadius: '6px',
    paddingTop: '6px',
  },
  '.cm-lp-codeblock-last': {
    borderBottom: '1px solid var(--border-hairline)',
    borderBottomLeftRadius: '6px',
    borderBottomRightRadius: '6px',
    paddingBottom: '6px',
  },
  '.cm-lp-muted-syntax': {
    opacity: '0.35',
    fontSize: '0.82em',
  },
  '.cm-lp-code-lang': {
    display: 'inline-block',
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
    backgroundColor: 'var(--surface-chrome)',
    border: '1px solid var(--border-hairline)',
    borderRadius: '4px',
    padding: '0 6px',
    marginLeft: '4px',
  },
  '.cm-lp-image-figure': {
    margin: '8px 0',
    padding: '6px',
    borderRadius: '8px',
    border: '1px solid var(--border-hairline)',
    backgroundColor: 'var(--surface-chrome)',
    display: 'inline-block',
    maxWidth: '100%',
    cursor: 'pointer',
  },
  '.cm-lp-image': {
    maxWidth: '100%',
    maxHeight: '360px',
    borderRadius: '6px',
    display: 'block',
  },
  '.cm-lp-image-fallback': {
    padding: '10px 14px',
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  '.cm-lp-image-caption': {
    marginTop: '4px',
    fontSize: '11px',
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
  '.cm-lp-table-wrap': {
    margin: '10px 0',
    borderRadius: '8px',
    border: '1px solid var(--border-hairline)',
    backgroundColor: 'var(--surface-chrome)',
    overflow: 'hidden',
  },
  '.cm-lp-table-bar': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 10px',
    borderBottom: '1px solid var(--border-hairline)',
    backgroundColor: 'var(--surface-subtle)',
    fontSize: '11px',
  },
  '.cm-lp-table-label': {
    color: 'var(--text-muted)',
    fontWeight: '500',
  },
  '.cm-lp-table-actions': {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  '.cm-lp-table-divider': {
    width: '1px',
    height: '12px',
    backgroundColor: 'var(--border-hairline)',
    margin: '0 2px',
  },
  '.cm-lp-table-action': {
    padding: '2px 7px',
    borderRadius: '4px',
    border: '1px solid var(--border-hairline)',
    backgroundColor: 'var(--surface-chrome)',
    color: 'var(--text-secondary)',
    fontSize: '10px',
    cursor: 'pointer',
  },
  '.cm-lp-table-action:hover': {
    color: 'var(--text-primary)',
    borderColor: 'var(--border-strong)',
  },
  '.cm-lp-table-action:disabled': {
    opacity: '0.35',
    cursor: 'not-allowed',
  },
  '.cm-lp-table-action-danger:hover:not(:disabled)': {
    color: '#f43f5e',
    borderColor: 'rgba(244, 63, 94, 0.45)',
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
  },
  '.cm-lp-table-scroll': {
    overflowX: 'auto',
  },
  '.cm-lp-table': {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  '.cm-lp-table th, .cm-lp-table td': {
    borderBottom: '1px solid var(--border-hairline)',
    borderRight: '1px solid var(--border-hairline)',
    padding: '0',
    minWidth: '90px',
    verticalAlign: 'top',
  },
  '.cm-lp-table th.cm-lp-table-gutter, .cm-lp-table td.cm-lp-table-gutter': {
    width: '44px',
    minWidth: '44px',
    maxWidth: '44px',
    backgroundColor: 'rgba(128, 128, 140, 0.06)',
    verticalAlign: 'middle',
  },
  '.cm-lp-table th:last-child, .cm-lp-table td:last-child': {
    borderRight: 'none',
  },
  '.cm-lp-table tr:last-child td': {
    borderBottom: 'none',
  },
  '.cm-lp-table th': {
    backgroundColor: 'rgba(128, 128, 140, 0.08)',
  },
  '.cm-lp-table-col-handle': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px 2px 8px',
    minHeight: '20px',
    gap: '4px',
  },
  '.cm-lp-table-gutter-inner': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    padding: '0 4px',
    minHeight: '30px',
  },
  '.cm-lp-table-drag-grip': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1px 4px',
    borderRadius: '3px',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    letterSpacing: '-1px',
    lineHeight: '1',
    cursor: 'grab',
    userSelect: 'none',
    opacity: '0.78',
  },
  '.cm-lp-table-drag-grip:hover': {
    opacity: '1',
    color: 'var(--text-primary)',
    backgroundColor: 'rgba(128, 128, 140, 0.16)',
  },
  '.cm-lp-table-drag-grip:active': {
    cursor: 'grabbing',
  },
  '.cm-lp-table-mini-remove': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    padding: '0',
    borderRadius: '3px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    lineHeight: '1',
    cursor: 'pointer',
    opacity: '0.72',
  },
  '.cm-lp-table-mini-remove:hover': {
    opacity: '1',
    color: '#f43f5e',
    backgroundColor: 'rgba(244, 63, 94, 0.14)',
  },
  '.cm-lp-table tr:hover .cm-lp-table-row-remove, .cm-lp-table th:hover .cm-lp-table-mini-remove': {
    opacity: '1',
  },
  '.cm-lp-table-col-drop': {
    outline: '2px solid var(--accent-color)',
    outlineOffset: '-2px',
    backgroundColor: 'var(--accent-soft) !important',
  },
  '.cm-lp-table-row-drop td': {
    backgroundColor: 'var(--accent-soft)',
    borderTop: '2px solid var(--accent-color)',
  },
  '.cm-lp-table-dragging': {
    opacity: '0.45',
  },
  '.cm-lp-table-cell-wrap': {
    width: '100%',
  },
  '.cm-lp-table-cell': {
    width: '100%',
    display: 'block',
    padding: '5px 10px 7px 10px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontFamily: 'var(--font-body)',
    lineHeight: '1.45',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    cursor: 'text',
  },
  '.cm-lp-table-cell:hover': {
    backgroundColor: 'rgba(128, 128, 140, 0.05)',
  },
  '.cm-lp-table-cell-head': {
    fontWeight: '600',
  },
  '.cm-lp-table-empty': {
    color: 'var(--text-muted)',
    opacity: '0.4',
  },
  '.cm-lp-table-input': {
    width: '100%',
    padding: '5px 10px 7px 10px',
    border: 'none',
    backgroundColor: 'var(--accent-soft)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontFamily: 'var(--font-body)',
    lineHeight: '1.45',
    outline: 'none',
  },
  '.cm-lp-table-input-head': {
    fontWeight: '600',
  },
});

export function createLivePreviewExtensions(options: LivePreviewOptions = {}): Extension[] {
  return [
    livePreviewBlockField,
    createLivePreviewPlugin(options.onOpenLink),
    livePreviewBaseTheme,
  ];
}
