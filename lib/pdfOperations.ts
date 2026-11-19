import { PDFDocument, StandardFonts, rgb, degrees, PDFName, type PDFFont } from 'pdf-lib';
import type { PdfAnnotation, PdfExportMode, PdfLayer } from '@/types/workspace';
import { getVisibleOrderedAnnotations } from './pdfLayers';

export interface PdfMetadataInfo {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  pageCount: number;
  isEncrypted: boolean;
  hasAcroForm: boolean;
  hasDigitalSignatures: boolean;
  signatureCount: number;
  sha256Hex: string;
}

export interface AcroFormFieldDescriptor {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'radio';
  value: string | boolean;
  options?: string[];
  required: boolean;
  pageIndex: number; // 0-indexed
  rectNorm: { x: number; y: number; width: number; height: number }; // top-left normalized 0..1
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16) / 255,
      g: parseInt(clean[1] + clean[1], 16) / 255,
      b: parseInt(clean[2] + clean[2], 16) / 255,
    };
  }
  if (clean.length === 6) {
    return {
      r: parseInt(clean.slice(0, 2), 16) / 255,
      g: parseInt(clean.slice(2, 4), 16) / 255,
      b: parseInt(clean.slice(4, 6), 16) / 255,
    };
  }
  return { r: 0.96, g: 0.78, b: 0.16 };
}

export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const hash = await crypto.subtle.digest('SHA-256', copy.buffer);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return 'unavailable';
}

export async function inspectPdfMetadata(bytes: Uint8Array): Promise<PdfMetadataInfo> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  let signatureCount = 0;
  for (const field of fields) {
    const ft = field.acroField.dict.get(PDFName.of('FT'));
    if (ft && ft.toString() === '/Sig') {
      signatureCount++;
    }
  }
  const sha256Hex = await computeSha256Hex(bytes);

  return {
    title: pdfDoc.getTitle() || '',
    author: pdfDoc.getAuthor() || '',
    subject: pdfDoc.getSubject() || '',
    keywords: pdfDoc.getKeywords() || '',
    creator: pdfDoc.getCreator() || '',
    producer: pdfDoc.getProducer() || '',
    pageCount: pdfDoc.getPageCount(),
    isEncrypted: pdfDoc.isEncrypted,
    hasAcroForm: fields.length > 0,
    hasDigitalSignatures: signatureCount > 0,
    signatureCount,
    sha256Hex,
  };
}

export async function updatePdfMetadata(
  bytes: Uint8Array,
  meta: { title: string; author: string; subject: string; keywords: string }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  pdfDoc.setTitle(meta.title);
  pdfDoc.setAuthor(meta.author);
  pdfDoc.setSubject(meta.subject);
  pdfDoc.setKeywords(meta.keywords.split(',').map((s) => s.trim()).filter(Boolean));
  pdfDoc.setModificationDate(new Date());
  return pdfDoc.save();
}

export async function extractAcroFormFields(bytes: Uint8Array): Promise<AcroFormFieldDescriptor[]> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  const result: AcroFormFieldDescriptor[] = [];

  for (const field of fields) {
    const widgets = field.acroField.getWidgets();
    if (!widgets.length) continue;
    const widget = widgets[0];
    const rect = widget.getRectangle();

    // Find matching page by widget P reference, Annots scan, or fallback to page 0
    let pageIndex = 0;
    const pRef = widget.P();
    if (pRef) {
      const idx = pages.findIndex((p) => p.ref === pRef);
      if (idx >= 0) pageIndex = idx;
    } else {
      const widgetDict = widget.dict;
      const foundIdx = pages.findIndex((p) => {
        const annots = p.node.Annots();
        if (!annots) return false;
        const size = annots.size();
        for (let k = 0; k < size; k++) {
          const item = annots.lookup(k);
          if (item === widgetDict) return true;
        }
        return false;
      });
      if (foundIdx >= 0) pageIndex = foundIdx;
    }

    const page = pages[pageIndex];
    const { width: pageW, height: pageH } = page.getSize();
    const x = Math.max(0, Math.min(1, rect.x / pageW));
    const y = Math.max(0, Math.min(1, 1 - (rect.y + rect.height) / pageH));
    const width = Math.max(0.02, Math.min(1 - x, rect.width / pageW));
    const height = Math.max(0.02, Math.min(1 - y, rect.height / pageH));

    const name = field.getName();
    const flags = field.acroField.getFlags();
    const required = (flags & 2) !== 0;
    const ctorName = field.constructor.name;

    if (ctorName === 'PDFTextField' || typeof (field as unknown as { getText?: () => string }).getText === 'function') {
      const tf = form.getTextField(name);
      result.push({
        name,
        type: 'text',
        value: tf.getText() || '',
        required,
        pageIndex,
        rectNorm: { x, y, width, height },
      });
    } else if (ctorName === 'PDFCheckBox' || typeof (field as unknown as { isChecked?: () => boolean }).isChecked === 'function') {
      const cb = form.getCheckBox(name);
      result.push({
        name,
        type: 'checkbox',
        value: cb.isChecked(),
        required,
        pageIndex,
        rectNorm: { x, y, width, height },
      });
    } else if (ctorName === 'PDFDropdown' || typeof (field as unknown as { getOptions?: () => string[] }).getOptions === 'function') {
      const dd = form.getDropdown(name);
      result.push({
        name,
        type: 'dropdown',
        value: dd.getSelected()[0] || '',
        options: dd.getOptions(),
        required,
        pageIndex,
        rectNorm: { x, y, width, height },
      });
    } else if (ctorName === 'PDFRadioGroup') {
      const rg = form.getRadioGroup(name);
      result.push({
        name,
        type: 'radio',
        value: rg.getSelected() || '',
        options: rg.getOptions(),
        required,
        pageIndex,
        rectNorm: { x, y, width, height },
      });
    }
  }

  return result;
}

function makeUniqueFieldName(raw: string | undefined, fallbackPrefix: string, used: Set<string>): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = cleaned || fallbackPrefix;
  let candidate = base;
  let counter = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${counter}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

function wrapTextLines(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const safeWidth = Math.max(20, maxWidth);
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (!para) {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, fontSize) <= safeWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

export async function saveAnnotationsAndFormsToPdf(
  bytes: Uint8Array,
  annotations: PdfAnnotation[],
  formValues: Record<string, string | boolean>,
  options: { flattenForms?: boolean; exportMode?: PdfExportMode; layers?: PdfLayer[] } = {}
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  const isSolid = options.exportMode === 'solid' || Boolean(options.flattenForms);
  const orderedAnnotations = getVisibleOrderedAnnotations(annotations, options.layers || []);
  const usedFieldNames = new Set<string>();

  // Apply existing AcroForm values
  const form = pdfDoc.getForm();
  try {
    for (const existing of form.getFields()) {
      usedFieldNames.add(existing.getName());
    }
    for (const [name, val] of Object.entries(formValues)) {
      try {
        const field = form.getField(name);
        const ctorName = field.constructor.name;
        if (ctorName === 'PDFTextField' && typeof val === 'string') {
          form.getTextField(name).setText(val);
        } else if (ctorName === 'PDFCheckBox' && typeof val === 'boolean') {
          const cb = form.getCheckBox(name);
          if (val) cb.check();
          else cb.uncheck();
        } else if (ctorName === 'PDFDropdown' && typeof val === 'string' && val) {
          form.getDropdown(name).select(val);
        } else if (ctorName === 'PDFRadioGroup' && typeof val === 'string' && val) {
          form.getRadioGroup(name).select(val);
        }
      } catch {
        // Ignore missing field
      }
    }
  } catch {
    // Document may not contain AcroForm yet
  }

  // Embed visual annotations & components respecting layer visibility + stack order
  for (const ann of orderedAnnotations) {
    const page = pages[ann.pageNumber - 1];
    if (!page) continue;
    const { width: pw, height: ph } = page.getSize();
    const c = hexToRgb(ann.color);
    const pdfColor = rgb(c.r, c.g, c.b);

    const ax = ann.x * pw;
    const aw = ann.width * pw;
    const ah = ann.height * ph;
    const ay = ph - ann.y * ph - ah; // PDF origin is bottom-left

    if (ann.type === 'textbox') {
      const boxW = Math.max(24, aw);
      const boxH = Math.max(18, ah);
      const fill = hexToRgb(ann.fillColor || '#ffffff');
      const fillRgb = rgb(fill.r, fill.g, fill.b);
      const fontSize = Math.max(8, Math.min(24, ann.fontSize || 12));

      if (!isSolid) {
        const fieldName = makeUniqueFieldName(
          ann.fieldName,
          `textbox_p${ann.pageNumber}`,
          usedFieldNames
        );
        const tf = form.createTextField(fieldName);
        if (boxH > 28 || (ann.text || '').includes('\n')) {
          tf.enableMultiline();
        }
        tf.setText(ann.text || '');
        tf.addToPage(page, {
          x: ax,
          y: ay,
          width: boxW,
          height: boxH,
          textColor: rgb(0.08, 0.1, 0.14),
          backgroundColor: fillRgb,
          borderColor: pdfColor,
          borderWidth: Math.max(1, ann.strokeWidth || 1),
        });
        try {
          tf.setFontSize(fontSize);
        } catch {
          // ignore if custom appearance not supported
        }
      } else {
        page.drawRectangle({
          x: ax,
          y: ay,
          width: boxW,
          height: boxH,
          color: fillRgb,
          borderColor: pdfColor,
          borderWidth: Math.max(1, ann.strokeWidth || 1),
          opacity: ann.opacity,
        });
        const textValue = ann.text || '';
        if (textValue) {
          const lines = wrapTextLines(textValue, font, fontSize, boxW - 10);
          const lineHeight = fontSize * 1.25;
          let cursorY = ay + boxH - fontSize - 5;
          for (const line of lines) {
            if (cursorY < ay + 3) break;
            page.drawText(line, {
              x: ax + 5,
              y: cursorY,
              size: fontSize,
              font,
              color: rgb(0.08, 0.1, 0.14),
              opacity: ann.opacity,
            });
            cursorY -= lineHeight;
          }
        }
      }
    } else if (ann.type === 'checkbox') {
      const boxW = Math.max(12, aw);
      const boxH = Math.max(12, ah);
      const fill = hexToRgb(ann.fillColor || '#ffffff');
      const fillRgb = rgb(fill.r, fill.g, fill.b);

      if (!isSolid) {
        const fieldName = makeUniqueFieldName(
          ann.fieldName,
          `checkbox_p${ann.pageNumber}`,
          usedFieldNames
        );
        const cb = form.createCheckBox(fieldName);
        cb.addToPage(page, {
          x: ax,
          y: ay,
          width: boxW,
          height: boxH,
          textColor: pdfColor,
          backgroundColor: fillRgb,
          borderColor: pdfColor,
          borderWidth: Math.max(1, ann.strokeWidth || 1.5),
        });
        if (ann.checked) cb.check();
        else cb.uncheck();
      } else {
        page.drawRectangle({
          x: ax,
          y: ay,
          width: boxW,
          height: boxH,
          color: fillRgb,
          borderColor: pdfColor,
          borderWidth: Math.max(1, ann.strokeWidth || 1.5),
          opacity: ann.opacity,
        });
        if (ann.checked) {
          const stroke = Math.max(1.8, Math.min(boxW, boxH) * 0.14);
          page.drawLine({
            start: { x: ax + boxW * 0.22, y: ay + boxH * 0.5 },
            end: { x: ax + boxW * 0.42, y: ay + boxH * 0.26 },
            thickness: stroke,
            color: pdfColor,
            opacity: ann.opacity,
          });
          page.drawLine({
            start: { x: ax + boxW * 0.42, y: ay + boxH * 0.26 },
            end: { x: ax + boxW * 0.78, y: ay + boxH * 0.74 },
            thickness: stroke,
            color: pdfColor,
            opacity: ann.opacity,
          });
        }
      }
    } else if (ann.type === 'highlight') {
      page.drawRectangle({
        x: ax,
        y: ay,
        width: aw,
        height: ah,
        color: pdfColor,
        opacity: Math.min(0.45, ann.opacity),
      });
    } else if (ann.type === 'underline') {
      page.drawLine({
        start: { x: ax, y: ay + 2 },
        end: { x: ax + aw, y: ay + 2 },
        thickness: Math.max(1.5, ann.strokeWidth),
        color: pdfColor,
        opacity: ann.opacity,
      });
    } else if (ann.type === 'strikethrough') {
      page.drawLine({
        start: { x: ax, y: ay + ah / 2 },
        end: { x: ax + aw, y: ay + ah / 2 },
        thickness: Math.max(1.5, ann.strokeWidth),
        color: pdfColor,
        opacity: ann.opacity,
      });
    } else if (ann.type === 'rect') {
      page.drawRectangle({
        x: ax,
        y: ay,
        width: aw,
        height: ah,
        borderColor: pdfColor,
        borderWidth: ann.strokeWidth,
        opacity: ann.opacity,
      });
    } else if (ann.type === 'circle') {
      page.drawEllipse({
        x: ax + aw / 2,
        y: ay + ah / 2,
        xScale: aw / 2,
        yScale: ah / 2,
        borderColor: pdfColor,
        borderWidth: ann.strokeWidth,
        opacity: ann.opacity,
      });
    } else if (ann.type === 'line' || ann.type === 'arrow') {
      const startX = ax;
      const startY = ph - ann.y * ph;
      const endX = ax + aw;
      const endY = ph - (ann.y + ann.height) * ph;
      page.drawLine({
        start: { x: startX, y: startY },
        end: { x: endX, y: endY },
        thickness: ann.strokeWidth,
        color: pdfColor,
        opacity: ann.opacity,
      });
    } else if (ann.type === 'freehand' && ann.points && ann.points.length > 1) {
      for (let i = 1; i < ann.points.length; i++) {
        const p0 = ann.points[i - 1];
        const p1 = ann.points[i];
        page.drawLine({
          start: { x: p0.x * pw, y: ph - p0.y * ph },
          end: { x: p1.x * pw, y: ph - p1.y * ph },
          thickness: ann.strokeWidth,
          color: pdfColor,
          opacity: ann.opacity,
        });
      }
    } else if (ann.type === 'text' && ann.text) {
      page.drawText(ann.text, {
        x: ax + 4,
        y: ay + ah - (ann.fontSize || 13),
        size: ann.fontSize || 13,
        font,
        color: pdfColor,
        opacity: ann.opacity,
      });
    } else if (ann.type === 'note') {
      page.drawRectangle({
        x: ax,
        y: ay,
        width: Math.max(18, aw),
        height: Math.max(18, ah),
        color: pdfColor,
        borderColor: rgb(0.2, 0.2, 0.2),
        borderWidth: 1,
        opacity: 0.9,
      });
      if (ann.comment) {
        page.drawText(ann.comment.slice(0, 64), {
          x: ax + 22,
          y: ay + 5,
          size: 8,
          font,
          color: rgb(0.15, 0.15, 0.15),
        });
      }
    } else if (ann.type === 'stamp') {
      const label = ann.stampLabel || 'REVIEWED';
      const subtext = ann.stampSubtext?.trim() || '';
      const style = ann.stampStyle || 'outline';
      const parsedHex = hexToRgb(ann.color || '#2563eb');
      const r = parsedHex.r;
      const g = parsedHex.g;
      const b = parsedHex.b;
      if (style === 'solid') {
        page.drawRectangle({
          x: ax,
          y: ay,
          width: aw,
          height: ah,
          color: pdfColor,
          borderColor: pdfColor,
          borderWidth: 1.5,
          opacity: ann.opacity ?? 0.94,
        });
      } else if (style === 'badge') {
        page.drawRectangle({
          x: ax,
          y: ay,
          width: aw,
          height: ah,
          color: rgb(r + (1 - r) * 0.86, g + (1 - g) * 0.86, b + (1 - b) * 0.86),
          borderColor: pdfColor,
          borderWidth: 1.5,
          opacity: ann.opacity ?? 0.94,
        });
      } else {
        page.drawRectangle({
          x: ax,
          y: ay,
          width: aw,
          height: ah,
          color: rgb(1, 1, 1),
          borderColor: pdfColor,
          borderWidth: 2,
          opacity: ann.opacity ?? 0.92,
        });
      }
      const textColor = style === 'solid' ? rgb(1, 1, 1) : pdfColor;
      let labelSize = Math.min(13, Math.max(8, ah * (subtext ? 0.34 : 0.42)));
      while (labelSize > 7 && boldFont.widthOfTextAtSize(label, labelSize) > aw - 12) {
        labelSize -= 0.5;
      }
      const labelWidth = boldFont.widthOfTextAtSize(label, labelSize);
      const labelX = ax + Math.max(6, (aw - labelWidth) / 2);
      const labelY = subtext
        ? ay + ah * 0.54
        : ay + Math.max(4, (ah - labelSize) / 2 + 1);
      page.drawText(label, {
        x: labelX,
        y: labelY,
        size: labelSize,
        font: boldFont,
        color: textColor,
      });
      if (subtext) {
        let subSize = Math.min(9, Math.max(6.5, ah * 0.22));
        while (subSize > 6 && font.widthOfTextAtSize(subtext, subSize) > aw - 12) {
          subSize -= 0.5;
        }
        const subWidth = font.widthOfTextAtSize(subtext, subSize);
        page.drawText(subtext, {
          x: ax + Math.max(6, (aw - subWidth) / 2),
          y: ay + Math.max(4, ah * 0.2),
          size: subSize,
          font,
          color: textColor,
        });
      }
    } else if ((ann.type === 'image' || ann.type === 'signature') && ann.imageDataUrl) {
      try {
        const base64 = ann.imageDataUrl.split(',')[1];
        if (base64) {
          const binStr = atob(base64);
          const imgBytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) imgBytes[i] = binStr.charCodeAt(i);
          const embedded = ann.imageDataUrl.includes('image/jpeg')
            ? await pdfDoc.embedJpg(imgBytes)
            : await pdfDoc.embedPng(imgBytes);
          page.drawImage(embedded, {
            x: ax,
            y: ay,
            width: aw,
            height: ah,
            opacity: ann.opacity,
          });
        }
      } catch {
        // Skip invalid image data
      }
    }
  }

  if (isSolid) {
    try {
      if (form.getFields().length > 0) {
        form.flatten();
      }
    } catch {
      // ignore if no AcroForm
    }
  }

  return pdfDoc.save();
}

export async function mergePdfBytes(pdfList: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const bytes of pdfList) {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const indices = doc.getPageIndices();
    const copied = await merged.copyPages(doc, indices);
    for (const page of copied) {
      merged.addPage(page);
    }
  }
  return merged.save();
}

export async function extractPdfPages(bytes: Uint8Array, oneBasedPages: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const dest = await PDFDocument.create();
  const validIndices = oneBasedPages
    .map((p) => p - 1)
    .filter((idx) => idx >= 0 && idx < src.getPageCount());
  const copied = await dest.copyPages(src, validIndices);
  for (const page of copied) dest.addPage(page);
  return dest.save();
}

export async function applyPageOrganization(
  bytes: Uint8Array,
  plan: Array<{ sourceIndex: number; rotationDelta: number } | { blank: true; width?: number; height?: number }>
): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const dest = await PDFDocument.create();

  for (const item of plan) {
    if ('blank' in item) {
      dest.addPage([item.width || 612, item.height || 792]);
    } else {
      const [copied] = await dest.copyPages(src, [item.sourceIndex]);
      if (item.rotationDelta !== 0) {
        const current = copied.getRotation().angle;
        copied.setRotation(degrees((current + item.rotationDelta + 360) % 360));
      }
      dest.addPage(copied);
    }
  }

  return dest.save();
}

export async function cropPdfPages(
  bytes: Uint8Array,
  marginsPt: { top: number; right: number; bottom: number; left: number },
  targetPages?: number[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  pages.forEach((page, idx) => {
    if (targetPages && !targetPages.includes(idx + 1)) return;
    const { width, height } = page.getSize();
    const newW = Math.max(72, width - marginsPt.left - marginsPt.right);
    const newH = Math.max(72, height - marginsPt.top - marginsPt.bottom);
    page.setCropBox(marginsPt.left, marginsPt.bottom, newW, newH);
  });
  return doc.save();
}

export async function addWatermarkAndHeaders(
  bytes: Uint8Array,
  opts: {
    watermarkText?: string;
    watermarkOpacity?: number;
    headerText?: string;
    footerText?: string;
    includePageNumbers?: boolean;
  }
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();
  const total = pages.length;

  pages.forEach((page, idx) => {
    const { width, height } = page.getSize();
    if (opts.watermarkText && opts.watermarkText.trim()) {
      page.drawText(opts.watermarkText.trim(), {
        x: width * 0.22,
        y: height * 0.44,
        size: 46,
        font: boldFont,
        color: rgb(0.55, 0.58, 0.65),
        opacity: opts.watermarkOpacity ?? 0.22,
        rotate: degrees(35),
      });
    }
    if (opts.headerText && opts.headerText.trim()) {
      page.drawText(opts.headerText.trim(), {
        x: 42,
        y: height - 28,
        size: 9,
        font,
        color: rgb(0.4, 0.44, 0.5),
      });
    }
    const footerParts: string[] = [];
    if (opts.footerText && opts.footerText.trim()) footerParts.push(opts.footerText.trim());
    if (opts.includePageNumbers) footerParts.push(`Page ${idx + 1} of ${total}`);
    if (footerParts.length > 0) {
      page.drawText(footerParts.join('   ·   '), {
        x: 42,
        y: 22,
        size: 9,
        font,
        color: rgb(0.4, 0.44, 0.5),
      });
    }
  });

  return doc.save();
}

export async function optimizePdfBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.save({ useObjectStreams: true, addDefaultPage: false });
}
