'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  BookmarkPlus,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Download,
  Eraser,
  FileImage,
  FileText,
  Highlighter,
  Image as ImageIcon,
  Info,
  Keyboard,
  Layers,
  LayoutGrid,
  ListTree,
  Lock,
  Maximize2,
  MessageSquare,
  Minimize2,
  Minus,
  MousePointer,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  PenTool,
  Plus,
  Printer,
  Redo2,
  RotateCw,
  Save,
  Search,
  SlidersHorizontal,
  Square,
  Circle,
  Stamp,
  StickyNote,
  Strikethrough,
  TextCursorInput,
  Trash2,
  Type,
  Underline,
  Undo2,
} from 'lucide-react';
import type {
  PdfAnnotation,
  PdfExportMode,
  PdfLayer,
  PdfLayoutMode,
  PdfTool,
  SavedStampTemplate,
  StampStyle,
  TabItem,
} from '@/types/workspace';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import {
  getPdfOverlayState,
  getWorkspaceFile,
  savePdfAnnotations,
  savePdfLayers,
  saveWorkspaceFile,
  triggerBlobDownload,
} from '@/lib/storage';
import {
  DEFAULT_LAYER_ID,
  createLayer,
  deleteLayer,
  ensureLayers,
  getHiddenLayerAnnotations,
  getLayerById,
  isLayerLocked,
  moveLayer,
  resolveAnnotationLayerId,
} from '@/lib/pdfLayers';
import { loadPdfDocument } from '@/lib/pdfJsLoader';
import {
  extractAcroFormFields,
  inspectPdfMetadata,
  saveAnnotationsAndFormsToPdf,
  type AcroFormFieldDescriptor,
  type PdfMetadataInfo,
} from '@/lib/pdfOperations';
import { formatBytes } from '@/lib/pageRange';
import { resourceManager } from '@/lib/resourceManager';
import {
  cloneAnnotationForPaste,
  createQuickAnnotationAt,
  isEditableKeyboardTarget,
  nudgeAnnotationPosition,
  reorderAnnotationStack,
  resolvePdfShortcut,
} from '@/lib/pdfEditorInteractions';
import {
  annotationToStampTemplate,
  buildStampAnnotation,
  normalizeStampLabel,
  resolveStampTemplateSubtext,
  STAMP_COLOR_PALETTE,
} from '@/lib/stampTemplates';
import { PdfPageCanvas } from './PdfPageCanvas';
import { LazyPdfThumbnail } from './LazyPdfThumbnail';
import { PdfLayersPanel } from './PdfLayersPanel';
import { PdfImageExportDialog } from './PdfImageExportDialog';
import { PdfSignatureModal } from './PdfSignatureModal';
import { PdfPageOrganizerModal } from './PdfPageOrganizerModal';
import { PdfWatermarkAndMetaModal } from './PdfWatermarkAndMetaModal';
import { PdfContextMenu, type PdfContextMenuState } from './PdfContextMenu';
import { PdfShortcutsModal } from './PdfShortcutsModal';
import { PdfStampPicker } from './PdfStampPicker';

interface PdfStudioViewProps {
  tab: TabItem;
}

interface OutlineNode {
  title: string;
  destPage: number | null;
}

const TOOL_COLORS = ['#facc15', '#34d399', '#60a5fa', '#f472b6', '#fb7185', '#111827'];

export function PdfStudioView({ tab }: PdfStudioViewProps) {
  const {
    settings,
    savedStamps,
    addSavedStamp,
    removeSavedStamp,
    resetSavedStamps,
    updateTab,
    upsertWorkspaceFile,
    addDownload,
  } = useWorkspaceStore();

  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(settings.pdfDefaultZoom || 1.15);
  const [layoutMode, setLayoutMode] = useState<PdfLayoutMode>(settings.pdfDefaultLayout || 'continuous');
  const [rotationDelta, setRotationDelta] = useState(0);
  const [pageSizePt, setPageSizePt] = useState({ width: 612, height: 792 });

  // Password prompt for encrypted PDFs
  const [passwordNeeded, setPasswordNeeded] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Sidebars & Panels (Resizable & Collapsible)
  const [leftPanel, setLeftPanel] = useState<'none' | 'thumbnails' | 'outline' | 'layers' | 'search' | 'info'>('thumbnails');
  const [lastLeftPanel, setLastLeftPanel] = useState<'thumbnails' | 'outline' | 'layers' | 'search' | 'info'>('thumbnails');
  const [leftPanelWidth, setLeftPanelWidth] = useState(208);
  const [rightCommentsOpen, setRightCommentsOpen] = useState(true);
  const [rightPanelWidth, setRightPanelWidth] = useState(256);
  const [resizingSide, setResizingSide] = useState<'left' | 'right' | null>(null);
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [metadataInfo, setMetadataInfo] = useState<PdfMetadataInfo | null>(null);
  const [evictedPages, setEvictedPages] = useState<Record<number, boolean>>({});
  const renderedOrderRef = useRef<number[]>([]);
  const resizeDragRef = useRef<{ side: 'left' | 'right'; startX: number; startWidth: number } | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<Array<{ page: number; snippet: string }>>([]);
  const [searching, setSearching] = useState(false);

  // Layers, Annotations & Components + Undo/Redo
  const [layers, setLayers] = useState<PdfLayer[]>(() => ensureLayers([]));
  const [activeLayerId, setActiveLayerId] = useState<string>(DEFAULT_LAYER_ID);
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [undoStack, setUndoStack] = useState<PdfAnnotation[][]>([]);
  const [redoStack, setRedoStack] = useState<PdfAnnotation[][]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<PdfTool>('select');
  const [activeColor, setActiveColor] = useState('#facc15');
  const [activeStrokeWidth, setActiveStrokeWidth] = useState(2);
  const [activeStampLabel, setActiveStampLabel] = useState('REVIEWED');
  const [activeStampSubtext, setActiveStampSubtext] = useState('');
  const [activeStampStyle, setActiveStampStyle] = useState<StampStyle>('outline');
  const [stampPickerOpen, setStampPickerOpen] = useState(false);
  const [editingStampId, setEditingStampId] = useState<string | null>(null);

  // AcroForms & Export Mode
  const [formFields, setFormFields] = useState<AcroFormFieldDescriptor[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});
  const [exportMode, setExportMode] = useState<PdfExportMode>('editable');

  // Modals, Context Menu, Clipboard & Fullscreen
  const [copiedAnnotation, setCopiedAnnotation] = useState<PdfAnnotation | null>(null);
  const [contextMenu, setContextMenu] = useState<PdfContextMenuState | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [exportImagesOpen, setExportImagesOpen] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [organizerModalOpen, setOrganizerModalOpen] = useState(false);
  const [watermarkModalOpen, setWatermarkModalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const currentPageRef = useRef(currentPage);
  const scrollSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    currentPageRef.current = currentPage;
    return () => {
      if (scrollSyncTimerRef.current) clearTimeout(scrollSyncTimerRef.current);
    };
  }, [currentPage]);

  useEffect(() => {
    if (!resizingSide) return;
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onPointerMove = (ev: PointerEvent) => {
      const drag = resizeDragRef.current;
      if (!drag) return;
      if (drag.side === 'left') {
        const raw = drag.startWidth + (ev.clientX - drag.startX);
        if (raw < 95) {
          setLeftPanel('none');
          resizeDragRef.current = null;
          setResizingSide(null);
          return;
        }
        setLeftPanelWidth(Math.max(150, Math.min(420, Math.round(raw))));
      } else {
        const raw = drag.startWidth - (ev.clientX - drag.startX);
        if (raw < 110) {
          setRightCommentsOpen(false);
          resizeDragRef.current = null;
          setResizingSide(null);
          return;
        }
        setRightPanelWidth(Math.max(180, Math.min(480, Math.round(raw))));
      }
    };

    const stopResize = () => {
      resizeDragRef.current = null;
      setResizingSide(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
    };
  }, [resizingSide]);

  const startResize = (side: 'left' | 'right', e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizeDragRef.current = {
      side,
      startX: e.clientX,
      startWidth: side === 'left' ? leftPanelWidth : rightPanelWidth,
    };
    setResizingSide(side);
  };

  const selectLeftPanel = (panel: 'thumbnails' | 'outline' | 'layers' | 'search' | 'info') => {
    if (leftPanel === panel) {
      setLeftPanel('none');
    } else {
      setLastLeftPanel(panel);
      setLeftPanel(panel);
    }
  };

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2600);
  };

  const loadFromBytes = useCallback(
    async (bytes: Uint8Array, password?: string) => {
      const pdfResourceId = `pdf-${tab.id}`;
      try {
        const doc = await loadPdfDocument(bytes, password);
        setPasswordNeeded(false);
        setPasswordError(null);
        renderedOrderRef.current = [];
        setEvictedPages({});

        resourceManager.registerPdfDoc(pdfResourceId, tab.id, async () => {
          await doc.cleanup().catch(() => {});
          await doc.loadingTask.destroy().catch(() => {});
        });
        setPdfDoc(doc);
        setNumPages(doc.numPages);

        const firstPage = await doc.getPage(1);
        const vp = firstPage.getViewport({ scale: 1 });
        setPageSizePt({ width: vp.width, height: vp.height });
        firstPage.cleanup();

        // Extract outline
        try {
          const rawOutline = await doc.getOutline();
          if (rawOutline) {
            const parsedOutline: OutlineNode[] = [];
            for (const item of rawOutline) {
              let destPage: number | null = null;
              if (Array.isArray(item.dest) && item.dest[0]) {
                try {
                  const idx = await doc.getPageIndex(item.dest[0]);
                  destPage = idx + 1;
                } catch {
                  destPage = null;
                }
              }
              parsedOutline.push({ title: item.title, destPage });
            }
            setOutline(parsedOutline);
          } else {
            setOutline([]);
          }
        } catch {
          setOutline([]);
        }

        // Inspect metadata & AcroForms via pdf-lib
        try {
          const [meta, fields] = await Promise.all([
            inspectPdfMetadata(bytes),
            extractAcroFormFields(bytes),
          ]);
          setMetadataInfo(meta);
          setFormFields(fields);
          const initVals: Record<string, string | boolean> = {};
          for (const f of fields) initVals[f.name] = f.value;
          setFormValues(initVals);
        } catch {
          setFormFields([]);
        }
      } catch (err) {
        if (err && typeof err === 'object' && 'name' in err && err.name === 'PasswordException') {
          setPasswordNeeded(true);
          if (password) setPasswordError('Incorrect password. Please try again.');
        } else {
          showToast(err instanceof Error ? err.message : 'Unable to open PDF.');
        }
      }
    },
    [tab.id]
  );

  useEffect(() => {
    let active = true;
    const pdfResourceId = `pdf-${tab.id}`;
    (async () => {
      if (!tab.fileId) return;
      const [rec, overlay] = await Promise.all([
        getWorkspaceFile(tab.fileId),
        getPdfOverlayState(tab.fileId),
      ]);
      if (!active || !rec?.binaryContent) return;
      const normalizedLayers = ensureLayers(overlay.layers);
      setPdfBytes(rec.binaryContent);
      setAnnotations(overlay.annotations);
      setLayers(normalizedLayers);
      setActiveLayerId(normalizedLayers[normalizedLayers.length - 1].id);
      await loadFromBytes(rec.binaryContent);
    })();
    return () => {
      active = false;
      void resourceManager.destroyPdfDoc(pdfResourceId);
      setPdfDoc(null);
      setPdfBytes(null);
    };
  }, [tab.fileId, tab.id, loadFromBytes]);

  // Handled via folio:command listener below

  const commitAnnotations = useCallback(
    (next: PdfAnnotation[]) => {
      setUndoStack((u) => [...u.slice(-29), annotations]);
      setRedoStack([]);
      setAnnotations(next);
      if (tab.fileId) {
        savePdfAnnotations(tab.fileId, next).catch(() => {});
      }
      updateTab(tab.id, { isDirty: true });
    },
    [annotations, tab.fileId, tab.id, updateTab]
  );

  const commitLayers = useCallback(
    (nextLayers: PdfLayer[]) => {
      const normalized = ensureLayers(nextLayers);
      setLayers(normalized);
      if (tab.fileId) {
        savePdfLayers(tab.fileId, normalized).catch(() => {});
      }
    },
    [tab.fileId]
  );

  const handleAddLayer = () => {
    const newLayer = createLayer(layers);
    const next = [...layers, newLayer];
    commitLayers(next);
    setActiveLayerId(newLayer.id);
    showToast(`Added ${newLayer.name}`);
  };

  const handleRenameLayer = (layerId: string, name: string) => {
    commitLayers(layers.map((l) => (l.id === layerId ? { ...l, name } : l)));
  };

  const handleToggleLayerVisible = (layerId: string) => {
    commitLayers(layers.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l)));
  };

  const handleToggleLayerLocked = (layerId: string) => {
    commitLayers(layers.map((l) => (l.id === layerId ? { ...l, locked: !l.locked } : l)));
  };

  const handleMoveLayer = (layerId: string, direction: 'up' | 'down') => {
    commitLayers(moveLayer(layers, layerId, direction));
  };

  const handleDeleteLayer = (layerId: string) => {
    const res = deleteLayer(layers, annotations, layerId);
    commitLayers(res.layers);
    if (res.annotations.length !== annotations.length) {
      commitAnnotations(res.annotations);
    }
    if (activeLayerId === layerId) {
      setActiveLayerId(res.fallbackLayerId);
    }
  };

  const handleLockedLayerAttempt = useCallback((layerName: string) => {
    showToast(`Layer "${layerName}" is locked. Unlock it in Layers to edit.`);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, annotations]);
    setUndoStack((u) => u.slice(0, -1));
    setAnnotations(prev);
    if (tab.fileId) savePdfAnnotations(tab.fileId, prev).catch(() => {});
  }, [undoStack, annotations, tab.fileId]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, annotations]);
    setRedoStack((r) => r.slice(0, -1));
    setAnnotations(next);
    if (tab.fileId) savePdfAnnotations(tab.fileId, next).catch(() => {});
  }, [redoStack, annotations, tab.fileId]);

  const MAX_RENDERED_CANVASES = 6;

  const handlePageRendered = useCallback((pageNum: number) => {
    const nextOrder = renderedOrderRef.current.filter((p) => p !== pageNum);
    nextOrder.push(pageNum);
    const toEvict: number[] = [];
    while (nextOrder.length > MAX_RENDERED_CANVASES) {
      const candidateIdx = nextOrder.findIndex((p) => p !== pageNum && p !== currentPageRef.current);
      if (candidateIdx === -1) break;
      const [evicted] = nextOrder.splice(candidateIdx, 1);
      toEvict.push(evicted);
    }
    renderedOrderRef.current = nextOrder;
    if (toEvict.length > 0) {
      setEvictedPages((prev) => {
        const updated = { ...prev };
        for (const p of toEvict) updated[p] = true;
        return updated;
      });
    }
  }, []);

  const handlePageHidden = useCallback((pageNum: number) => {
    renderedOrderRef.current = renderedOrderRef.current.filter((p) => p !== pageNum);
    setEvictedPages((prev) => {
      if (!prev[pageNum]) return prev;
      const next = { ...prev };
      delete next[pageNum];
      return next;
    });
  }, []);

  const jumpToPage = useCallback((pageNum: number) => {
    const clamped = Math.max(1, Math.min(numPages || 1, pageNum));
    setCurrentPage(clamped);
    setEvictedPages((prev) => {
      if (!prev[clamped]) return prev;
      const next = { ...prev };
      delete next[clamped];
      return next;
    });
    const el = pageRefs.current.get(clamped);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [numPages]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfDoc || !searchQuery.trim()) {
      setSearchMatches([]);
      return;
    }
    setSearching(true);
    const q = searchQuery.trim().toLowerCase();
    const hits: Array<{ page: number; snippet: string }> = [];
    try {
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const page = await pdfDoc.getPage(p);
        const content = await page.getTextContent();
        page.cleanup();
        const text = content.items
          .map((it) => ('str' in it ? it.str : ''))
          .join(' ');
        const idx = text.toLowerCase().indexOf(q);
        if (idx >= 0) {
          const start = Math.max(0, idx - 32);
          const end = Math.min(text.length, idx + q.length + 52);
          hits.push({ page: p, snippet: text.slice(start, end).trim() });
        }
      }
      setSearchMatches(hits);
    } finally {
      setSearching(false);
    }
  };

  const handleSavePdf = useCallback(
    async (downloadCopy = false) => {
      if (!pdfBytes || !tab.fileId) return;
      try {
        const savedBytes = await saveAnnotationsAndFormsToPdf(
          pdfBytes,
          annotations,
          formValues,
          { exportMode, flattenForms: exportMode === 'solid', layers }
        );

        const rec = await getWorkspaceFile(tab.fileId);
        const filename = rec?.meta.name || tab.title || 'document.pdf';

        if (!downloadCopy) {
          const updatedMeta = {
            ...(rec?.meta || {
              id: tab.fileId,
              name: filename,
              kind: 'pdf' as const,
              folder: 'Documents',
            }),
            sizeBytes: savedBytes.byteLength,
            updatedAt: Date.now(),
          };
          await saveWorkspaceFile({
            id: tab.fileId,
            meta: updatedMeta,
            binaryContent: savedBytes,
          });
          // Visible layer items are now embedded in PDF (solid graphics or AcroForm fields); keep only hidden-layer items
          const remainingHidden = getHiddenLayerAnnotations(annotations, layers);
          await savePdfAnnotations(tab.fileId, remainingHidden);
          setAnnotations(remainingHidden);
          setPdfBytes(savedBytes);
          await loadFromBytes(savedBytes);
          upsertWorkspaceFile(updatedMeta);
          updateTab(tab.id, { isDirty: false });
          showToast(
            exportMode === 'solid'
              ? 'Saved solid (non-editable) PDF.'
              : 'Saved PDF with editable components & forms.'
          );
        } else {
          const copy = new Uint8Array(savedBytes.byteLength);
          copy.set(savedBytes);
          const blob = new Blob([copy.buffer], { type: 'application/pdf' });
          const suffix = exportMode === 'solid' ? '_solid.pdf' : '_editable.pdf';
          const outName = filename.replace(/\.pdf$/i, suffix);
          triggerBlobDownload(blob, outName);
          addDownload({
            filename: outName,
            url: `local://${outName}`,
            sizeBytes: blob.size,
            progress: 100,
            status: 'completed',
            mimeType: 'application/pdf',
          });
          showToast(`Exported ${outName} (${exportMode === 'solid' ? 'Solid' : 'Editable'})`);
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to save PDF.');
      }
    },
    [pdfBytes, tab.fileId, tab.id, tab.title, annotations, formValues, exportMode, layers, loadFromBytes, upsertWorkspaceFile, updateTab, addDownload]
  );

  useEffect(() => {
    const onCommand = (e: Event) => {
      const detail = (e as CustomEvent<{ type: string; tabId: string }>).detail;
      if (!detail || detail.tabId !== tab.id) return;
      if (detail.type === 'save') {
        void handleSavePdf(false);
      } else if (detail.type === 'save-as') {
        void handleSavePdf(true);
      } else if (detail.type === 'find') {
        setLeftPanel('search');
      }
    };
    window.addEventListener('folio:command', onCommand);
    return () => window.removeEventListener('folio:command', onCommand);
  }, [tab.id, handleSavePdf]);

  const handleApplyModifiedBytes = async (nextBytes: Uint8Array, msg: string) => {
    if (!tab.fileId) return;
    const rec = await getWorkspaceFile(tab.fileId);
    const filename = rec?.meta.name || tab.title;
    const updatedMeta = {
      ...(rec?.meta || {
        id: tab.fileId,
        name: filename,
        kind: 'pdf' as const,
        folder: 'Documents',
      }),
      sizeBytes: nextBytes.byteLength,
      updatedAt: Date.now(),
    };
    await saveWorkspaceFile({ id: tab.fileId, meta: updatedMeta, binaryContent: nextBytes });
    upsertWorkspaceFile(updatedMeta);
    setPdfBytes(nextBytes);
    setCurrentPage(1);
    await loadFromBytes(nextBytes);
    showToast(msg);
  };

  const handleInsertImageOverlay = () => {
    const targetLayer = getLayerById(layers, activeLayerId);
    if (targetLayer.locked) {
      handleLockedLayerAttempt(targetLayer.name);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const id = `img-${Date.now().toString(36)}`;
          commitAnnotations([
            ...annotations,
            {
              id,
              pageNumber: currentPage,
              layerId: targetLayer.id,
              type: 'image',
              x: 0.25,
              y: 0.25,
              width: 0.28,
              height: 0.18,
              color: '#000000',
              opacity: 1,
              strokeWidth: 1,
              imageDataUrl: reader.result,
              author: 'Workspace User',
              createdAt: Date.now(),
            },
          ]);
          setSelectedAnnotationId(id);
          setActiveTool('select');
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handlePrintPdf = () => {
    if (!pdfBytes) return;
    const copy = new Uint8Array(pdfBytes.byteLength);
    copy.set(pdfBytes);
    const blob = new Blob([copy.buffer], { type: 'application/pdf' });
    const url = resourceManager.createTrackedObjectUrl(blob, tab.id);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        resourceManager.revokeTrackedObjectUrl(url);
      }, 15000);
    };
  };

  const handleAddAnnotation = useCallback(
    (ann: PdfAnnotation) => {
      commitAnnotations([...annotations, ann]);
    },
    [annotations, commitAnnotations]
  );

  const handleUpdateAnnotation = useCallback(
    (id: string, patch: Partial<PdfAnnotation>, options?: { recordUndo?: boolean }) => {
      if (options?.recordUndo) {
        const next = annotations.map((a) => (a.id === id ? { ...a, ...patch } : a));
        commitAnnotations(next);
        return;
      }
      setAnnotations((prev) => {
        const next = prev.map((a) => (a.id === id ? { ...a, ...patch } : a));
        if (tab.fileId) savePdfAnnotations(tab.fileId, next).catch(() => {});
        return next;
      });
    },
    [annotations, commitAnnotations, tab.fileId]
  );

  const handleDeleteAnnotation = useCallback(
    (id: string) => {
      const target = annotations.find((a) => a.id === id);
      if (target) {
        const lid = resolveAnnotationLayerId(target, layers);
        const layerObj = getLayerById(layers, lid);
        if (layerObj.locked) {
          handleLockedLayerAttempt(layerObj.name);
          return;
        }
      }
      commitAnnotations(annotations.filter((a) => a.id !== id));
      if (selectedAnnotationId === id) setSelectedAnnotationId(null);
    },
    [annotations, layers, selectedAnnotationId, commitAnnotations, handleLockedLayerAttempt]
  );

  const handleCopyAnnotation = useCallback((ann: PdfAnnotation) => {
    setCopiedAnnotation(ann);
    showToast('Copied item (Ctrl+V to paste)');
  }, []);

  const handleCutAnnotation = useCallback(
    (ann: PdfAnnotation) => {
      const lid = resolveAnnotationLayerId(ann, layers);
      const layerObj = getLayerById(layers, lid);
      if (layerObj.locked) {
        handleLockedLayerAttempt(layerObj.name);
        return;
      }
      setCopiedAnnotation(ann);
      commitAnnotations(annotations.filter((a) => a.id !== ann.id));
      if (selectedAnnotationId === ann.id) setSelectedAnnotationId(null);
      showToast('Cut item');
    },
    [annotations, layers, selectedAnnotationId, commitAnnotations, handleLockedLayerAttempt]
  );

  const handlePasteAnnotation = useCallback(
    (pageNumber = currentPage, placeAtNorm?: { x: number; y: number }) => {
      if (!copiedAnnotation) return;
      const targetLayer = getLayerById(layers, activeLayerId);
      if (targetLayer.locked) {
        handleLockedLayerAttempt(targetLayer.name);
        return;
      }
      const pasted = cloneAnnotationForPaste(copiedAnnotation, {
        pageNumber,
        targetLayerId: targetLayer.id,
        placeAtNorm,
      });
      commitAnnotations([...annotations, pasted]);
      setSelectedAnnotationId(pasted.id);
      setActiveTool('select');
      showToast(`Pasted ${pasted.type} on page ${pageNumber}`);
    },
    [copiedAnnotation, currentPage, layers, activeLayerId, annotations, commitAnnotations, handleLockedLayerAttempt]
  );

  const handleDuplicateAnnotation = useCallback(
    (ann: PdfAnnotation) => {
      const lid = resolveAnnotationLayerId(ann, layers);
      const layerObj = getLayerById(layers, lid);
      if (layerObj.locked) {
        handleLockedLayerAttempt(layerObj.name);
        return;
      }
      const duplicated = cloneAnnotationForPaste(ann, {
        pageNumber: ann.pageNumber,
        targetLayerId: layerObj.id,
      });
      commitAnnotations([...annotations, duplicated]);
      setSelectedAnnotationId(duplicated.id);
      showToast('Duplicated item');
    },
    [layers, annotations, commitAnnotations, handleLockedLayerAttempt]
  );

  const handleStackReorder = useCallback(
    (id: string, action: 'front' | 'back') => {
      const target = annotations.find((a) => a.id === id);
      if (!target) return;
      const lid = resolveAnnotationLayerId(target, layers);
      const layerObj = getLayerById(layers, lid);
      if (layerObj.locked) {
        handleLockedLayerAttempt(layerObj.name);
        return;
      }
      commitAnnotations(reorderAnnotationStack(annotations, id, action));
    },
    [annotations, layers, commitAnnotations, handleLockedLayerAttempt]
  );

  const selectedAnnotation = selectedAnnotationId
    ? annotations.find((a) => a.id === selectedAnnotationId) || null
    : null;

  const handleSelectAnnotation = useCallback(
    (id: string | null) => {
      setSelectedAnnotationId(id);
      if (editingStampId && id !== editingStampId) {
        setEditingStampId(null);
      }
    },
    [editingStampId]
  );

  const handleColorPick = useCallback(
    (hex: string) => {
      setActiveColor(hex);
      if (selectedAnnotation) {
        const lid = resolveAnnotationLayerId(selectedAnnotation, layers);
        const layerObj = getLayerById(layers, lid);
        if (layerObj.locked) {
          handleLockedLayerAttempt(layerObj.name);
          return;
        }
        handleUpdateAnnotation(selectedAnnotation.id, { color: hex }, { recordUndo: true });
      }
    },
    [selectedAnnotation, layers, handleLockedLayerAttempt, handleUpdateAnnotation]
  );

  const handleSaveStampFromConfig = useCallback(() => {
    const label = normalizeStampLabel(activeStampLabel);
    const color = activeColor === '#facc15' ? '#2563eb' : activeColor;
    addSavedStamp({
      label,
      subtext: activeStampSubtext.trim(),
      color,
      style: activeStampStyle,
    });
    showToast(`Saved "${label}" stamp template`);
  }, [activeStampLabel, activeStampSubtext, activeColor, activeStampStyle, addSavedStamp]);

  const handleSaveStampTemplateFromAnnotation = useCallback(
    (ann: PdfAnnotation) => {
      const tpl = annotationToStampTemplate(ann);
      addSavedStamp(tpl);
      showToast(`Saved "${tpl.label}" stamp template`);
    },
    [addSavedStamp]
  );

  const handleSelectStampTemplate = useCallback(
    (tpl: SavedStampTemplate) => {
      setActiveStampLabel(tpl.label);
      setActiveStampSubtext(tpl.subtext || '');
      setActiveStampStyle(tpl.style || 'outline');
      setActiveColor(tpl.color);
      if (selectedAnnotation?.type === 'stamp') {
        const lid = resolveAnnotationLayerId(selectedAnnotation, layers);
        const layerObj = getLayerById(layers, lid);
        if (layerObj.locked) {
          handleLockedLayerAttempt(layerObj.name);
          return;
        }
        const resolvedSubtext = resolveStampTemplateSubtext(tpl.subtext);
        handleUpdateAnnotation(
          selectedAnnotation.id,
          {
            stampLabel: tpl.label,
            stampSubtext: resolvedSubtext || undefined,
            stampStyle: tpl.style,
            color: tpl.color,
          },
          { recordUndo: true }
        );
        setStampPickerOpen(false);
        showToast(`Applied "${tpl.label}" template`);
        return;
      }
      setActiveTool('stamp');
      setStampPickerOpen(false);
      showToast(`Stamp ready: "${tpl.label}" (click PDF to place)`);
    },
    [selectedAnnotation, layers, handleLockedLayerAttempt, handleUpdateAnnotation]
  );

  const handlePlaceActiveStampOnCurrentPage = useCallback(() => {
    const targetLayer = getLayerById(layers, activeLayerId);
    if (targetLayer.locked) {
      handleLockedLayerAttempt(targetLayer.name);
      return;
    }
    const created = buildStampAnnotation({
      pageNumber: currentPage,
      layerId: targetLayer.id,
      x: 0.5,
      y: 0.3,
      label: activeStampLabel || 'REVIEWED',
      subtext: activeStampSubtext,
      color: activeColor,
      style: activeStampStyle,
    });
    commitAnnotations([...annotations, created]);
    setSelectedAnnotationId(created.id);
    setActiveTool('select');
    setStampPickerOpen(false);
  }, [
    layers,
    activeLayerId,
    currentPage,
    activeStampLabel,
    activeStampSubtext,
    activeColor,
    activeStampStyle,
    annotations,
    commitAnnotations,
    handleLockedLayerAttempt,
  ]);

  const handleApplyConfigToSelectedStamp = useCallback(() => {
    if (!selectedAnnotation || selectedAnnotation.type !== 'stamp') return;
    const lid = resolveAnnotationLayerId(selectedAnnotation, layers);
    const layerObj = getLayerById(layers, lid);
    if (layerObj.locked) {
      handleLockedLayerAttempt(layerObj.name);
      return;
    }
    const resolvedSubtext = resolveStampTemplateSubtext(activeStampSubtext);
    handleUpdateAnnotation(
      selectedAnnotation.id,
      {
        stampLabel: normalizeStampLabel(activeStampLabel),
        stampSubtext: resolvedSubtext || undefined,
        stampStyle: activeStampStyle,
        color: activeColor === '#facc15' ? '#2563eb' : activeColor,
      },
      { recordUndo: true }
    );
    setStampPickerOpen(false);
    showToast('Updated selected stamp');
  }, [
    selectedAnnotation,
    layers,
    activeStampLabel,
    activeStampSubtext,
    activeStampStyle,
    activeColor,
    handleLockedLayerAttempt,
    handleUpdateAnnotation,
  ]);

  const handleQuickInsert = useCallback(
    (
      tool: 'textbox' | 'checkbox' | 'text' | 'note' | 'stamp',
      pageNumber: number,
      normX: number,
      normY: number
    ) => {
      const targetLayer = getLayerById(layers, activeLayerId);
      if (targetLayer.locked) {
        handleLockedLayerAttempt(targetLayer.name);
        return;
      }
      const created = createQuickAnnotationAt(tool, {
        pageNumber,
        layerId: targetLayer.id,
        x: normX,
        y: normY,
        color: activeColor,
        strokeWidth: activeStrokeWidth,
        stampLabel: activeStampLabel,
        stampSubtext: activeStampSubtext,
        stampStyle: activeStampStyle,
      });
      commitAnnotations([...annotations, created]);
      setSelectedAnnotationId(created.id);
      setActiveTool('select');
    },
    [
      layers,
      activeLayerId,
      activeColor,
      activeStrokeWidth,
      activeStampLabel,
      activeStampSubtext,
      activeStampStyle,
      annotations,
      commitAnnotations,
      handleLockedLayerAttempt,
    ]
  );

  const handleCopySelectedText = useCallback((text: string) => {
    if (!text) return;
    navigator.clipboard?.writeText(text).catch(() => {});
    showToast('Copied selected text');
  }, []);

  const handleContextMenuRequest = useCallback(
    (info: {
      clientX: number;
      clientY: number;
      pageNumber: number;
      normX: number;
      normY: number;
      annotationId: string | null;
      selectedText: string;
    }) => {
      const menuWidth = 248;
      const estHeight = info.annotationId ? 350 : 420;
      const clampedX = Math.max(8, Math.min(info.clientX, window.innerWidth - menuWidth));
      const clampedY = Math.max(8, Math.min(info.clientY, window.innerHeight - estHeight));
      setContextMenu({
        x: clampedX,
        y: clampedY,
        pageNumber: info.pageNumber,
        normX: info.normX,
        normY: info.normY,
        annotationId: info.annotationId,
        selectedText: info.selectedText,
      });
    },
    []
  );

  const handleFormValueChange = useCallback(
    (name: string, val: string | boolean) => {
      setFormValues((prev) => ({ ...prev, [name]: val }));
      updateTab(tab.id, { isDirty: true });
    },
    [tab.id, updateTab]
  );

  const handleRegisterPageRef = useCallback((p: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(p, el);
    else pageRefs.current.delete(p);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && rootRef.current) {
      rootRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const fitWidth = useCallback(() => {
    const containerW = scrollContainerRef.current?.clientWidth || 900;
    const target = Math.max(0.5, Math.min(2.4, (containerW - 80) / pageSizePt.width));
    setZoom(+target.toFixed(2));
  }, [pageSizePt.width]);

  const fitPage = () => {
    const containerH = scrollContainerRef.current?.clientHeight || 720;
    const target = Math.max(0.5, Math.min(2.4, (containerH - 56) / pageSizePt.height));
    setZoom(+target.toFixed(2));
  };

  // Comprehensive PDF Editor Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (passwordNeeded || exportImagesOpen || signatureModalOpen || organizerModalOpen || watermarkModalOpen) {
        return;
      }

      if (e.key === 'Escape') {
        if (shortcutsOpen) {
          e.preventDefault();
          setShortcutsOpen(false);
          return;
        }
        if (contextMenu) {
          e.preventDefault();
          setContextMenu(null);
          return;
        }
      }

      if (isEditableKeyboardTarget(e.target)) {
        if (e.key === 'Escape' && e.target instanceof HTMLElement) {
          e.target.blur();
        }
        return;
      }

      const selectedAnn = selectedAnnotationId
        ? annotations.find((a) => a.id === selectedAnnotationId) || null
        : null;
      const domSelText = window.getSelection()?.toString().trim() || '';

      const cmd = resolvePdfShortcut(
        {
          key: e.key,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
        },
        {
          hasSelection: Boolean(selectedAnn),
          hasClipboard: Boolean(copiedAnnotation),
          hasDomTextSelection: domSelText.length > 0,
          isSelectedCheckbox: selectedAnn?.type === 'checkbox',
        }
      );
      if (!cmd) return;

      e.preventDefault();

      switch (cmd.type) {
        case 'escape':
          if (selectedAnnotationId) setSelectedAnnotationId(null);
          else if (activeTool !== 'select') setActiveTool('select');
          break;
        case 'undo':
          handleUndo();
          break;
        case 'redo':
          handleRedo();
          break;
        case 'copy':
          if (selectedAnn) handleCopyAnnotation(selectedAnn);
          break;
        case 'cut':
          if (selectedAnn) handleCutAnnotation(selectedAnn);
          break;
        case 'paste':
          handlePasteAnnotation(currentPage);
          break;
        case 'duplicate':
          if (selectedAnn) handleDuplicateAnnotation(selectedAnn);
          break;
        case 'delete':
          if (selectedAnn) handleDeleteAnnotation(selectedAnn.id);
          break;
        case 'nudge':
          if (selectedAnn) {
            const lid = resolveAnnotationLayerId(selectedAnn, layers);
            const layerObj = getLayerById(layers, lid);
            if (layerObj.locked) {
              handleLockedLayerAttempt(layerObj.name);
              break;
            }
            const patch = nudgeAnnotationPosition(selectedAnn, cmd.dx, cmd.dy);
            handleUpdateAnnotation(selectedAnn.id, patch, { recordUndo: true });
          }
          break;
        case 'toggle-checkbox':
          if (selectedAnn && selectedAnn.type === 'checkbox') {
            const lid = resolveAnnotationLayerId(selectedAnn, layers);
            const layerObj = getLayerById(layers, lid);
            if (layerObj.locked) {
              handleLockedLayerAttempt(layerObj.name);
              break;
            }
            handleUpdateAnnotation(selectedAnn.id, { checked: !selectedAnn.checked }, { recordUndo: true });
          }
          break;
        case 'bring-front':
          if (selectedAnn) handleStackReorder(selectedAnn.id, 'front');
          break;
        case 'send-back':
          if (selectedAnn) handleStackReorder(selectedAnn.id, 'back');
          break;
        case 'prev-page':
          jumpToPage(currentPage - 1);
          break;
        case 'next-page':
          jumpToPage(currentPage + 1);
          break;
        case 'first-page':
          jumpToPage(1);
          break;
        case 'last-page':
          jumpToPage(numPages || 1);
          break;
        case 'zoom-in':
          setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)));
          break;
        case 'zoom-out':
          setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)));
          break;
        case 'zoom-reset':
          setZoom(1);
          break;
        case 'rotate':
          setRotationDelta((r) => (r + 90) % 360);
          break;
        case 'tool':
          setActiveTool(cmd.tool);
          break;
        case 'toggle-shortcuts':
          setShortcutsOpen((v) => !v);
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    passwordNeeded,
    exportImagesOpen,
    signatureModalOpen,
    organizerModalOpen,
    watermarkModalOpen,
    shortcutsOpen,
    contextMenu,
    selectedAnnotationId,
    annotations,
    copiedAnnotation,
    activeTool,
    currentPage,
    numPages,
    layers,
    handleUndo,
    handleRedo,
    handleCopyAnnotation,
    handleCutAnnotation,
    handlePasteAnnotation,
    handleDuplicateAnnotation,
    handleDeleteAnnotation,
    handleUpdateAnnotation,
    handleStackReorder,
    handleLockedLayerAttempt,
    jumpToPage,
  ]);

  if (passwordNeeded) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--surface-pdf-desk)] p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pdfBytes) loadFromBytes(pdfBytes, passwordInput);
          }}
          className="w-full max-w-sm p-6 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-chrome)] space-y-3"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Lock className="w-4 h-4 text-amber-400" />
            <span>Password-Protected PDF</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Enter the document password to unlock &ldquo;{tab.title}&rdquo;.
          </p>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Document password"
            className="w-full h-9 px-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-xs text-[var(--text-primary)]"
          />
          {passwordError && <p className="text-xs text-rose-400">{passwordError}</p>}
          <button
            type="submit"
            className="w-full h-8 rounded-md bg-[var(--accent-color)] text-white text-xs font-medium"
          >
            Unlock PDF
          </button>
        </form>
      </div>
    );
  }

  const visiblePages =
    layoutMode === 'single'
      ? [currentPage]
      : Array.from({ length: numPages }, (_, i) => i + 1);

  return (
    <div ref={rootRef} className="flex-1 min-w-0 flex flex-col min-h-0 bg-[var(--surface-pdf-desk)] select-none">
      {/* Row 1: Primary PDF Viewer & Document Actions Toolbar (Foxit / Preview clean bar) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-[var(--border-hairline)] bg-[var(--surface-chrome)] text-xs">
        {/* Left: Panels & Page Navigation */}
        <div className="flex items-center gap-1">
          {[
            { id: 'thumbnails' as const, label: 'Thumbnails', icon: LayoutGrid },
            { id: 'outline' as const, label: 'Outline', icon: ListTree },
            { id: 'layers' as const, label: 'Layers', icon: Layers },
            { id: 'search' as const, label: 'Search', icon: Search },
            { id: 'info' as const, label: 'Info', icon: Info },
          ].map((item) => {
            const Icon = item.icon;
            const active = leftPanel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectLeftPanel(item.id)}
                aria-label={item.label}
                title={item.label}
                className={`p-1.5 rounded transition-colors ${
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-color)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}

          <div className="h-4 w-px bg-[var(--border-hairline)] mx-1" />

          {/* Zoom Controls */}
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}
            aria-label="Zoom out PDF"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <select
            aria-label="PDF zoom percentage"
            value={Math.round(zoom * 100)}
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
            className="h-7 px-1.5 rounded bg-[var(--surface-subtle)] border border-[var(--border-hairline)] text-[11px] tabular-nums text-[var(--text-primary)]"
          >
            {[50, 75, 100, 115, 130, 150, 175, 200].map((pct) => (
              <option key={pct} value={pct}>
                {pct}%
              </option>
            ))}
            {![50, 75, 100, 115, 130, 150, 175, 200].includes(Math.round(zoom * 100)) && (
              <option value={Math.round(zoom * 100)}>{Math.round(zoom * 100)}%</option>
            )}
          </select>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
            aria-label="Zoom in PDF"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={fitWidth}
            title="Fit width"
            className="px-2 py-1 rounded text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] whitespace-nowrap"
          >
            Fit W
          </button>
          <button
            type="button"
            onClick={fitPage}
            title="Fit page"
            className="px-2 py-1 rounded text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] whitespace-nowrap"
          >
            Fit P
          </button>

          <div className="h-4 w-px bg-[var(--border-hairline)] mx-1" />

          {/* Page Stepper */}
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => jumpToPage(currentPage - 1)}
            aria-label="Previous page"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] disabled:opacity-30"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] tabular-nums text-[var(--text-primary)] px-1 whitespace-nowrap">
            {currentPage} / {numPages || 1}
          </span>
          <button
            type="button"
            disabled={currentPage >= numPages}
            onClick={() => jumpToPage(currentPage + 1)}
            aria-label="Next page"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] disabled:opacity-30"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() =>
              setLayoutMode((m) =>
                m === 'continuous' ? 'single' : m === 'single' ? 'two-page' : 'continuous'
              )
            }
            title={`Layout: ${layoutMode}`}
            aria-label="Cycle page layout mode"
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] whitespace-nowrap"
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span className="capitalize hidden xl:inline">{layoutMode}</span>
          </button>

          <button
            type="button"
            onClick={() => setRotationDelta((r) => (r + 90) % 360)}
            aria-label="Rotate view 90 degrees"
            title="Rotate view"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Document Workflows & Export */}
        <div className="flex items-center gap-1.5">
          {notice && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium mr-1">
              <Check className="w-3 h-3" />
              {notice}
            </span>
          )}

          <button
            type="button"
            onClick={() => setOrganizerModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--border-hairline)] text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Organize</span>
          </button>

          <button
            type="button"
            onClick={() => setWatermarkModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--border-hairline)] text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Properties</span>
          </button>

          <button
            type="button"
            onClick={() => setExportImagesOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--border-hairline)] text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] whitespace-nowrap"
          >
            <FileImage className="w-3.5 h-3.5 text-amber-400" />
            <span>Export Images</span>
          </button>

          <button
            type="button"
            onClick={() => handleSavePdf(false)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--accent-color)] text-[11px] font-medium text-white hover:opacity-90 whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>

          <button
            type="button"
            onClick={() => handleSavePdf(true)}
            title="Download annotated PDF copy"
            aria-label="Download annotated PDF"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handlePrintPdf}
            title="Print PDF"
            aria-label="Print PDF"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
          >
            <Printer className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            title="Fullscreen / Presentation"
            aria-label="Toggle fullscreen"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setRightCommentsOpen((v) => !v)}
            aria-label="Toggle comments panel"
            title="Comments & Annotations"
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium ${
              rightCommentsOpen
                ? 'bg-[var(--accent-soft)] text-[var(--accent-color)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="tabular-nums">{annotations.length}</span>
          </button>
        </div>
      </div>

      {/* Row 2: Contextual Annotation & Editing Tools Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1 border-b border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs">
        <div className="flex flex-wrap items-center gap-0.5">
          {[
            { id: 'select' as const, label: 'Select / Text', icon: MousePointer },
            { id: 'highlight' as const, label: 'Highlight', icon: Highlighter },
            { id: 'underline' as const, label: 'Underline', icon: Underline },
            { id: 'strikethrough' as const, label: 'Strikethrough', icon: Strikethrough },
            { id: 'freehand' as const, label: 'Draw', icon: PenLine },
            { id: 'text' as const, label: 'Add Text', icon: Type },
            { id: 'note' as const, label: 'Sticky Note', icon: StickyNote },
            { id: 'rect' as const, label: 'Rectangle', icon: Square },
            { id: 'circle' as const, label: 'Circle', icon: Circle },
            { id: 'stamp' as const, label: 'Stamp', icon: Stamp },
            { id: 'eraser' as const, label: 'Eraser', icon: Eraser },
          ].map((t) => {
            const Icon = t.icon;
            const active = activeTool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTool(t.id)}
                title={t.label}
                aria-label={t.label}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-color)] font-medium'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden 2xl:inline">{t.label}</span>
              </button>
            );
          })}

          <div className="h-4 w-px bg-[var(--border-hairline)] mx-1.5" />

          {/* Interactive Components Group */}
          {[
            { id: 'textbox' as const, label: 'Text Box', icon: TextCursorInput },
            { id: 'checkbox' as const, label: 'Checkbox', icon: CheckSquare },
          ].map((comp) => {
            const Icon = comp.icon;
            const active = activeTool === comp.id;
            return (
              <button
                key={comp.id}
                type="button"
                onClick={() => setActiveTool(comp.id)}
                title={`Add ${comp.label} Component`}
                aria-label={`Add ${comp.label}`}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-color)] font-medium'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{comp.label}</span>
              </button>
            );
          })}

          <div className="h-4 w-px bg-[var(--border-hairline)] mx-1.5" />

          <button
            type="button"
            onClick={handleInsertImageOverlay}
            title="Insert Image"
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] whitespace-nowrap"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Image</span>
          </button>

          <button
            type="button"
            onClick={() => setSignatureModalOpen(true)}
            title="Signatures & Security"
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] whitespace-nowrap"
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>Sign</span>
          </button>
        </div>

        {/* Right: Stamp Designer, Color Swatches, Stroke Width, Export Editability Mode, Undo/Redo */}
        <div className="flex flex-wrap items-center gap-2">
          <PdfStampPicker
            open={stampPickerOpen}
            onToggleOpen={() => setStampPickerOpen((v) => !v)}
            onClose={() => setStampPickerOpen(false)}
            activeLabel={activeStampLabel}
            activeSubtext={activeStampSubtext}
            activeColor={activeColor}
            activeStyle={activeStampStyle}
            savedStamps={savedStamps}
            hasSelectedStamp={selectedAnnotation?.type === 'stamp'}
            onChangeLabel={setActiveStampLabel}
            onChangeSubtext={setActiveStampSubtext}
            onChangeColor={handleColorPick}
            onChangeStyle={(style) => {
              setActiveStampStyle(style);
              if (selectedAnnotation?.type === 'stamp') {
                handleUpdateAnnotation(selectedAnnotation.id, { stampStyle: style }, { recordUndo: true });
              }
            }}
            onSaveTemplate={handleSaveStampFromConfig}
            onRemoveTemplate={(id) => {
              removeSavedStamp(id);
              showToast('Removed stamp template');
            }}
            onResetTemplates={() => {
              resetSavedStamps();
              showToast('Restored default stamp templates');
            }}
            onSelectTemplate={handleSelectStampTemplate}
            onPlaceOnCurrentPage={handlePlaceActiveStampOnCurrentPage}
            onApplyToSelectedStamp={handleApplyConfigToSelectedStamp}
          />

          <div className="flex items-center gap-1">
            {TOOL_COLORS.map((c) => {
              const currentRefColor = selectedAnnotation ? selectedAnnotation.color : activeColor;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleColorPick(c)}
                  aria-label={`Annotation color ${c}`}
                  className={`w-3.5 h-3.5 rounded-full border ${
                    currentRefColor.toLowerCase() === c.toLowerCase()
                      ? 'ring-2 ring-[var(--accent-color)] ring-offset-1 ring-offset-[var(--surface-canvas)]'
                      : 'border-white/25'
                  }`}
                  style={{ backgroundColor: c }}
                />
              );
            })}
            <label
              title="Custom color for active tool or selected item"
              className="relative w-5 h-4 rounded border border-[var(--border-strong)] cursor-pointer flex items-center justify-center ml-0.5 bg-[var(--surface-chrome)] hover:bg-[var(--surface-subtle)]"
            >
              <Palette className="w-3 h-3 text-[var(--text-secondary)] pointer-events-none" />
              <input
                type="color"
                aria-label="Custom annotation color"
                value={
                  (selectedAnnotation?.color || activeColor).startsWith('#')
                    ? selectedAnnotation?.color || activeColor
                    : '#2563eb'
                }
                onChange={(e) => handleColorPick(e.target.value)}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              />
            </label>
          </div>

          <select
            aria-label="Stroke thickness"
            value={activeStrokeWidth}
            onChange={(e) => setActiveStrokeWidth(Number(e.target.value))}
            className="h-6 px-1 rounded bg-[var(--surface-subtle)] border border-[var(--border-hairline)] text-[11px] tabular-nums"
          >
            <option value={1}>1px</option>
            <option value={2}>2px</option>
            <option value={4}>4px</option>
            <option value={6}>6px</option>
          </select>

          <select
            aria-label="PDF export editability mode"
            title="Choose whether saved/downloaded components & forms remain editable or are baked solid (not editable)"
            value={exportMode}
            onChange={(e) => setExportMode(e.target.value as PdfExportMode)}
            className="h-6 px-2 rounded bg-[var(--surface-subtle)] border border-[var(--border-hairline)] text-[11px] font-medium text-[var(--text-primary)]"
          >
            <option value="editable">Export: Editable</option>
            <option value="solid">Export: Solid (Not Editable)</option>
          </select>

          <div className="h-4 w-px bg-[var(--border-hairline)]" />

          <button
            type="button"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            aria-label="Undo annotation"
            title="Undo"
            className="p-1 rounded text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] disabled:opacity-30"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={redoStack.length === 0}
            onClick={handleRedo}
            aria-label="Redo annotation"
            title="Redo"
            className="p-1 rounded text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] disabled:opacity-30"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main 3-Pane PDF Workspace */}
      <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
        {/* Left Sidebar (Thumbnails / Outline / Search / Info) — Resizable & Collapsible */}
        {leftPanel !== 'none' ? (
          <>
            <div
              style={{ width: leftPanelWidth }}
              className="shrink-0 border-r border-[var(--border-hairline)] bg-[var(--surface-chrome)] flex flex-col overflow-hidden text-xs"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-hairline)] shrink-0">
                <span className="font-semibold text-[var(--text-primary)] capitalize truncate">
                  {leftPanel === 'info' ? 'Document Info' : leftPanel}
                </span>
                <button
                  type="button"
                  onClick={() => setLeftPanel('none')}
                  aria-label="Collapse left panel"
                  title="Collapse left panel"
                  className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {leftPanel === 'thumbnails' && pdfDoc && (
                  <div className="space-y-3">
                    {Array.from({ length: numPages }, (_, idx) => idx + 1).map((p) => (
                      <LazyPdfThumbnail
                        key={p}
                        pdfDoc={pdfDoc}
                        docKey={tab.fileId || tab.id}
                        pageNumber={p}
                        rotationDelta={rotationDelta}
                        isActive={p === currentPage}
                        onSelectPage={jumpToPage}
                      />
                    ))}
                  </div>
                )}

                {leftPanel === 'outline' && (
                  <div className="space-y-1">
                    {outline.length === 0 ? (
                      <p className="text-[var(--text-muted)]">No embedded outline bookmarks in this PDF.</p>
                    ) : (
                      outline.map((item, i) => (
                        <button
                          key={`${item.title}-${i}`}
                          type="button"
                          onClick={() => item.destPage && jumpToPage(item.destPage)}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-[var(--surface-subtle)] text-[var(--text-primary)] truncate"
                        >
                          {item.title}
                        </button>
                      ))
                    )}
                  </div>
                )}

                {leftPanel === 'layers' && (
                  <PdfLayersPanel
                    layers={layers}
                    activeLayerId={activeLayerId}
                    annotations={annotations}
                    onSelectLayer={setActiveLayerId}
                    onAddLayer={handleAddLayer}
                    onRenameLayer={handleRenameLayer}
                    onToggleVisible={handleToggleLayerVisible}
                    onToggleLocked={handleToggleLayerLocked}
                    onMoveLayer={handleMoveLayer}
                    onDeleteLayer={handleDeleteLayer}
                  />
                )}

                {leftPanel === 'search' && (
                  <div className="space-y-3">
                    <form onSubmit={handleSearch} className="space-y-1.5">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Find text in PDF..."
                        aria-label="Search PDF text"
                        className="w-full h-8 px-2.5 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)] focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="w-full h-7 rounded bg-[var(--accent-color)] text-white font-medium"
                      >
                        {searching ? 'Searching…' : 'Search'}
                      </button>
                    </form>

                    <div className="space-y-1.5">
                      {searchMatches.map((m, idx) => (
                        <button
                          key={`${m.page}-${idx}`}
                          type="button"
                          onClick={() => jumpToPage(m.page)}
                          className="w-full text-left p-2 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] hover:border-[var(--border-strong)]"
                        >
                          <div className="text-[11px] font-semibold text-[var(--accent-color)] tabular-nums">
                            Page {m.page}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)] line-clamp-2 mt-0.5">
                            {m.snippet}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {leftPanel === 'info' && metadataInfo && (
                  <div className="space-y-2.5 text-[11px]">
                    <div>
                      <span className="text-[var(--text-muted)] block">Title</span>
                      <span className="text-[var(--text-primary)]">{metadataInfo.title || tab.title}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block">Author</span>
                      <span className="text-[var(--text-primary)]">{metadataInfo.author || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block">Pages &amp; Size</span>
                      <span className="text-[var(--text-primary)] tabular-nums">
                        {metadataInfo.pageCount} pages · {pdfBytes ? formatBytes(pdfBytes.byteLength) : ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block">AcroForm Fields</span>
                      <span className="text-[var(--text-primary)] tabular-nums">{formFields.length}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block">Digital Signatures</span>
                      <span className="text-[var(--text-primary)] tabular-nums">
                        {metadataInfo.signatureCount}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-label="Resize left panel"
              aria-valuenow={leftPanelWidth}
              aria-valuemin={150}
              aria-valuemax={420}
              onPointerDown={(e) => startResize('left', e)}
              onDoubleClick={() => setLeftPanelWidth(208)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  setLeftPanelWidth((w) => Math.min(420, w + 16));
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  setLeftPanelWidth((w) => Math.max(150, w - 16));
                }
              }}
              title="Drag to resize · Double-click to reset"
              className={`w-1.5 shrink-0 cursor-col-resize transition-colors flex items-center justify-center group focus:outline-none ${
                resizingSide === 'left'
                  ? 'bg-[var(--accent-color)]/45'
                  : 'hover:bg-[var(--accent-color)]/30 bg-transparent'
              }`}
            >
              <span className="w-px h-8 rounded-full bg-[var(--border-strong)] opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </>
        ) : (
          <div className="w-7 shrink-0 border-r border-[var(--border-hairline)] bg-[var(--surface-chrome)] flex flex-col items-center pt-2">
            <button
              type="button"
              onClick={() => setLeftPanel(lastLeftPanel)}
              aria-label="Expand left panel"
              title="Expand left panel"
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
            >
              <PanelLeftOpen className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Center PDF Desk Canvas */}
        <div
          ref={scrollContainerRef}
          onScroll={() => {
            if (contextMenu) setContextMenu(null);
            if (layoutMode === 'single') return;
            if (scrollSyncTimerRef.current) clearTimeout(scrollSyncTimerRef.current);
            scrollSyncTimerRef.current = setTimeout(() => {
              const container = scrollContainerRef.current;
              if (!container) return;
              const containerRect = container.getBoundingClientRect();
              const centerY = containerRect.top + containerRect.height * 0.45;
              let bestPage = currentPageRef.current;
              let bestDist = Infinity;
              for (const [p, el] of pageRefs.current.entries()) {
                const r = el.getBoundingClientRect();
                const mid = r.top + r.height * 0.5;
                const dist = Math.abs(mid - centerY);
                if (dist < bestDist) {
                  bestDist = dist;
                  bestPage = p;
                }
              }
              if (bestPage !== currentPageRef.current) {
                setCurrentPage(bestPage);
              }
            }, 100);
          }}
          className="flex-1 min-w-0 overflow-auto p-6 flex flex-col items-center gap-5 bg-[var(--surface-pdf-desk)]"
        >
          {pdfDoc ? (
            <div
              className={
                layoutMode === 'two-page'
                  ? 'grid grid-cols-1 xl:grid-cols-2 gap-5 items-start justify-items-center'
                  : 'flex flex-col items-center gap-5'
              }
            >
              {visiblePages.map((pageNum) => (
                <PdfPageCanvas
                  key={pageNum}
                  scopeId={tab.id}
                  pdfDoc={pdfDoc}
                  pageNumber={pageNum}
                  scale={zoom}
                  rotationDelta={rotationDelta}
                  forceEvict={Boolean(evictedPages[pageNum])}
                  activeTool={activeTool}
                  activeColor={activeColor}
                  activeStrokeWidth={activeStrokeWidth}
                  activeOpacity={0.85}
                  activeStampLabel={activeStampLabel}
                  activeStampSubtext={activeStampSubtext}
                  activeStampStyle={activeStampStyle}
                  editingStampId={editingStampId}
                  onSetEditingStampId={setEditingStampId}
                  onSaveStampTemplate={handleSaveStampTemplateFromAnnotation}
                  layers={layers}
                  activeLayerId={activeLayerId}
                  annotations={annotations}
                  selectedAnnotationId={selectedAnnotationId}
                  onSelectAnnotation={handleSelectAnnotation}
                  onAddAnnotation={handleAddAnnotation}
                  onUpdateAnnotation={handleUpdateAnnotation}
                  onDeleteAnnotation={handleDeleteAnnotation}
                  onLockedLayerAttempt={handleLockedLayerAttempt}
                  onContextMenuRequest={handleContextMenuRequest}
                  formFields={formFields}
                  formValues={formValues}
                  onFormValueChange={handleFormValueChange}
                  searchHighlightQuery={searchQuery}
                  onRegisterPageRef={handleRegisterPageRef}
                  onPageRendered={handlePageRendered}
                  onPageHidden={handlePageHidden}
                />
              ))}
            </div>
          ) : (
            <div className="my-auto text-xs text-[var(--text-muted)]">Rendering PDF…</div>
          )}
        </div>

        {/* Right Comments & Annotations Inspector — Resizable & Collapsible */}
        {rightCommentsOpen ? (
          <>
            <div
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-label="Resize comments panel"
              aria-valuenow={rightPanelWidth}
              aria-valuemin={180}
              aria-valuemax={480}
              onPointerDown={(e) => startResize('right', e)}
              onDoubleClick={() => setRightPanelWidth(256)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  setRightPanelWidth((w) => Math.min(480, w + 16));
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  setRightPanelWidth((w) => Math.max(180, w - 16));
                }
              }}
              title="Drag to resize · Double-click to reset"
              className={`w-1.5 shrink-0 cursor-col-resize transition-colors flex items-center justify-center group focus:outline-none ${
                resizingSide === 'right'
                  ? 'bg-[var(--accent-color)]/45'
                  : 'hover:bg-[var(--accent-color)]/30 bg-transparent'
              }`}
            >
              <span className="w-px h-8 rounded-full bg-[var(--border-strong)] opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            <div
              style={{ width: rightPanelWidth }}
              className="shrink-0 border-l border-[var(--border-hairline)] bg-[var(--surface-chrome)] flex flex-col overflow-hidden text-xs"
            >
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--border-hairline)] shrink-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold text-[var(--text-primary)] truncate">Comments</span>
                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                    ({annotations.length})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setRightCommentsOpen(false)}
                  aria-label="Collapse comments panel"
                  title="Collapse comments panel"
                  className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] shrink-0"
                >
                  <PanelRightClose className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                {annotations.length === 0 ? (
                  <p className="text-[var(--text-muted)] text-center py-8 px-3 leading-relaxed">
                    Select Highlight, Note, Draw, or Stamp in the toolbar to annotate this PDF.
                  </p>
                ) : (
                  annotations.map((ann) => {
                    const selected = ann.id === selectedAnnotationId;
                    const resolvedLayerId = resolveAnnotationLayerId(ann, layers);
                    const annLayer = getLayerById(layers, resolvedLayerId);
                    return (
                      <div
                        key={ann.id}
                        className={`rounded-lg border p-2.5 transition-colors ${
                          selected
                            ? 'border-[var(--accent-color)] bg-[var(--surface-elevated)]'
                            : 'border-[var(--border-hairline)] bg-[var(--surface-subtle)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAnnotationId(ann.id);
                              jumpToPage(ann.pageNumber);
                            }}
                            className="flex items-center gap-1.5 min-w-0 text-left"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-sm shrink-0"
                              style={{ backgroundColor: ann.color }}
                            />
                            <span className="font-medium text-[var(--text-primary)] truncate">
                              {ann.type === 'textbox'
                                ? 'Text Box'
                                : ann.type === 'checkbox'
                                  ? 'Checkbox'
                                  : ann.author}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)] tabular-nums shrink-0">
                              p.{ann.pageNumber}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (annLayer.locked) {
                                handleLockedLayerAttempt(annLayer.name);
                                return;
                              }
                              commitAnnotations(annotations.filter((a) => a.id !== ann.id));
                            }}
                            aria-label={`Delete annotation on page ${ann.pageNumber}`}
                            className="p-0.5 text-[var(--text-muted)] hover:text-rose-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-1.5 text-[10px] text-[var(--text-muted)] mb-1.5">
                          <span className="capitalize">
                            {ann.type} {ann.stampLabel ? `· ${ann.stampLabel}` : ''}
                          </span>
                          <select
                            aria-label={`Layer for ${ann.type} on page ${ann.pageNumber}`}
                            value={resolvedLayerId}
                            disabled={annLayer.locked}
                            onChange={(e) => {
                              if (isLayerLocked(layers, e.target.value)) {
                                const target = getLayerById(layers, e.target.value);
                                handleLockedLayerAttempt(target.name);
                                return;
                              }
                              handleUpdateAnnotation(ann.id, { layerId: e.target.value });
                            }}
                            className="h-5 max-w-[110px] px-1 rounded bg-[var(--surface-chrome)] border border-[var(--border-hairline)] text-[10px] text-[var(--text-secondary)] truncate"
                          >
                            {layers.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {(ann.type === 'textbox' || ann.type === 'checkbox') && (
                          <input
                            type="text"
                            value={ann.fieldName || ''}
                            readOnly={annLayer.locked}
                            placeholder="Field name (optional)"
                            aria-label={`Field name for ${ann.type} on page ${ann.pageNumber}`}
                            onChange={(e) =>
                              handleUpdateAnnotation(ann.id, { fieldName: e.target.value })
                            }
                            className="w-full h-6 px-2 mb-1.5 rounded bg-[var(--surface-chrome)] border border-[var(--border-hairline)] text-[10px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
                          />
                        )}

                        {ann.type === 'stamp' && (
                          <div className="space-y-1.5 mb-1.5">
                            <input
                              type="text"
                              value={ann.stampLabel ?? ''}
                              readOnly={annLayer.locked}
                              placeholder="Stamp text…"
                              aria-label={`Stamp text on page ${ann.pageNumber}`}
                              onChange={(e) =>
                                handleUpdateAnnotation(ann.id, { stampLabel: e.target.value })
                              }
                              className="w-full h-6 px-2 rounded bg-[var(--surface-chrome)] border border-[var(--border-hairline)] text-[11px] font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
                            />
                            <input
                              type="text"
                              value={ann.stampSubtext ?? ''}
                              readOnly={annLayer.locked}
                              placeholder="Subtext (optional)"
                              aria-label={`Stamp subtext on page ${ann.pageNumber}`}
                              onChange={(e) =>
                                handleUpdateAnnotation(ann.id, { stampSubtext: e.target.value })
                              }
                              className="w-full h-6 px-2 rounded bg-[var(--surface-chrome)] border border-[var(--border-hairline)] text-[10px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
                            />
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1">
                                {STAMP_COLOR_PALETTE.slice(0, 6).map((hex) => (
                                  <button
                                    key={hex}
                                    type="button"
                                    disabled={annLayer.locked}
                                    aria-label={`Set stamp color ${hex} in panel`}
                                    onClick={() =>
                                      handleUpdateAnnotation(ann.id, { color: hex }, { recordUndo: true })
                                    }
                                    className={`w-3 h-3 rounded-sm border ${
                                      ann.color.toLowerCase() === hex.toLowerCase()
                                        ? 'ring-1 ring-[var(--accent-color)] ring-offset-1 ring-offset-[var(--surface-subtle)]'
                                        : 'border-white/20'
                                    }`}
                                    style={{ backgroundColor: hex }}
                                  />
                                ))}
                              </div>
                              <select
                                aria-label={`Stamp style on page ${ann.pageNumber}`}
                                disabled={annLayer.locked}
                                value={ann.stampStyle || 'outline'}
                                onChange={(e) =>
                                  handleUpdateAnnotation(
                                    ann.id,
                                    { stampStyle: e.target.value as StampStyle },
                                    { recordUndo: true }
                                  )
                                }
                                className="h-5 px-1 rounded bg-[var(--surface-chrome)] border border-[var(--border-hairline)] text-[10px] text-[var(--text-primary)]"
                              >
                                <option value="outline">Outline</option>
                                <option value="solid">Solid</option>
                                <option value="badge">Tinted</option>
                              </select>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSaveStampTemplateFromAnnotation(ann)}
                              className="w-full h-6 px-2 rounded bg-[var(--surface-chrome)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] text-[10px] font-medium text-[var(--text-primary)] flex items-center justify-center gap-1"
                            >
                              <BookmarkPlus className="w-3 h-3 text-[var(--accent-color)]" />
                              <span>Save Stamp as Template</span>
                            </button>
                          </div>
                        )}

                        <textarea
                          rows={2}
                          value={
                            ann.type === 'textbox' || ann.type === 'text'
                              ? (ann.text ?? '')
                              : (ann.comment ?? '')
                          }
                          readOnly={annLayer.locked}
                          placeholder={
                            ann.type === 'textbox' || ann.type === 'text'
                              ? 'Text box content…'
                              : 'Add a review comment…'
                          }
                          aria-label={
                            ann.type === 'textbox' || ann.type === 'text'
                              ? `Text content for ${ann.type} on page ${ann.pageNumber}`
                              : `Comment for ${ann.type} on page ${ann.pageNumber}`
                          }
                          onChange={(e) => {
                            if (annLayer.locked) {
                              handleLockedLayerAttempt(annLayer.name);
                              return;
                            }
                            const val = e.target.value;
                            const next = annotations.map((a) =>
                              a.id === ann.id
                                ? a.type === 'textbox' || a.type === 'text'
                                  ? { ...a, text: val }
                                  : { ...a, comment: val }
                                : a
                            );
                            setAnnotations(next);
                            if (tab.fileId) savePdfAnnotations(tab.fileId, next).catch(() => {});
                          }}
                          className="w-full px-2 py-1.5 rounded bg-[var(--surface-chrome)] border border-[var(--border-hairline)] text-[11px] leading-snug text-[var(--text-primary)] resize-none focus:outline-none focus:border-[var(--accent-color)]"
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="w-7 shrink-0 border-l border-[var(--border-hairline)] bg-[var(--surface-chrome)] flex flex-col items-center pt-2">
            <button
              type="button"
              onClick={() => setRightCommentsOpen(true)}
              aria-label="Expand comments panel"
              title="Expand comments panel"
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
            >
              <PanelRightOpen className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {pdfBytes && exportImagesOpen && (
        <PdfImageExportDialog
          open={exportImagesOpen}
          onClose={() => setExportImagesOpen(false)}
          pdfBytes={pdfBytes}
          documentName={tab.title}
          totalPages={numPages || 1}
          currentPage={currentPage}
          pageSizePt={pageSizePt}
        />
      )}
      {pdfBytes && signatureModalOpen && (
        <PdfSignatureModal
          open={signatureModalOpen}
          onClose={() => setSignatureModalOpen(false)}
          metadataInfo={metadataInfo}
          onInsertSignature={(dataUrl, label) => {
            const targetLayer = getLayerById(layers, activeLayerId);
            if (targetLayer.locked) {
              handleLockedLayerAttempt(targetLayer.name);
              return;
            }
            const id = `sig-${Date.now().toString(36)}`;
            commitAnnotations([
              ...annotations,
              {
                id,
                pageNumber: currentPage,
                layerId: targetLayer.id,
                type: 'signature',
                x: 0.56,
                y: 0.72,
                width: 0.28,
                height: 0.09,
                color: '#111827',
                opacity: 1,
                strokeWidth: 1,
                imageDataUrl: dataUrl,
                comment: `Visual Signature (${label})`,
                author: 'Workspace User',
                createdAt: Date.now(),
              },
            ]);
            setSelectedAnnotationId(id);
            setActiveTool('select');
          }}
        />
      )}
      {pdfBytes && organizerModalOpen && (
        <PdfPageOrganizerModal
          open={organizerModalOpen}
          onClose={() => setOrganizerModalOpen(false)}
          pdfBytes={pdfBytes}
          documentName={tab.title}
          onApplyPdfBytes={handleApplyModifiedBytes}
        />
      )}
      {pdfBytes && watermarkModalOpen && (
        <PdfWatermarkAndMetaModal
          key={metadataInfo?.sha256Hex || 'empty'}
          open={watermarkModalOpen}
          onClose={() => setWatermarkModalOpen(false)}
          pdfBytes={pdfBytes}
          metadataInfo={metadataInfo}
          onApplyPdfBytes={handleApplyModifiedBytes}
        />
      )}

      {contextMenu && (
        <PdfContextMenu
          menu={contextMenu}
          annotation={
            contextMenu.annotationId
              ? annotations.find((a) => a.id === contextMenu.annotationId) || null
              : null
          }
          layers={layers}
          activeLayerId={activeLayerId}
          canPaste={Boolean(copiedAnnotation)}
          isLocked={(() => {
            const ann = contextMenu.annotationId
              ? annotations.find((a) => a.id === contextMenu.annotationId)
              : null;
            const lid = ann ? resolveAnnotationLayerId(ann, layers) : activeLayerId;
            return getLayerById(layers, lid).locked;
          })()}
          onClose={() => setContextMenu(null)}
          onCopyAnnotation={handleCopyAnnotation}
          onCutAnnotation={handleCutAnnotation}
          onDuplicateAnnotation={handleDuplicateAnnotation}
          onPasteHere={(pageNum, nx, ny) => handlePasteAnnotation(pageNum, { x: nx, y: ny })}
          onDeleteAnnotation={handleDeleteAnnotation}
          onBringToFront={(id) => handleStackReorder(id, 'front')}
          onSendToBack={(id) => handleStackReorder(id, 'back')}
          onMoveToLayer={(id, layerId) =>
            handleUpdateAnnotation(id, { layerId }, { recordUndo: true })
          }
          onToggleCheckbox={(ann) =>
            handleUpdateAnnotation(ann.id, { checked: !ann.checked }, { recordUndo: true })
          }
          onEditStamp={(ann) => {
            setSelectedAnnotationId(ann.id);
            setEditingStampId(ann.id);
          }}
          onSaveStampTemplate={handleSaveStampTemplateFromAnnotation}
          onChangeAnnotationColor={(id, color) =>
            handleUpdateAnnotation(id, { color }, { recordUndo: true })
          }
          onCopySelectedText={handleCopySelectedText}
          onQuickInsert={handleQuickInsert}
          onZoomIn={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
          onZoomOut={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}
          onFitWidth={fitWidth}
          onRotate={() => setRotationDelta((r) => (r + 90) % 360)}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />
      )}

      <PdfShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
