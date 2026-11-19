'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownAZ,
  ArrowUpZA,
  Columns3,
  Download,
  FileSpreadsheet,
  Plus,
  Redo2,
  Rows3,
  Save,
  Search,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import type { TabItem, WorkspaceFileMeta } from '@/types/workspace';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { getWorkspaceFile, saveWorkspaceFile, triggerBlobDownload } from '@/lib/storage';
import { saveSpreadsheetDocument } from '@/lib/fileOpener';
import {
  addWorkbookSheet,
  columnIndexToLabel,
  deleteSheetColumn,
  deleteSheetRow,
  deleteWorkbookSheet,
  detectSpreadsheetFormat,
  evaluateCellDisplay,
  filterSheetRowIndices,
  formatCellAddress,
  insertSheetColumn,
  insertSheetRow,
  normalizeGridRows,
  parseSpreadsheetFromInput,
  renameWorkbookSheet,
  serializeWorkbook,
  sortSheetByColumn,
  updateSheetCell,
  type SpreadsheetFormat,
  type SpreadsheetWorkbook,
} from '@/lib/spreadsheetUtils';

interface SpreadsheetTabViewProps {
  tab: TabItem;
}

const MAX_UNDO_HISTORY = 50;

interface WorkbookHistoryState {
  current: SpreadsheetWorkbook | null;
  undo: SpreadsheetWorkbook[];
  redo: SpreadsheetWorkbook[];
}

function isNumericDisplay(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^-?\d+(?:\.\d+)?$/.test(trimmed);
}

export function SpreadsheetTabView({ tab }: SpreadsheetTabViewProps) {
  const { updateTab, upsertWorkspaceFile, addDownload } = useWorkspaceStore();

  const [historyState, setHistoryState] = useState<WorkbookHistoryState>({
    current: null,
    undo: [],
    redo: [],
  });
  const workbook = historyState.current;
  const canUndo = historyState.undo.length > 0;
  const canRedo = historyState.redo.length > 0;
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [formulaDraft, setFormulaDraft] = useState<string | null>(null);

  const [hasHeaderRow, setHasHeaderRow] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');
  const [renamingSheetIdx, setRenamingSheetIdx] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const fileMetaRef = useRef<WorkspaceFileMeta | null>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashStatus = useCallback((msg: string) => {
    setStatusMessage(msg);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => {
      setStatusMessage(null);
    }, 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [exportMenuOpen]);

  // Load spreadsheet file from IndexedDB
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tab.fileId) {
        if (!cancelled) {
          setHistoryState({
            current: {
              sheets: [{ name: 'Sheet1', rows: normalizeGridRows([]) }],
              activeSheetIndex: 0,
              sourceFormat: detectSpreadsheetFormat(tab.title),
            },
            undo: [],
            redo: [],
          });
        }
        return;
      }

      try {
        const record = await getWorkspaceFile(tab.fileId);
        if (cancelled) return;
        if (!record) {
          setLoadError('Spreadsheet file could not be found in workspace storage.');
          return;
        }
        fileMetaRef.current = record.meta;
        const parsed = parseSpreadsheetFromInput({
          filename: record.meta.name || tab.title,
          textContent: record.textContent,
          binaryContent: record.binaryContent,
        });
        setHistoryState({
          current: parsed,
          undo: [],
          redo: [],
        });
        setSelectedCell({ row: 0, col: 0 });
        setEditingCell(null);
        setLoadError(null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to parse spreadsheet.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tab.fileId, tab.title]);

  const activeSheet = workbook ? workbook.sheets[workbook.activeSheetIndex] || workbook.sheets[0] : null;

  const commitWorkbookMutation = useCallback(
    (mutator: (prev: SpreadsheetWorkbook) => SpreadsheetWorkbook) => {
      setHistoryState((prev) => {
        if (!prev.current) return prev;
        const next = mutator(prev.current);
        if (next === prev.current) return prev;
        return {
          current: next,
          undo: [...prev.undo.slice(-(MAX_UNDO_HISTORY - 1)), prev.current],
          redo: [],
        };
      });
      updateTab(tab.id, { isDirty: true });
    },
    [tab.id, updateTab]
  );

  const handleUndo = useCallback(() => {
    setHistoryState((prev) => {
      if (!prev.current || prev.undo.length === 0) return prev;
      const previous = prev.undo[prev.undo.length - 1];
      return {
        current: previous,
        undo: prev.undo.slice(0, -1),
        redo: [...prev.redo.slice(-(MAX_UNDO_HISTORY - 1)), prev.current],
      };
    });
    setEditingCell(null);
    setFormulaDraft(null);
    updateTab(tab.id, { isDirty: true });
  }, [tab.id, updateTab]);

  const handleRedo = useCallback(() => {
    setHistoryState((prev) => {
      if (!prev.current || prev.redo.length === 0) return prev;
      const next = prev.redo[prev.redo.length - 1];
      return {
        current: next,
        undo: [...prev.undo.slice(-(MAX_UNDO_HISTORY - 1)), prev.current],
        redo: prev.redo.slice(0, -1),
      };
    });
    setEditingCell(null);
    setFormulaDraft(null);
    updateTab(tab.id, { isDirty: true });
  }, [tab.id, updateTab]);

  const handleSave = useCallback(
    async (saveAs = false) => {
      if (!workbook) return;
      const format = workbook.sourceFormat || detectSpreadsheetFormat(tab.title);
      const serialized = serializeWorkbook(workbook, format);
      const fileId = tab.fileId || `sheet-${Date.now().toString(36)}`;
      const baseMeta: WorkspaceFileMeta = fileMetaRef.current || {
        id: fileId,
        name: tab.title,
        kind: 'spreadsheet',
        sizeBytes: serialized.bytes.byteLength,
        updatedAt: Date.now(),
        folder: 'Spreadsheets',
      };

      const { savedToNativeFile, newFilename } = await saveSpreadsheetDocument(
        fileId,
        tab.title,
        serialized.bytes,
        serialized.mimeType,
        saveAs
      );

      const finalName = newFilename || tab.title;
      const updatedMeta: WorkspaceFileMeta = {
        ...baseMeta,
        id: fileId,
        name: finalName,
        kind: 'spreadsheet',
        sizeBytes: serialized.bytes.byteLength,
        updatedAt: Date.now(),
      };
      fileMetaRef.current = updatedMeta;

      await saveWorkspaceFile({
        id: fileId,
        meta: updatedMeta,
        ...(format === 'csv'
          ? { textContent: serialized.text ?? '' }
          : { binaryContent: serialized.bytes }),
      });

      upsertWorkspaceFile(updatedMeta);
      updateTab(tab.id, {
        fileId,
        title: finalName,
        isDirty: false,
      });

      if (saveAs) {
        addDownload({
          filename: finalName,
          url: `local://${fileId}`,
          mimeType: serialized.mimeType,
          sizeBytes: serialized.bytes.byteLength,
          status: 'completed',
          progress: 100,
        });
      }

      flashStatus(savedToNativeFile ? 'Saved to disk' : 'Saved to workspace');
    },
    [workbook, tab.id, tab.fileId, tab.title, upsertWorkspaceFile, updateTab, addDownload, flashStatus]
  );

  const handleExportFormat = useCallback(
    (format: SpreadsheetFormat) => {
      if (!workbook) return;
      setExportMenuOpen(false);
      const serialized = serializeWorkbook(workbook, format);
      const baseName = tab.title.replace(/\.(xlsx|xls|csv|tsv)$/i, '') || 'Spreadsheet';
      const exportName = `${baseName}.${serialized.extension}`;
      const copy = new Uint8Array(serialized.bytes.byteLength);
      copy.set(serialized.bytes);
      triggerBlobDownload(new Blob([copy.buffer], { type: serialized.mimeType }), exportName);
      addDownload({
        filename: exportName,
        url: `local://${tab.fileId || exportName}`,
        mimeType: serialized.mimeType,
        sizeBytes: serialized.bytes.byteLength,
        status: 'completed',
        progress: 100,
      });
      flashStatus(`Exported ${exportName}`);
    },
    [workbook, tab.title, tab.fileId, addDownload, flashStatus]
  );

  // Listen to global Ctrl/Cmd+S and Ctrl/Cmd+Shift+S commands
  useEffect(() => {
    const onCommand = (e: Event) => {
      const detail = (e as CustomEvent<{ type: string; tabId: string }>).detail;
      if (!detail || detail.tabId !== tab.id) return;
      if (detail.type === 'save') {
        void handleSave(false);
      } else if (detail.type === 'save-as') {
        void handleSave(true);
      }
    };
    window.addEventListener('folio:command', onCommand);
    return () => window.removeEventListener('folio:command', onCommand);
  }, [tab.id, handleSave]);

  const commitCellValue = useCallback(
    (row: number, col: number, value: string) => {
      if (!activeSheet) return;
      const existing = activeSheet.rows[row]?.[col] ?? '';
      if (existing === value) return;
      commitWorkbookMutation((prev) => ({
        ...prev,
        sheets: prev.sheets.map((s, idx) =>
          idx === prev.activeSheetIndex ? updateSheetCell(s, row, col, value) : s
        ),
      }));
    },
    [activeSheet, commitWorkbookMutation]
  );

  const startEditingCell = useCallback(
    (row: number, col: number, initialOverride?: string) => {
      if (!activeSheet) return;
      const raw = initialOverride !== undefined ? initialOverride : activeSheet.rows[row]?.[col] ?? '';
      setSelectedCell({ row, col });
      setEditingCell({ row, col });
      setEditDraft(raw);
      setFormulaDraft(null);
      requestAnimationFrame(() => {
        inlineInputRef.current?.focus();
        if (initialOverride === undefined) {
          inlineInputRef.current?.select();
        }
      });
    },
    [activeSheet]
  );

  const commitInlineEdit = useCallback(
    (moveRow = 0, moveCol = 0) => {
      if (!editingCell || !activeSheet) return;
      commitCellValue(editingCell.row, editingCell.col, editDraft);
      const nextRow = Math.max(0, Math.min(activeSheet.rows.length - 1, editingCell.row + moveRow));
      const colCount = activeSheet.rows[0]?.length || 1;
      const nextCol = Math.max(0, Math.min(colCount - 1, editingCell.col + moveCol));
      setEditingCell(null);
      setSelectedCell({ row: nextRow, col: nextCol });
      setFormulaDraft(null);
    },
    [editingCell, activeSheet, commitCellValue, editDraft]
  );

  const visibleRowIndices = useMemo(() => {
    if (!activeSheet) return [];
    return filterSheetRowIndices(activeSheet, filterQuery, hasHeaderRow);
  }, [activeSheet, filterQuery, hasHeaderRow]);

  const selectedRawValue = activeSheet?.rows[selectedCell.row]?.[selectedCell.col] ?? '';
  const selectedAddress = formatCellAddress(selectedCell.row, selectedCell.col);
  const formulaBarValue = formulaDraft !== null ? formulaDraft : editingCell && editingCell.row === selectedCell.row && editingCell.col === selectedCell.col ? editDraft : selectedRawValue;

  const selectedEvaluated = useMemo(() => {
    if (!activeSheet || !formulaBarValue.startsWith('=')) return null;
    return evaluateCellDisplay(formulaBarValue, activeSheet);
  }, [activeSheet, formulaBarValue]);

  // Grid keyboard navigation when not editing inside an input
  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!activeSheet) return;
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
      return;
    }
    if ((mod && e.key.toLowerCase() === 'z' && e.shiftKey) || (mod && e.key.toLowerCase() === 'y')) {
      e.preventDefault();
      handleRedo();
      return;
    }

    if (editingCell) return;

    const rowCount = activeSheet.rows.length;
    const colCount = activeSheet.rows[0]?.length || 1;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedCell((c) => ({ ...c, row: Math.max(0, c.row - 1) }));
      setFormulaDraft(null);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedCell((c) => ({ ...c, row: Math.min(rowCount - 1, c.row + 1) }));
      setFormulaDraft(null);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSelectedCell((c) => ({ ...c, col: Math.max(0, c.col - 1) }));
      setFormulaDraft(null);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSelectedCell((c) => ({ ...c, col: Math.min(colCount - 1, c.col + 1) }));
      setFormulaDraft(null);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setSelectedCell((c) => ({
        ...c,
        col: e.shiftKey ? Math.max(0, c.col - 1) : Math.min(colCount - 1, c.col + 1),
      }));
      setFormulaDraft(null);
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      startEditingCell(selectedCell.row, selectedCell.col);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      commitCellValue(selectedCell.row, selectedCell.col, '');
      setFormulaDraft(null);
    } else if (!mod && !e.altKey && e.key.length === 1) {
      e.preventDefault();
      startEditingCell(selectedCell.row, selectedCell.col, e.key);
    }
  };

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <FileSpreadsheet className="w-8 h-8 text-emerald-400 mb-3 opacity-80" />
        <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Unable to open spreadsheet</p>
        <p className="text-xs text-[var(--text-muted)] max-w-md">{loadError}</p>
      </div>
    );
  }

  if (!workbook || !activeSheet) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)]">
        Loading spreadsheet…
      </div>
    );
  }

  const colCount = activeSheet.rows[0]?.length || 0;
  const rowCount = activeSheet.rows.length;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--surface-canvas)] select-none">
      {/* Top Spreadsheet Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--border-hairline)] bg-[var(--surface-chrome)] overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => void handleSave(false)}
          title="Save spreadsheet (Ctrl/Cmd+S)"
          className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 transition-colors"
        >
          <Save className="w-3.5 h-3.5 text-[var(--accent-color)]" />
          <span>Save</span>
        </button>

        {/* Export Dropdown */}
        <div ref={exportMenuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setExportMenuOpen((v) => !v)}
            aria-expanded={exportMenuOpen}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-[var(--border-hairline)] hover:bg-[var(--surface-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          {exportMenuOpen && (
            <div
              role="menu"
              aria-label="Export spreadsheet format"
              className="absolute left-0 top-8 z-40 w-44 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] shadow-xl py-1 text-xs"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => handleExportFormat('xlsx')}
                className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-[var(--surface-subtle)] text-[var(--text-primary)]"
              >
                <span>Excel Workbook</span>
                <span className="font-mono text-[11px] text-[var(--text-muted)]">.xlsx</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => handleExportFormat('xls')}
                className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-[var(--surface-subtle)] text-[var(--text-primary)]"
              >
                <span>Excel 97–2003</span>
                <span className="font-mono text-[11px] text-[var(--text-muted)]">.xls</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => handleExportFormat('csv')}
                className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-[var(--surface-subtle)] text-[var(--text-primary)]"
              >
                <span>CSV (Active Sheet)</span>
                <span className="font-mono text-[11px] text-[var(--text-muted)]">.csv</span>
              </button>
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-[var(--border-hairline)] mx-0.5 shrink-0" />

        <button
          type="button"
          onClick={handleUndo}
          disabled={!canUndo}
          aria-label="Undo"
          title="Undo (Ctrl/Cmd+Z)"
          className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] disabled:opacity-30 disabled:pointer-events-none shrink-0"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleRedo}
          disabled={!canRedo}
          aria-label="Redo"
          title="Redo (Ctrl/Cmd+Shift+Z)"
          className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] disabled:opacity-30 disabled:pointer-events-none shrink-0"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-[var(--border-hairline)] mx-0.5 shrink-0" />

        {/* Row / Column Structure Controls */}
        <button
          type="button"
          onClick={() =>
            commitWorkbookMutation((prev) => ({
              ...prev,
              sheets: prev.sheets.map((s, idx) =>
                idx === prev.activeSheetIndex ? insertSheetRow(s, selectedCell.row + 1) : s
              ),
            }))
          }
          title="Insert row below"
          className="flex items-center gap-1 h-7 px-2 rounded-md hover:bg-[var(--surface-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0"
        >
          <Rows3 className="w-3.5 h-3.5" />
          <span>+ Row</span>
        </button>

        <button
          type="button"
          onClick={() =>
            commitWorkbookMutation((prev) => ({
              ...prev,
              sheets: prev.sheets.map((s, idx) =>
                idx === prev.activeSheetIndex ? insertSheetColumn(s, selectedCell.col + 1) : s
              ),
            }))
          }
          title="Insert column right"
          className="flex items-center gap-1 h-7 px-2 rounded-md hover:bg-[var(--surface-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0"
        >
          <Columns3 className="w-3.5 h-3.5" />
          <span>+ Col</span>
        </button>

        <button
          type="button"
          onClick={() => {
            commitWorkbookMutation((prev) => ({
              ...prev,
              sheets: prev.sheets.map((s, idx) =>
                idx === prev.activeSheetIndex ? deleteSheetRow(s, selectedCell.row) : s
              ),
            }));
            setSelectedCell((c) => ({ ...c, row: Math.max(0, c.row - 1) }));
          }}
          title="Delete selected row"
          className="flex items-center gap-1 h-7 px-2 rounded-md hover:bg-[var(--surface-subtle)] text-xs text-[var(--text-secondary)] hover:text-rose-400 whitespace-nowrap shrink-0"
        >
          <Trash2 className="w-3 h-3" />
          <span>Del Row</span>
        </button>

        <button
          type="button"
          onClick={() => {
            commitWorkbookMutation((prev) => ({
              ...prev,
              sheets: prev.sheets.map((s, idx) =>
                idx === prev.activeSheetIndex ? deleteSheetColumn(s, selectedCell.col) : s
              ),
            }));
            setSelectedCell((c) => ({ ...c, col: Math.max(0, c.col - 1) }));
          }}
          title="Delete selected column"
          className="flex items-center gap-1 h-7 px-2 rounded-md hover:bg-[var(--surface-subtle)] text-xs text-[var(--text-secondary)] hover:text-rose-400 whitespace-nowrap shrink-0"
        >
          <Trash2 className="w-3 h-3" />
          <span>Del Col</span>
        </button>

        <div className="h-4 w-px bg-[var(--border-hairline)] mx-0.5 shrink-0" />

        {/* Sort & Header Toggle */}
        <button
          type="button"
          onClick={() =>
            commitWorkbookMutation((prev) => ({
              ...prev,
              sheets: prev.sheets.map((s, idx) =>
                idx === prev.activeSheetIndex
                  ? sortSheetByColumn(s, selectedCell.col, 'asc', hasHeaderRow)
                  : s
              ),
            }))
          }
          title={`Sort column ${columnIndexToLabel(selectedCell.col)} ascending`}
          className="flex items-center gap-1 h-7 px-2 rounded-md hover:bg-[var(--surface-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0"
        >
          <ArrowDownAZ className="w-3.5 h-3.5" />
          <span>Sort A–Z</span>
        </button>

        <button
          type="button"
          onClick={() =>
            commitWorkbookMutation((prev) => ({
              ...prev,
              sheets: prev.sheets.map((s, idx) =>
                idx === prev.activeSheetIndex
                  ? sortSheetByColumn(s, selectedCell.col, 'desc', hasHeaderRow)
                  : s
              ),
            }))
          }
          title={`Sort column ${columnIndexToLabel(selectedCell.col)} descending`}
          className="flex items-center gap-1 h-7 px-2 rounded-md hover:bg-[var(--surface-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0"
        >
          <ArrowUpZA className="w-3.5 h-3.5" />
          <span>Sort Z–A</span>
        </button>

        <button
          type="button"
          onClick={() => setHasHeaderRow((v) => !v)}
          aria-pressed={hasHeaderRow}
          title="Treat row 1 as table header"
          className={`h-7 px-2 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
            hasHeaderRow
              ? 'bg-[var(--accent-soft)] text-[var(--accent-color)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
          }`}
        >
          Row 1 Header
        </button>

        {/* Filter Input */}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {statusMessage && (
            <span className="text-[11px] text-emerald-500 font-medium whitespace-nowrap mr-1">
              {statusMessage}
            </span>
          )}
          <div className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-subtle)] focus-within:border-[var(--accent-color)] w-44">
            <Search className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter rows…"
              aria-label="Filter spreadsheet rows"
              className="flex-1 min-w-0 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery('')}
                aria-label="Clear filter"
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Formula / Cell Inspector Bar */}
      <div className="flex items-center gap-2 px-3 h-8 border-b border-[var(--border-hairline)] bg-[var(--surface-chrome)] text-xs">
        <span
          aria-label="Selected cell address"
          className="w-12 text-center font-mono font-semibold text-[var(--text-primary)] bg-[var(--surface-subtle)] border border-[var(--border-hairline)] rounded py-0.5 tabular-nums shrink-0"
        >
          {selectedAddress}
        </span>
        <span className="font-mono text-[var(--text-muted)] select-none shrink-0">fx</span>
        <input
          type="text"
          aria-label="Cell formula or value"
          value={formulaBarValue}
          onChange={(e) => {
            const val = e.target.value;
            setFormulaDraft(val);
            if (
              editingCell &&
              editingCell.row === selectedCell.row &&
              editingCell.col === selectedCell.col
            ) {
              setEditDraft(val);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitCellValue(selectedCell.row, selectedCell.col, formulaBarValue);
              setFormulaDraft(null);
              setEditingCell(null);
              setSelectedCell((c) => ({ ...c, row: Math.min(rowCount - 1, c.row + 1) }));
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setFormulaDraft(null);
              setEditingCell(null);
            }
          }}
          onBlur={() => {
            if (formulaDraft !== null) {
              commitCellValue(selectedCell.row, selectedCell.col, formulaDraft);
              setFormulaDraft(null);
            }
          }}
          placeholder="Enter value or formula (e.g. =SUM(C2:C5))"
          className="flex-1 min-w-0 bg-transparent font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
        {selectedEvaluated !== null && (
          <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
            = {selectedEvaluated}
          </span>
        )}
      </div>

      {/* High-Density Data Grid */}
      <div
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
        role="grid"
        aria-label={`Spreadsheet ${tab.title}`}
        className="flex-1 overflow-auto bg-[var(--surface-canvas)] focus:outline-none"
      >
        <table className="border-collapse table-fixed text-xs w-max min-w-full">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 w-12 min-w-[48px] h-7 bg-[var(--surface-chrome)] border-b border-r border-[var(--border-strong)] text-[11px] font-medium text-[var(--text-muted)]" />
              {Array.from({ length: colCount }, (_, colIdx) => {
                const isSelectedCol = selectedCell.col === colIdx;
                return (
                  <th
                    key={colIdx}
                    onClick={() => {
                      setSelectedCell((c) => ({ ...c, col: colIdx }));
                      setFormulaDraft(null);
                    }}
                    className={`sticky top-0 z-20 min-w-[128px] w-[140px] h-7 px-2 border-b border-r border-[var(--border-hairline)] text-center font-mono text-[11px] font-medium cursor-pointer transition-colors ${
                      isSelectedCol
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-color)] border-b-[var(--accent-color)]'
                        : 'bg-[var(--surface-chrome)] text-[var(--text-muted)] hover:bg-[var(--surface-subtle)]'
                    }`}
                  >
                    {columnIndexToLabel(colIdx)}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {visibleRowIndices.map((rowIdx) => {
              const row = activeSheet.rows[rowIdx];
              const isHeader = hasHeaderRow && rowIdx === 0;
              const isSelectedRow = selectedCell.row === rowIdx;

              return (
                <tr
                  key={rowIdx}
                  className={isHeader ? 'bg-[var(--surface-chrome)]' : 'hover:bg-[var(--surface-subtle)]/45'}
                >
                  {/* Sticky Row Number */}
                  <th
                    scope="row"
                    onClick={() => {
                      setSelectedCell((c) => ({ ...c, row: rowIdx }));
                      setFormulaDraft(null);
                    }}
                    className={`sticky left-0 z-10 w-12 h-8 px-1.5 border-b border-r border-[var(--border-hairline)] text-center font-mono text-[11px] font-normal tabular-nums cursor-pointer ${
                      isSelectedRow
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-color)] font-semibold'
                        : 'bg-[var(--surface-chrome)] text-[var(--text-muted)]'
                    }`}
                  >
                    {rowIdx + 1}
                  </th>

                  {row.map((rawCell, colIdx) => {
                    const isSelected = selectedCell.row === rowIdx && selectedCell.col === colIdx;
                    const isEditing = editingCell?.row === rowIdx && editingCell?.col === colIdx;
                    const displayValue = rawCell.startsWith('=')
                      ? evaluateCellDisplay(rawCell, activeSheet)
                      : rawCell;
                    const numeric = !isHeader && isNumericDisplay(displayValue);

                    return (
                      <td
                        key={colIdx}
                        onClick={() => {
                          if (editingCell && (editingCell.row !== rowIdx || editingCell.col !== colIdx)) {
                            commitInlineEdit(0, 0);
                          }
                          setSelectedCell({ row: rowIdx, col: colIdx });
                          setFormulaDraft(null);
                        }}
                        onDoubleClick={() => startEditingCell(rowIdx, colIdx)}
                        className={`relative h-8 px-2 border-b border-r border-[var(--border-hairline)] align-middle select-text ${
                          isHeader
                            ? 'font-semibold text-[var(--text-primary)] bg-[var(--surface-chrome)]'
                            : 'text-[var(--text-primary)]'
                        } ${numeric ? 'text-right tabular-nums font-mono' : 'text-left'} ${
                          isSelected
                            ? 'outline outline-2 -outline-offset-2 outline-[var(--accent-color)] bg-[var(--accent-soft)]/35'
                            : ''
                        }`}
                        title={rawCell.startsWith('=') ? `${rawCell} → ${displayValue}` : displayValue}
                      >
                        {isEditing ? (
                          <input
                            ref={inlineInputRef}
                            type="text"
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitInlineEdit(1, 0);
                              } else if (e.key === 'Tab') {
                                e.preventDefault();
                                commitInlineEdit(0, e.shiftKey ? -1 : 1);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditingCell(null);
                                setFormulaDraft(null);
                              }
                            }}
                            onBlur={() => commitInlineEdit(0, 0)}
                            aria-label={`Edit cell ${formatCellAddress(rowIdx, colIdx)}`}
                            className="w-full h-full bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] font-mono focus:outline-none"
                          />
                        ) : (
                          <div className="truncate whitespace-nowrap leading-8">
                            {displayValue}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {visibleRowIndices.length === 0 && (
              <tr>
                <td
                  colSpan={colCount + 1}
                  className="py-10 text-center text-xs text-[var(--text-muted)]"
                >
                  No rows match &ldquo;{filterQuery}&rdquo;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Sheet Tabs & Unboxed Status Summary */}
      <div className="flex items-center justify-between gap-3 px-3 h-9 border-t border-[var(--border-hairline)] bg-[var(--surface-chrome)] text-xs shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0">
          {workbook.sheets.map((sheet, idx) => {
            const isActive = idx === workbook.activeSheetIndex;
            const isRenaming = renamingSheetIdx === idx;
            return (
              <div
                key={`${sheet.name}-${idx}`}
                className={`group flex items-center gap-1 h-6 rounded px-2 border transition-colors shrink-0 ${
                  isActive
                    ? 'bg-[var(--surface-subtle)] border-[var(--border-strong)] text-[var(--text-primary)] font-medium'
                    : 'bg-transparent border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]'
                }`}
              >
                {isRenaming ? (
                  <input
                    type="text"
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        commitWorkbookMutation((prev) => renameWorkbookSheet(prev, idx, renameDraft));
                        setRenamingSheetIdx(null);
                      } else if (e.key === 'Escape') {
                        setRenamingSheetIdx(null);
                      }
                    }}
                    onBlur={() => {
                      commitWorkbookMutation((prev) => renameWorkbookSheet(prev, idx, renameDraft));
                      setRenamingSheetIdx(null);
                    }}
                    aria-label="Rename sheet"
                    className="w-24 bg-transparent text-xs text-[var(--text-primary)] focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryState((prev) =>
                        prev.current
                          ? { ...prev, current: { ...prev.current, activeSheetIndex: idx } }
                          : prev
                      );
                      setSelectedCell({ row: 0, col: 0 });
                      setEditingCell(null);
                      setFormulaDraft(null);
                    }}
                    onDoubleClick={() => {
                      setRenamingSheetIdx(idx);
                      setRenameDraft(sheet.name);
                    }}
                    aria-label={`Sheet ${sheet.name}`}
                    title="Click to switch sheet · Double-click to rename"
                    className="whitespace-nowrap"
                  >
                    {sheet.name}
                  </button>
                )}

                {workbook.sheets.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      commitWorkbookMutation((prev) => deleteWorkbookSheet(prev, idx));
                    }}
                    aria-label={`Delete sheet ${sheet.name}`}
                    className="opacity-0 group-hover:opacity-80 hover:opacity-100 text-[var(--text-muted)] hover:text-rose-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => commitWorkbookMutation((prev) => addWorkbookSheet(prev))}
            aria-label="Add sheet"
            title="Add new sheet"
            className="flex items-center justify-center w-6 h-6 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="text-[11px] text-[var(--text-muted)] tabular-nums whitespace-nowrap shrink-0">
          {filterQuery.trim()
            ? `${visibleRowIndices.length} of ${rowCount} rows`
            : `Sheet ${workbook.activeSheetIndex + 1} of ${workbook.sheets.length} · ${rowCount} rows × ${colCount} cols · ${workbook.sourceFormat.toUpperCase()}`}
        </div>
      </div>
    </div>
  );
}
