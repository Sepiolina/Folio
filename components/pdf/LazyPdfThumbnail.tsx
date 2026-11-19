'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { resourceManager } from '@/lib/resourceManager';

interface LazyPdfThumbnailProps {
  pdfDoc: PDFDocumentProxy;
  docKey: string;
  pageNumber: number;
  rotationDelta: number;
  isActive: boolean;
  onSelectPage: (page: number) => void;
}

export const LazyPdfThumbnail = React.memo(function LazyPdfThumbnail({
  pdfDoc,
  docKey,
  pageNumber,
  rotationDelta,
  isActive,
  onSelectPage,
}: LazyPdfThumbnailProps) {
  const cacheKey = `${docKey}:p${pageNumber}:r${rotationDelta}`;
  const btnRef = useRef<HTMLButtonElement>(null);
  const [isNearSidebarViewport, setIsNearSidebarViewport] = useState(pageNumber <= 6);
  const [src, setSrc] = useState<string | null>(() => resourceManager.thumbnailCache.get(cacheKey) ?? null);

  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsNearSidebarViewport(true);
        }
      },
      { rootMargin: '160px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isNearSidebarViewport) return;
    const cached = resourceManager.thumbnailCache.get(cacheKey);
    if (cached) {
      const id = setTimeout(() => setSrc(cached), 0);
      return () => clearTimeout(id);
    }

    let cancelled = false;
    let tempCanvas: HTMLCanvasElement | null = null;

    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) {
          page.cleanup();
          return;
        }
        const totalRotation = (page.rotate + rotationDelta) % 360;
        const tvp = page.getViewport({ scale: 0.16, rotation: totalRotation });
        tempCanvas = document.createElement('canvas');
        tempCanvas.width = Math.max(1, Math.round(tvp.width));
        tempCanvas.height = Math.max(1, Math.round(tvp.height));
        const ctx = tempCanvas.getContext('2d', { alpha: false });
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
          await page.render({ canvasContext: ctx, viewport: tvp, canvas: tempCanvas }).promise;
          if (!cancelled) {
            const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.65);
            resourceManager.thumbnailCache.set(cacheKey, dataUrl);
            setSrc(dataUrl);
          }
        }
        page.cleanup();
      } catch {
        // Ignore cancellation or disposed document
      } finally {
        if (tempCanvas) {
          tempCanvas.width = 0;
          tempCanvas.height = 0;
          tempCanvas = null;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber, rotationDelta, cacheKey, isNearSidebarViewport]);

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={() => onSelectPage(pageNumber)}
      className="w-full flex flex-col items-center gap-1.5 group"
    >
      <div
        className={`w-full max-w-[160px] p-1 rounded border transition-colors bg-white ${
          isActive
            ? 'border-[var(--accent-color)] ring-2 ring-[var(--accent-color)]/40'
            : 'border-[var(--border-hairline)] group-hover:border-[var(--border-strong)]'
        }`}
      >
        {src ? (
          <img src={src} alt={`Page ${pageNumber}`} className="w-full h-auto block" />
        ) : (
          <div className="w-full aspect-[612/792] bg-slate-100 flex items-center justify-center text-[10px] text-slate-400">
            p.{pageNumber}
          </div>
        )}
      </div>
      <span
        className={`text-[11px] tabular-nums ${
          isActive ? 'text-[var(--accent-color)] font-semibold' : 'text-[var(--text-muted)]'
        }`}
      >
        {pageNumber}
      </span>
    </button>
  );
});
