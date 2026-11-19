'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { BookmarkPlus, Check, Move, Palette, Pencil, StickyNote } from 'lucide-react';
import { createUniqueId, currentTimestamp } from '@/lib/annotationUtils';
import { getLayerById, getVisibleOrderedAnnotations, isLayerLocked, resolveAnnotationLayerId } from '@/lib/pdfLayers';
import { resourceManager } from '@/lib/resourceManager';
import {
  buildStampAnnotation,
  resolveStampColors,
  STAMP_COLOR_PALETTE,
} from '@/lib/stampTemplates';
import type { PdfAnnotation, PdfLayer, PdfPoint, PdfTool, StampStyle } from '@/types/workspace';
import type { AcroFormFieldDescriptor } from '@/lib/pdfOperations';

interface PdfPageCanvasProps {
  scopeId: string;
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  rotationDelta: number;
  forceEvict?: boolean;
  activeTool: PdfTool;
  activeColor: string;
  activeStrokeWidth: number;
  activeOpacity: number;
  activeStampLabel: string;
  activeStampSubtext?: string;
  activeStampStyle?: StampStyle;
  editingStampId?: string | null;
  onSetEditingStampId?: (id: string | null) => void;
  onSaveStampTemplate?: (ann: PdfAnnotation) => void;
  layers: PdfLayer[];
  activeLayerId: string;
  annotations: PdfAnnotation[];
  selectedAnnotationId: string | null;
  onSelectAnnotation: (id: string | null) => void;
  onAddAnnotation: (ann: PdfAnnotation) => void;
  onUpdateAnnotation: (
    id: string,
    patch: Partial<PdfAnnotation>,
    options?: { recordUndo?: boolean }
  ) => void;
  onDeleteAnnotation: (id: string) => void;
  onLockedLayerAttempt?: (layerName: string) => void;
  onContextMenuRequest?: (info: {
    clientX: number;
    clientY: number;
    pageNumber: number;
    normX: number;
    normY: number;
    annotationId: string | null;
    selectedText: string;
  }) => void;
  formFields: AcroFormFieldDescriptor[];
  formValues: Record<string, string | boolean>;
  onFormValueChange: (name: string, val: string | boolean) => void;
  searchHighlightQuery?: string;
  onRegisterPageRef?: (pageNumber: number, el: HTMLDivElement | null) => void;
  onPageRendered?: (pageNumber: number) => void;
  onPageHidden?: (pageNumber: number) => void;
}

export const PdfPageCanvas = React.memo(function PdfPageCanvas({
  scopeId,
  pdfDoc,
  pageNumber,
  scale,
  rotationDelta,
  forceEvict = false,
  activeTool,
  activeColor,
  activeStrokeWidth,
  activeOpacity,
  activeStampLabel,
  activeStampSubtext,
  activeStampStyle,
  editingStampId,
  onSetEditingStampId,
  onSaveStampTemplate,
  layers,
  activeLayerId,
  annotations,
  selectedAnnotationId,
  onSelectAnnotation,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onLockedLayerAttempt,
  onContextMenuRequest,
  formFields,
  formValues,
  onFormValueChange,
  searchHighlightQuery,
  onRegisterPageRef,
  onPageRendered,
  onPageHidden,
}: PdfPageCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const pageRef = useRef<PDFPageProxy | null>(null);

  const [isVisible, setIsVisible] = useState(pageNumber <= 2);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: Math.round(612 * scale),
    height: Math.round(792 * scale),
  });

  // Drawing / dragging / resizing state
  const [draftAnn, setDraftAnn] = useState<PdfAnnotation | null>(null);
  const dragStateRef = useRef<{
    mode: 'draw' | 'move' | 'resize';
    annId?: string;
    startNormX: number;
    startNormY: number;
    origX?: number;
    origY?: number;
    origW?: number;
    origH?: number;
    origPoints?: PdfPoint[];
    moved?: boolean;
    undoRecorded?: boolean;
    points?: PdfPoint[];
  } | null>(null);

  useEffect(() => {
    onRegisterPageRef?.(pageNumber, wrapperRef.current);
    return () => onRegisterPageRef?.(pageNumber, null);
  }, [pageNumber, onRegisterPageRef]);

  // Bidirectional viewport virtualization with IntersectionObserver
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setIsVisible(entry.isIntersecting);
        if (!entry.isIntersecting) {
          onPageHidden?.(pageNumber);
        }
      },
      { rootMargin: '250px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNumber, onPageHidden]);

  const shouldRender = isVisible && !forceEvict;
  const canvasResourceId = `${scopeId}:page:${pageNumber}`;

  // Render PDF page canvas + text layer when visible; release backing store when offscreen
  useEffect(() => {
    const textContainer = textLayerRef.current;
    if (!shouldRender) {
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
      if (textContainer) {
        textContainer.innerHTML = '';
      }
      resourceManager.releaseCanvas(canvasResourceId);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) {
          page.cleanup();
          return;
        }
        pageRef.current = page;
        const totalRotation = (page.rotate + rotationDelta) % 360;
        const viewport = page.getViewport({ scale, rotation: totalRotation });
        setDimensions({
          width: Math.round(viewport.width),
          height: Math.round(viewport.height),
        });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(viewport.width * dpr));
        canvas.height = Math.max(1, Math.round(viewport.height * dpr));
        canvas.style.width = `${Math.round(viewport.width)}px`;
        canvas.style.height = `${Math.round(viewport.height)}px`;

        resourceManager.registerCanvas(
          canvasResourceId,
          scopeId,
          canvas.width,
          canvas.height,
          () => {
            if (canvasRef.current) {
              canvasRef.current.width = 0;
              canvasRef.current.height = 0;
            }
          }
        );

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, viewport.width, viewport.height);

        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // ignore
          }
        }
        const task = page.render({ canvasContext: ctx, viewport, canvas });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;

        onPageRendered?.(pageNumber);

        // Lightweight selectable text spans
        const textContent = await page.getTextContent();
        if (cancelled || !textLayerRef.current) return;
        const container = textLayerRef.current;
        container.innerHTML = '';

        const queryLower = (searchHighlightQuery || '').trim().toLowerCase();

        for (const item of textContent.items) {
          if (!('str' in item) || !item.str) continue;
          const tx = item.transform;
          const [vx, vy] = viewport.convertToViewportPoint(tx[4], tx[5]);
          const fontHeight = Math.hypot(tx[2], tx[3]) * scale;
          const span = document.createElement('span');
          span.textContent = item.str;
          span.style.left = `${vx}px`;
          span.style.top = `${vy - fontHeight}px`;
          span.style.fontSize = `${Math.max(6, fontHeight)}px`;
          span.style.fontFamily = 'sans-serif';
          if (queryLower && item.str.toLowerCase().includes(queryLower)) {
            span.style.backgroundColor = 'rgba(250, 204, 21, 0.45)';
            span.style.borderRadius = '2px';
          }
          container.appendChild(span);
        }

        // Release intermediate page operator/font buffers once canvas + text layer are built
        page.cleanup();
      } catch (err) {
        if (err && typeof err === 'object' && 'name' in err && err.name === 'RenderingCancelledException') {
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
        renderTaskRef.current = null;
      }
      if (pageRef.current) {
        try {
          pageRef.current.cleanup();
        } catch {
          // ignore
        }
        pageRef.current = null;
      }
      resourceManager.releaseCanvas(canvasResourceId);
    };
  }, [
    pdfDoc,
    pageNumber,
    scale,
    rotationDelta,
    shouldRender,
    searchHighlightQuery,
    scopeId,
    canvasResourceId,
    onPageRendered,
  ]);

  const toNorm = (clientX: number, clientY: number) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  };

  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool === 'select') {
      onSelectAnnotation(null);
      return;
    }

    if (activeTool === 'eraser') return;

    const targetLayer = getLayerById(layers, activeLayerId);
    if (targetLayer.locked) {
      onLockedLayerAttempt?.(targetLayer.name);
      return;
    }

    const pos = toNorm(e.clientX, e.clientY);

    if (activeTool === 'note') {
      const id = createUniqueId('ann');
      onAddAnnotation({
        id,
        pageNumber,
        layerId: targetLayer.id,
        type: 'note',
        x: Math.min(0.94, pos.x),
        y: Math.min(0.94, pos.y),
        width: 0.036,
        height: 0.028,
        color: activeColor,
        opacity: 0.95,
        strokeWidth: 1.5,
        comment: 'New review note',
        author: 'Workspace User',
        createdAt: currentTimestamp(),
      });
      onSelectAnnotation(id);
      return;
    }

    if (activeTool === 'text') {
      const id = createUniqueId('ann');
      onAddAnnotation({
        id,
        pageNumber,
        layerId: targetLayer.id,
        type: 'text',
        x: Math.min(0.8, pos.x),
        y: Math.min(0.94, pos.y),
        width: 0.24,
        height: 0.045,
        color: activeColor === '#facc15' ? '#111827' : activeColor,
        opacity: 1,
        strokeWidth: 1,
        fontSize: 13,
        text: 'Editable text',
        author: 'Workspace User',
        createdAt: currentTimestamp(),
      });
      onSelectAnnotation(id);
      return;
    }

    if (activeTool === 'stamp') {
      const created = buildStampAnnotation({
        pageNumber,
        layerId: targetLayer.id,
        x: pos.x,
        y: pos.y,
        label: activeStampLabel || 'REVIEWED',
        subtext: activeStampSubtext,
        color: activeColor,
        style: activeStampStyle || 'outline',
      });
      onAddAnnotation(created);
      onSelectAnnotation(created.id);
      return;
    }

    // Drag-to-draw or click-to-place tools: textbox, checkbox, highlight, underline, strikethrough, freehand, rect, circle, line, arrow
    e.currentTarget.setPointerCapture(e.pointerId);
    const id = createUniqueId('ann');
    const isComponent = activeTool === 'textbox' || activeTool === 'checkbox';
    const resolvedColor =
      isComponent && activeColor === '#facc15' ? '#2563eb' : activeColor;
    const initial: PdfAnnotation = {
      id,
      pageNumber,
      layerId: targetLayer.id,
      type: activeTool,
      x: pos.x,
      y: pos.y,
      width: 0.005,
      height: activeTool === 'highlight' ? 0.024 : 0.005,
      points: activeTool === 'freehand' ? [pos] : undefined,
      color: resolvedColor,
      fillColor: isComponent ? '#ffffff' : undefined,
      opacity: activeTool === 'highlight' ? 0.42 : isComponent ? 1 : activeOpacity,
      strokeWidth: isComponent ? Math.max(1.5, activeStrokeWidth) : activeStrokeWidth,
      fontSize: activeTool === 'textbox' ? 12 : undefined,
      fieldName: isComponent
        ? `${activeTool}_p${pageNumber}_${id.slice(-4)}`
        : undefined,
      text: activeTool === 'textbox' ? 'Text box' : undefined,
      checked: activeTool === 'checkbox' ? false : undefined,
      author: 'Workspace User',
      createdAt: currentTimestamp(),
    };
    dragStateRef.current = {
      mode: 'draw',
      startNormX: pos.x,
      startNormY: pos.y,
      moved: false,
      points: activeTool === 'freehand' ? [pos] : undefined,
    };
    setDraftAnn(initial);
  };

  const handleOverlayPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const pos = toNorm(e.clientX, e.clientY);
    if (
      !drag.moved &&
      (Math.abs(pos.x - drag.startNormX) > 0.004 || Math.abs(pos.y - drag.startNormY) > 0.004)
    ) {
      drag.moved = true;
    }

    if (drag.mode === 'move' && drag.annId && drag.origX !== undefined && drag.origY !== undefined) {
      const dx = pos.x - drag.startNormX;
      const dy = pos.y - drag.startNormY;
      const shouldRecordUndo = !drag.undoRecorded && Boolean(drag.moved);
      if (shouldRecordUndo) drag.undoRecorded = true;
      if (drag.origPoints) {
        onUpdateAnnotation(
          drag.annId,
          {
            points: drag.origPoints.map((p) => ({
              x: Math.max(0, Math.min(1, p.x + dx)),
              y: Math.max(0, Math.min(1, p.y + dy)),
            })),
          },
          { recordUndo: shouldRecordUndo }
        );
      } else {
        onUpdateAnnotation(
          drag.annId,
          {
            x: Math.max(0, Math.min(0.96, drag.origX + dx)),
            y: Math.max(0, Math.min(0.96, drag.origY + dy)),
          },
          { recordUndo: shouldRecordUndo }
        );
      }
      return;
    }

    if (
      drag.mode === 'resize' &&
      drag.annId &&
      drag.origW !== undefined &&
      drag.origH !== undefined &&
      drag.origX !== undefined &&
      drag.origY !== undefined
    ) {
      const dx = pos.x - drag.startNormX;
      const dy = pos.y - drag.startNormY;
      const maxW = Math.max(0.025, 1 - drag.origX);
      const maxH = Math.max(0.02, 1 - drag.origY);
      const shouldRecordUndo = !drag.undoRecorded && Boolean(drag.moved);
      if (shouldRecordUndo) drag.undoRecorded = true;
      onUpdateAnnotation(
        drag.annId,
        {
          width: Math.max(0.024, Math.min(maxW, drag.origW + dx)),
          height: Math.max(0.018, Math.min(maxH, drag.origH + dy)),
        },
        { recordUndo: shouldRecordUndo }
      );
      return;
    }

    if (drag.mode === 'draw' && draftAnn) {
      if (draftAnn.type === 'freehand') {
        const nextPts = [...(drag.points || []), pos];
        drag.points = nextPts;
        setDraftAnn({ ...draftAnn, points: nextPts });
      } else if (draftAnn.type === 'line' || draftAnn.type === 'arrow') {
        setDraftAnn({
          ...draftAnn,
          x: drag.startNormX,
          y: drag.startNormY,
          width: pos.x - drag.startNormX,
          height: pos.y - drag.startNormY,
        });
      } else {
        const minX = Math.min(drag.startNormX, pos.x);
        const minY = Math.min(drag.startNormY, pos.y);
        const w = Math.max(0.015, Math.abs(pos.x - drag.startNormX));
        const h =
          draftAnn.type === 'underline' || draftAnn.type === 'strikethrough'
            ? 0.018
            : Math.max(0.018, Math.abs(pos.y - drag.startNormY));
        setDraftAnn({ ...draftAnn, x: minX, y: minY, width: w, height: h });
      }
    }
  };

  const handleOverlayPointerUp = () => {
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    if (drag?.mode === 'draw' && draftAnn) {
      if (draftAnn.type === 'textbox' && !drag.moved) {
        const placed: PdfAnnotation = {
          ...draftAnn,
          x: Math.min(0.72, draftAnn.x),
          y: Math.min(0.92, draftAnn.y),
          width: 0.26,
          height: 0.06,
        };
        onAddAnnotation(placed);
        onSelectAnnotation(placed.id);
        setDraftAnn(null);
        return;
      }
      if (draftAnn.type === 'checkbox' && !drag.moved) {
        const placed: PdfAnnotation = {
          ...draftAnn,
          x: Math.min(0.95, draftAnn.x),
          y: Math.min(0.95, draftAnn.y),
          width: 0.032,
          height: 0.025,
        };
        onAddAnnotation(placed);
        onSelectAnnotation(placed.id);
        setDraftAnn(null);
        return;
      }

      const hasSize =
        draftAnn.type === 'freehand'
          ? (draftAnn.points?.length || 0) > 1
          : Math.abs(draftAnn.width) > 0.012 || Math.abs(draftAnn.height) > 0.012;
      if (hasSize) {
        onAddAnnotation(draftAnn);
        onSelectAnnotation(draftAnn.id);
      }
      setDraftAnn(null);
    }
  };

  const pageAnnotations = useMemo(() => {
    const ordered = getVisibleOrderedAnnotations(annotations, layers).filter(
      (a) => a.pageNumber === pageNumber
    );
    return draftAnn ? [...ordered, draftAnn] : ordered;
  }, [annotations, layers, pageNumber, draftAnn]);

  const pageFormFields = useMemo(
    () => formFields.filter((f) => f.pageIndex === pageNumber - 1),
    [formFields, pageNumber]
  );

  return (
    <div
      ref={wrapperRef}
      tabIndex={-1}
      data-page-number={pageNumber}
      style={{ width: dimensions.width, height: dimensions.height }}
      onContextMenu={(e) => {
        e.preventDefault();
        const pos = toNorm(e.clientX, e.clientY);
        const selectedText = window.getSelection()?.toString().trim() || '';
        onContextMenuRequest?.({
          clientX: e.clientX,
          clientY: e.clientY,
          pageNumber,
          normX: pos.x,
          normY: pos.y,
          annotationId: null,
          selectedText,
        });
      }}
      className="relative bg-white shadow-md rounded-[2px] overflow-hidden shrink-0 select-none border border-black/10 focus:outline-none"
    >
      {/* PDF.js Canvas (unmounted when offscreen so Chromium frees backing stores) */}
      {shouldRender ? (
        <canvas ref={canvasRef} className="block w-full h-full" />
      ) : (
        <div
          aria-hidden="true"
          className="w-full h-full bg-white/95 flex items-center justify-center text-[11px] text-slate-400"
        >
          Page {pageNumber}
        </div>
      )}

      {/* Selectable Text Layer (active when Select tool is chosen) */}
      <div
        ref={textLayerRef}
        className={`pdf-text-layer ${activeTool === 'select' ? 'pointer-events-auto' : 'pointer-events-none'}`}
      />

      {/* Interactive AcroForm Overlay */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {pageFormFields.map((field) => {
          const val = formValues[field.name] ?? field.value;
          const style: React.CSSProperties = {
            left: `${field.rectNorm.x * 100}%`,
            top: `${field.rectNorm.y * 100}%`,
            width: `${field.rectNorm.width * 100}%`,
            height: `${field.rectNorm.height * 100}%`,
          };
          const invalidRequired = field.required && (val === '' || val === false);

          return (
            <div key={field.name} style={style} className="absolute pointer-events-auto">
              {field.type === 'text' && (
                <input
                  type="text"
                  value={String(val)}
                  aria-label={field.name}
                  onChange={(e) => onFormValueChange(field.name, e.target.value)}
                  className={`w-full h-full px-1.5 text-[11px] bg-[#eef4ff] text-slate-900 border rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                    invalidRequired ? 'border-rose-500' : 'border-blue-300'
                  }`}
                />
              )}
              {field.type === 'checkbox' && (
                <div className="w-full h-full bg-white flex items-center justify-center rounded-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(val)}
                    aria-label={field.name}
                    onChange={(e) => onFormValueChange(field.name, e.target.checked)}
                    className="w-full h-full accent-blue-600 cursor-pointer"
                  />
                </div>
              )}
              {field.type === 'dropdown' && (
                <select
                  value={String(val)}
                  aria-label={field.name}
                  onChange={(e) => onFormValueChange(field.name, e.target.value)}
                  className="w-full h-full px-1 text-[11px] bg-[#eef4ff] text-slate-900 border border-blue-300 rounded-sm focus:outline-none"
                >
                  {(field.options || []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>

      {/* Interactive Annotation Canvas & SVG Overlay */}
      <div
        ref={overlayRef}
        onPointerDown={handleOverlayPointerDown}
        onPointerMove={handleOverlayPointerMove}
        onPointerUp={handleOverlayPointerUp}
        className={`absolute inset-0 z-20 ${
          activeTool === 'select'
            ? 'pointer-events-none'
            : activeTool === 'eraser'
              ? 'cursor-not-allowed'
              : 'cursor-crosshair'
        }`}
      >
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          {pageAnnotations.map((ann) => {
            const resolvedLayerId = resolveAnnotationLayerId(ann, layers);
            const locked = isLayerLocked(layers, resolvedLayerId);
            const layerObj = getLayerById(layers, resolvedLayerId);
            const isSelected = ann.id === selectedAnnotationId;

            const handleStrokePointerDown = (e: React.PointerEvent<SVGElement>) => {
              e.stopPropagation();
              if (e.button === 2) return;
              if (activeTool === 'eraser') {
                if (locked) onLockedLayerAttempt?.(layerObj.name);
                else onDeleteAnnotation(ann.id);
                return;
              }
              onSelectAnnotation(ann.id);
              wrapperRef.current?.focus({ preventScroll: true });
              if (locked) {
                onLockedLayerAttempt?.(layerObj.name);
                return;
              }
              overlayRef.current?.setPointerCapture(e.pointerId);
              const pos = toNorm(e.clientX, e.clientY);
              dragStateRef.current = {
                mode: 'move',
                annId: ann.id,
                startNormX: pos.x,
                startNormY: pos.y,
                origX: ann.x,
                origY: ann.y,
                origPoints: ann.points ? ann.points.map((p) => ({ ...p })) : undefined,
                moved: false,
                undoRecorded: false,
              };
            };

            const handleStrokeContextMenu = (e: React.MouseEvent<SVGElement>) => {
              e.preventDefault();
              e.stopPropagation();
              onSelectAnnotation(ann.id);
              const pos = toNorm(e.clientX, e.clientY);
              onContextMenuRequest?.({
                clientX: e.clientX,
                clientY: e.clientY,
                pageNumber,
                normX: pos.x,
                normY: pos.y,
                annotationId: ann.id,
                selectedText: '',
              });
            };

            if (ann.type === 'freehand' && ann.points && ann.points.length > 1) {
              const d = ann.points
                .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${(p.x * 100).toFixed(2)} ${(p.y * 100).toFixed(2)}`)
                .join(' ');
              return (
                <g key={ann.id}>
                  {isSelected && (
                    <path
                      d={d}
                      fill="none"
                      stroke="#3b82f6"
                      strokeOpacity={0.55}
                      strokeWidth={ann.strokeWidth * 0.25 + 0.9}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  <path
                    d={d}
                    fill="none"
                    stroke={ann.color}
                    strokeOpacity={ann.opacity}
                    strokeWidth={ann.strokeWidth * 0.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(2.2, ann.strokeWidth * 0.5)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ pointerEvents: 'stroke', cursor: locked ? 'default' : 'move' }}
                    onPointerDown={handleStrokePointerDown}
                    onContextMenu={handleStrokeContextMenu}
                  />
                </g>
              );
            }
            if (ann.type === 'line' || ann.type === 'arrow') {
              const x1 = ann.x * 100;
              const y1 = ann.y * 100;
              const x2 = (ann.x + ann.width) * 100;
              const y2 = (ann.y + ann.height) * 100;
              return (
                <g key={ann.id}>
                  {isSelected && (
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#3b82f6"
                      strokeOpacity={0.55}
                      strokeWidth={ann.strokeWidth * 0.28 + 0.9}
                      strokeLinecap="round"
                    />
                  )}
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={ann.color}
                    strokeOpacity={ann.opacity}
                    strokeWidth={ann.strokeWidth * 0.28}
                    strokeLinecap="round"
                  />
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="transparent"
                    strokeWidth={Math.max(2.2, ann.strokeWidth * 0.5)}
                    strokeLinecap="round"
                    style={{ pointerEvents: 'stroke', cursor: locked ? 'default' : 'move' }}
                    onPointerDown={handleStrokePointerDown}
                    onContextMenu={handleStrokeContextMenu}
                  />
                </g>
              );
            }
            return null;
          })}
        </svg>

        {pageAnnotations.map((ann) => {
          if (ann.type === 'freehand' || ann.type === 'line' || ann.type === 'arrow') {
            return null;
          }

          const resolvedLayerId = resolveAnnotationLayerId(ann, layers);
          const locked = isLayerLocked(layers, resolvedLayerId);
          const layerObj = getLayerById(layers, resolvedLayerId);
          const isSelected = ann.id === selectedAnnotationId;
          const isResizable =
            isSelected &&
            !locked &&
            (ann.type === 'textbox' ||
              ann.type === 'checkbox' ||
              ann.type === 'text' ||
              ann.type === 'rect' ||
              ann.type === 'circle' ||
              ann.type === 'stamp' ||
              ann.type === 'image' ||
              ann.type === 'signature');

          const style: React.CSSProperties = {
            left: `${ann.x * 100}%`,
            top: `${ann.y * 100}%`,
            width: `${ann.width * 100}%`,
            height: `${ann.height * 100}%`,
          };

          const startMove = (e: React.PointerEvent) => {
            e.stopPropagation();
            if (e.button === 2) return;
            if (activeTool === 'eraser') {
              if (locked) {
                onLockedLayerAttempt?.(layerObj.name);
                return;
              }
              onDeleteAnnotation(ann.id);
              return;
            }
            onSelectAnnotation(ann.id);
            wrapperRef.current?.focus({ preventScroll: true });
            if (locked) {
              onLockedLayerAttempt?.(layerObj.name);
              return;
            }
            overlayRef.current?.setPointerCapture(e.pointerId);
            const pos = toNorm(e.clientX, e.clientY);
            dragStateRef.current = {
              mode: 'move',
              annId: ann.id,
              startNormX: pos.x,
              startNormY: pos.y,
              origX: ann.x,
              origY: ann.y,
              moved: false,
              undoRecorded: false,
            };
          };

          const startResize = (e: React.PointerEvent) => {
            e.stopPropagation();
            if (e.button === 2) return;
            if (locked) {
              onLockedLayerAttempt?.(layerObj.name);
              return;
            }
            overlayRef.current?.setPointerCapture(e.pointerId);
            const pos = toNorm(e.clientX, e.clientY);
            dragStateRef.current = {
              mode: 'resize',
              annId: ann.id,
              startNormX: pos.x,
              startNormY: pos.y,
              origX: ann.x,
              origY: ann.y,
              origW: ann.width,
              origH: ann.height,
              moved: false,
              undoRecorded: false,
            };
          };

          return (
            <div
              key={ann.id}
              style={style}
              data-annotation-id={ann.id}
              data-annotation-type={ann.type}
              onPointerDown={startMove}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelectAnnotation(ann.id);
                const pos = toNorm(e.clientX, e.clientY);
                onContextMenuRequest?.({
                  clientX: e.clientX,
                  clientY: e.clientY,
                  pageNumber,
                  normX: pos.x,
                  normY: pos.y,
                  annotationId: ann.id,
                  selectedText: '',
                });
              }}
              className={`absolute pointer-events-auto ${
                locked ? 'cursor-default' : 'cursor-move'
              } ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
            >
              {ann.type === 'textbox' && (
                <div
                  style={{
                    backgroundColor: ann.fillColor || '#ffffff',
                    borderColor: ann.color,
                    borderWidth: `${Math.max(1, ann.strokeWidth || 1)}px`,
                    opacity: ann.opacity,
                  }}
                  className="w-full h-full border rounded-[3px] shadow-xs flex items-stretch overflow-hidden"
                >
                  <textarea
                    value={ann.text ?? ''}
                    readOnly={locked}
                    aria-label={ann.fieldName || 'PDF text box component'}
                    placeholder="Type here…"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (activeTool === 'eraser') {
                        if (locked) onLockedLayerAttempt?.(layerObj.name);
                        else onDeleteAnnotation(ann.id);
                        return;
                      }
                      onSelectAnnotation(ann.id);
                    }}
                    onChange={(e) => {
                      if (locked) {
                        onLockedLayerAttempt?.(layerObj.name);
                        return;
                      }
                      onUpdateAnnotation(ann.id, { text: e.target.value });
                    }}
                    style={{
                      fontSize: `${Math.max(9, (ann.fontSize || 12) * scale)}px`,
                    }}
                    className="w-full h-full bg-transparent text-slate-900 px-1.5 py-1 resize-none focus:outline-none leading-snug placeholder:text-slate-400"
                  />
                </div>
              )}

              {ann.type === 'checkbox' && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={Boolean(ann.checked)}
                  aria-label={ann.fieldName || 'PDF checkbox component'}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (e.button === 2) return;
                    if (activeTool === 'eraser') {
                      if (locked) onLockedLayerAttempt?.(layerObj.name);
                      else onDeleteAnnotation(ann.id);
                      return;
                    }
                    onSelectAnnotation(ann.id);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (locked) {
                      onLockedLayerAttempt?.(layerObj.name);
                      return;
                    }
                    onUpdateAnnotation(ann.id, { checked: !ann.checked }, { recordUndo: true });
                  }}
                  style={{
                    backgroundColor: ann.fillColor || '#ffffff',
                    borderColor: ann.color,
                    borderWidth: `${Math.max(1.5, ann.strokeWidth || 1.5)}px`,
                    opacity: ann.opacity,
                  }}
                  className="w-full h-full border rounded-[3px] flex items-center justify-center shadow-xs cursor-pointer"
                >
                  {ann.checked && (
                    <Check className="w-[75%] h-[75%]" style={{ color: ann.color }} strokeWidth={3} />
                  )}
                </button>
              )}

              {ann.type === 'highlight' && (
                <div
                  className="w-full h-full rounded-[2px]"
                  style={{ backgroundColor: ann.color, opacity: ann.opacity }}
                />
              )}
              {ann.type === 'underline' && (
                <div
                  className="w-full h-full flex items-end"
                  style={{ borderBottom: `${Math.max(2, ann.strokeWidth)}px solid ${ann.color}` }}
                />
              )}
              {ann.type === 'strikethrough' && (
                <div className="w-full h-full flex items-center">
                  <div className="w-full" style={{ height: Math.max(2, ann.strokeWidth), backgroundColor: ann.color }} />
                </div>
              )}
              {ann.type === 'rect' && (
                <div
                  className="w-full h-full"
                  style={{ border: `${ann.strokeWidth}px solid ${ann.color}`, opacity: ann.opacity }}
                />
              )}
              {ann.type === 'circle' && (
                <div
                  className="w-full h-full rounded-full"
                  style={{ border: `${ann.strokeWidth}px solid ${ann.color}`, opacity: ann.opacity }}
                />
              )}
              {ann.type === 'note' && (
                <div
                  title={ann.comment || 'Note'}
                  style={{ backgroundColor: ann.color }}
                  className="w-full h-full min-w-[22px] min-h-[22px] rounded shadow flex items-center justify-center text-slate-900 border border-black/20"
                >
                  <StickyNote className="w-3.5 h-3.5" />
                </div>
              )}
              {ann.type === 'text' && (
                <textarea
                  value={ann.text || ''}
                  readOnly={locked}
                  aria-label="PDF text annotation"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(ann.id);
                  }}
                  onChange={(e) => {
                    if (locked) {
                      onLockedLayerAttempt?.(layerObj.name);
                      return;
                    }
                    onUpdateAnnotation(ann.id, { text: e.target.value });
                  }}
                  style={{
                    color: ann.color,
                    fontSize: `${Math.max(10, (ann.fontSize || 13) * scale)}px`,
                  }}
                  className="w-full h-full bg-transparent resize-none border border-dashed border-slate-400/60 focus:outline-none p-0.5 leading-tight"
                />
              )}
              {ann.type === 'stamp' && (() => {
                const styleMode: StampStyle = ann.stampStyle || 'outline';
                const stampColors = resolveStampColors(ann.color, styleMode);
                const isEditingThis = editingStampId === ann.id && !locked;

                if (isEditingThis) {
                  return (
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        borderColor: stampColors.borderColor,
                        backgroundColor: stampColors.backgroundColor,
                        color: stampColors.textColor,
                      }}
                      className="w-full h-full border-2 rounded px-1.5 py-0.5 flex flex-col items-center justify-center gap-0.5 shadow-sm"
                    >
                      <input
                        type="text"
                        autoFocus
                        aria-label="Edit stamp label"
                        value={ann.stampLabel ?? ''}
                        maxLength={48}
                        placeholder="STAMP TEXT"
                        onChange={(e) => onUpdateAnnotation(ann.id, { stampLabel: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!ann.stampLabel?.trim()) {
                              onUpdateAnnotation(ann.id, { stampLabel: 'STAMP' });
                            }
                            onSetEditingStampId?.(null);
                            wrapperRef.current?.focus({ preventScroll: true });
                          }
                        }}
                        style={{ color: stampColors.textColor }}
                        className="w-full bg-transparent text-center font-bold tracking-wider text-xs focus:outline-none placeholder:opacity-60"
                      />
                      <input
                        type="text"
                        aria-label="Edit stamp subtext"
                        value={ann.stampSubtext ?? ''}
                        maxLength={64}
                        placeholder="Subtext (optional)"
                        onChange={(e) => onUpdateAnnotation(ann.id, { stampSubtext: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            onSetEditingStampId?.(null);
                            wrapperRef.current?.focus({ preventScroll: true });
                          }
                        }}
                        style={{ color: stampColors.textColor }}
                        className="w-full bg-transparent text-center text-[9px] font-medium opacity-90 focus:outline-none placeholder:opacity-50"
                      />
                    </div>
                  );
                }

                return (
                  <div
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (locked) {
                        onLockedLayerAttempt?.(layerObj.name);
                        return;
                      }
                      onSelectAnnotation(ann.id);
                      onSetEditingStampId?.(ann.id);
                    }}
                    title={locked ? undefined : 'Double-click to edit stamp text'}
                    style={{
                      borderColor: stampColors.borderColor,
                      backgroundColor: stampColors.backgroundColor,
                      color: stampColors.textColor,
                      opacity: ann.opacity,
                    }}
                    className="w-full h-full border-2 rounded px-2 flex flex-col items-center justify-center text-center select-none overflow-hidden"
                  >
                    <span
                      style={{ fontSize: `${Math.max(10, Math.round(12 * scale))}px` }}
                      className="font-bold tracking-wider leading-tight truncate max-w-full"
                    >
                      {ann.stampLabel || 'REVIEWED'}
                    </span>
                    {ann.stampSubtext && (
                      <span
                        style={{ fontSize: `${Math.max(8, Math.round(9 * scale))}px` }}
                        className="font-medium opacity-90 leading-tight truncate max-w-full"
                      >
                        {ann.stampSubtext}
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Floating Quick Controls for Selected Stamp (Color, Style, Edit, Save Template) */}
              {isSelected && ann.type === 'stamp' && !locked && (
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-0 top-full mt-1.5 z-30 flex items-center gap-1.5 px-2 py-1 rounded-md border border-[var(--border-strong)] bg-[var(--surface-elevated)] shadow-xl whitespace-nowrap"
                >
                  <button
                    type="button"
                    onClick={() =>
                      onSetEditingStampId?.(editingStampId === ann.id ? null : ann.id)
                    }
                    aria-label={editingStampId === ann.id ? 'Finish editing stamp' : 'Edit stamp text'}
                    title={editingStampId === ann.id ? 'Done editing' : 'Edit stamp text'}
                    className={`p-1 rounded transition-colors ${
                      editingStampId === ann.id
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-color)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                    }`}
                  >
                    {editingStampId === ann.id ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Pencil className="w-3 h-3" />
                    )}
                  </button>

                  <div className="h-3.5 w-px bg-[var(--border-hairline)]" />

                  <div className="flex items-center gap-1">
                    {STAMP_COLOR_PALETTE.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => onUpdateAnnotation(ann.id, { color: hex }, { recordUndo: true })}
                        aria-label={`Set stamp color ${hex}`}
                        className={`w-3.5 h-3.5 rounded-sm border transition-transform ${
                          ann.color.toLowerCase() === hex.toLowerCase()
                            ? 'ring-2 ring-[var(--accent-color)] ring-offset-1 ring-offset-[var(--surface-elevated)] scale-110'
                            : 'border-white/25 hover:scale-110'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                    <label
                      title="Pick custom color"
                      className="relative w-5 h-4 rounded-sm border border-[var(--border-strong)] cursor-pointer flex items-center justify-center bg-[var(--surface-chrome)] hover:bg-[var(--surface-subtle)]"
                    >
                      <Palette className="w-2.5 h-2.5 text-[var(--text-secondary)] pointer-events-none" />
                      <input
                        type="color"
                        aria-label="Custom color for selected stamp"
                        value={ann.color.startsWith('#') ? ann.color : '#2563eb'}
                        onChange={(e) =>
                          onUpdateAnnotation(ann.id, { color: e.target.value }, { recordUndo: true })
                        }
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                      />
                    </label>
                  </div>

                  <div className="h-3.5 w-px bg-[var(--border-hairline)]" />

                  <select
                    aria-label="Selected stamp style"
                    value={ann.stampStyle || 'outline'}
                    onChange={(e) =>
                      onUpdateAnnotation(
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

                  <button
                    type="button"
                    onClick={() => onSaveStampTemplate?.(ann)}
                    aria-label="Save stamp as template"
                    title="Save as reusable template"
                    className="px-1.5 py-0.5 rounded bg-[var(--surface-chrome)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] text-[10px] font-medium text-[var(--text-primary)] flex items-center gap-1"
                  >
                    <BookmarkPlus className="w-3 h-3 text-[var(--accent-color)]" />
                    <span>Save Template</span>
                  </button>
                </div>
              )}
              {(ann.type === 'image' || ann.type === 'signature') && ann.imageDataUrl && (
                <img
                  src={ann.imageDataUrl}
                  alt={ann.type === 'signature' ? 'Inserted signature' : 'Inserted image'}
                  className="w-full h-full object-contain pointer-events-none"
                />
              )}

              {/* Move grip & Resize corner for selected unlocked components */}
              {isSelected && !locked && (
                <button
                  type="button"
                  aria-label="Move component"
                  title="Drag to move"
                  onPointerDown={startMove}
                  className="absolute -top-5 left-0 h-4 px-1.5 rounded-t bg-blue-600 text-white flex items-center gap-1 text-[9px] font-medium shadow cursor-move"
                >
                  <Move className="w-2.5 h-2.5" />
                  <span>{ann.type === 'textbox' ? 'Text Box' : ann.type === 'checkbox' ? 'Check' : ann.type}</span>
                </button>
              )}
              {isResizable && (
                <button
                  type="button"
                  aria-label="Resize component"
                  title="Drag to resize"
                  onPointerDown={startResize}
                  className="absolute -bottom-1.5 -right-1.5 w-3 h-3 rounded-xs bg-blue-600 border border-white shadow cursor-nwse-resize"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
