import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  mergePdfBytes,
  extractPdfPages,
  applyPageOrganization,
  cropPdfPages,
  addWatermarkAndHeaders,
  updatePdfMetadata,
  inspectPdfMetadata,
  saveAnnotationsAndFormsToPdf,
  extractAcroFormFields,
} from './pdfOperations';

async function makeTestPdf(pageCount: number, withForm = false): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const p = doc.addPage([612, 792]);
    p.drawText(`Page ${i + 1}`, { x: 50, y: 700 });
  }
  if (withForm) {
    const form = doc.getForm();
    const tf = form.createTextField('applicant_name');
    tf.setText('Ada Lovelace');
    tf.addToPage(doc.getPages()[0], { x: 50, y: 600, width: 200, height: 24 });
  }
  return doc.save();
}

test('mergePdfBytes and extractPdfPages preserve page counts accurately', async () => {
  const p1 = await makeTestPdf(2);
  const p2 = await makeTestPdf(3);
  const merged = await mergePdfBytes([p1, p2]);
  const mergedMeta = await inspectPdfMetadata(merged);
  assert.equal(mergedMeta.pageCount, 5);

  const extracted = await extractPdfPages(merged, [2, 4, 5]);
  const extractedMeta = await inspectPdfMetadata(extracted);
  assert.equal(extractedMeta.pageCount, 3);
});

test('applyPageOrganization supports reordering, blank pages, and rotation', async () => {
  const src = await makeTestPdf(2);
  const organized = await applyPageOrganization(src, [
    { sourceIndex: 1, rotationDelta: 90 },
    { blank: true, width: 612, height: 792 },
    { sourceIndex: 0, rotationDelta: 0 },
  ]);
  const loaded = await PDFDocument.load(organized);
  assert.equal(loaded.getPageCount(), 3);
  assert.equal(loaded.getPages()[0].getRotation().angle, 90);
});

test('updatePdfMetadata, cropPdfPages, and addWatermarkAndHeaders produce valid PDFs', async () => {
  const src = await makeTestPdf(2);
  const cropped = await cropPdfPages(src, { top: 20, right: 20, bottom: 20, left: 20 });
  const stamped = await addWatermarkAndHeaders(cropped, {
    watermarkText: 'DRAFT',
    headerText: 'Folio Studio',
    includePageNumbers: true,
  });
  const updated = await updatePdfMetadata(stamped, {
    title: 'Test Title',
    author: 'Tester',
    subject: 'Unit Test',
    keywords: 'pdf, test',
  });
  const meta = await inspectPdfMetadata(updated);
  assert.equal(meta.title, 'Test Title');
  assert.equal(meta.author, 'Tester');
  assert.equal(meta.pageCount, 2);
});

test('AcroForm fields extract, update, and flatten cleanly', async () => {
  const src = await makeTestPdf(1, true);
  const fields = await extractAcroFormFields(src);
  assert.equal(fields.length, 1);
  assert.equal(fields[0].name, 'applicant_name');
  assert.equal(fields[0].value, 'Ada Lovelace');

  const updated = await saveAnnotationsAndFormsToPdf(
    src,
    [
      {
        id: 'a1',
        pageNumber: 1,
        type: 'highlight',
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.04,
        color: '#facc15',
        opacity: 0.4,
        strokeWidth: 2,
        author: 'Tester',
        createdAt: Date.now(),
      },
    ],
    { applicant_name: 'Grace Hopper' },
    { flattenForms: false }
  );
  const reloadedFields = await extractAcroFormFields(updated);
  assert.equal(reloadedFields[0].value, 'Grace Hopper');
});

test('textbox and checkbox components export as editable AcroForm fields or solid flattened graphics', async () => {
  const src = await makeTestPdf(2, true);
  const layers = [
    { id: 'visible-layer', name: 'Visible Inputs', visible: true, locked: false, order: 0 },
    { id: 'hidden-layer', name: 'Hidden Drafts', visible: false, locked: false, order: 1 },
  ];
  const components = [
    {
      id: 'tb1',
      pageNumber: 2,
      layerId: 'visible-layer',
      type: 'textbox' as const,
      x: 0.1,
      y: 0.2,
      width: 0.35,
      height: 0.08,
      color: '#2563eb',
      fillColor: '#ffffff',
      opacity: 1,
      strokeWidth: 1.5,
      fontSize: 12,
      fieldName: 'reviewer_notes',
      text: 'Approved for release',
      author: 'Tester',
      createdAt: Date.now(),
    },
    {
      id: 'cb1',
      pageNumber: 2,
      layerId: 'visible-layer',
      type: 'checkbox' as const,
      x: 0.1,
      y: 0.35,
      width: 0.04,
      height: 0.03,
      color: '#2563eb',
      fillColor: '#ffffff',
      opacity: 1,
      strokeWidth: 1.5,
      fieldName: 'qa_verified',
      checked: true,
      author: 'Tester',
      createdAt: Date.now(),
    },
    {
      id: 'tb-hidden',
      pageNumber: 1,
      layerId: 'hidden-layer',
      type: 'textbox' as const,
      x: 0.5,
      y: 0.5,
      width: 0.25,
      height: 0.06,
      color: '#111827',
      opacity: 1,
      strokeWidth: 1,
      fieldName: 'hidden_secret',
      text: 'Should not export',
      author: 'Tester',
      createdAt: Date.now(),
    },
  ];

  // Editable mode: exports visible components as real AcroForm fields and omits hidden layer
  const editableBytes = await saveAnnotationsAndFormsToPdf(
    src,
    components,
    { applicant_name: 'Editable User' },
    { exportMode: 'editable', layers }
  );
  const editableFields = await extractAcroFormFields(editableBytes);
  assert.equal(editableFields.length, 3);
  const tbField = editableFields.find((f) => f.name === 'reviewer_notes');
  const cbField = editableFields.find((f) => f.name === 'qa_verified');
  assert.ok(tbField);
  assert.equal(tbField.type, 'text');
  assert.equal(tbField.value, 'Approved for release');
  assert.equal(tbField.pageIndex, 1);
  assert.ok(cbField);
  assert.equal(cbField.type, 'checkbox');
  assert.equal(cbField.value, true);
  assert.equal(editableFields.some((f) => f.name === 'hidden_secret'), false);

  // Solid mode: bakes everything solidly and flattens all form fields
  const solidBytes = await saveAnnotationsAndFormsToPdf(
    src,
    components,
    { applicant_name: 'Solid User' },
    { exportMode: 'solid', layers }
  );
  const solidFields = await extractAcroFormFields(solidBytes);
  assert.equal(solidFields.length, 0);
});

