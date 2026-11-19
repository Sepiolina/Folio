import type { BookmarkItem, PdfAnnotation, WorkspaceFileMeta } from '@/types/workspace';
import { savePdfAnnotations, saveWorkspaceFile, listWorkspaceFiles } from './storage';
import { normalizeGridRows, serializeWorkbook } from './spreadsheetUtils';

export const SAMPLE_MARKDOWN_ID = 'sample-md-architecture';
export const SAMPLE_MARKDOWN_NOTES_ID = 'sample-md-notes';
export const SAMPLE_HTML_ID = 'sample-html-demo';
export const SAMPLE_PDF_MICROBES_ID = 'sample-pdf-microbes';
export const SAMPLE_PDF_FORM_ID = 'sample-pdf-form';
export const SAMPLE_SPREADSHEET_ID = 'sample-xlsx-inventory';

const SAMPLE_ARCHITECTURE_MD = `# Folio Workspace — Architecture & Shortcuts

Welcome to **Folio**, a minimalist unified workspace combining a lightweight web browser, an Obsidian-inspired Markdown studio, and a professional PDF workspace.

## Core Pillars

| Module | Primary Engine | Key Capabilities |
| :--- | :--- | :--- |
| **Browser** | Server Proxy + Sandboxed Frame | URL & search resolution, history, bookmarks, reader zoom |
| **Markdown** | CodeMirror 6 + Live Preview | Live Preview, Source & Reading modes, interactive tables, outline jump, local autosave |
| **PDF Studio** | Mozilla PDF.js + pdf-lib | Canvas rendering, text selection, annotations, AcroForms, DPI image export |

## Formatting & GFM Showcase

You can use standard GitHub Flavored Markdown alongside ==highlighted phrases==, [clickable links](https://example.com), task lists, and fenced code blocks:

- [x] Unified multi-type tab strip with session restore
- [x] Real PDF-to-image export (PNG / JPEG up to 600 DPI in ZIP or folder)
- [ ] Review \`Quarterly_Field_Report_Form.pdf\` and attach visual signature

> Minimalist interface. Powerful functionality. Local-first document workflows.

\`\`\`typescript
// Example: High-DPI page export calculation
export function pixelsForDpi(points: number, dpi: number): number {
  return Math.round((points / 72) * dpi);
}
\`\`\`

## Keyboard Shortcuts

- \`Ctrl/Cmd + T\` — Open a new tab
- \`Ctrl/Cmd + W\` — Close current tab
- \`Ctrl/Cmd + Shift + T\` — Reopen recently closed tab
- \`Ctrl/Cmd + L\` — Focus the address/search bar
- \`Ctrl/Cmd + S\` — Save current Markdown or PDF document
`;

const SAMPLE_RESEARCH_MD = `# Endospore Biology & Staining Notes

Quick reading notes companion to \`World_of_Microbes.pdf\`.

## Key Takeaways

1. **Endospores** are dormant, highly resistant structures formed by select Gram-positive bacteria such as *Bacillus* and *Clostridium*.
2. **Spore coat** layers protect genetic material against heat, desiccation, and chemical disinfectants.
3. Because unstained cells appear nearly colorless under brightfield microscopy, differential staining (such as **Schaeffer–Fulton** malachite green) is required for clear observation.

## Lab Checklist

- [x] Prepare heat-fixed smear on clean glass slide
- [x] Apply malachite green over gentle steam for 5 minutes
- [ ] Rinse and counterstain with safranin
`;

const SAMPLE_LOCAL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Local HTML Sandbox Preview</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #141417;
      color: #f3f4f6;
      margin: 0;
      padding: 48px 32px;
      line-height: 1.6;
    }
    .wrap { max-width: 720px; margin: 0 auto; }
    h1 { font-size: 28px; margin-bottom: 12px; letter-spacing: -0.02em; }
    p { color: #a1a1aa; }
    .box {
      margin-top: 24px;
      padding: 20px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.1);
      background: #1f1f24;
    }
    button {
      margin-top: 12px;
      padding: 8px 14px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.15);
      background: #3b82f6;
      color: #fff;
      font-weight: 500;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Local HTML Document Preview</h1>
    <p>Rendered safely inside a sandboxed frame without access to privileged workspace storage.</p>
    <div class="box">
      <strong>Interactive Local Script Test</strong>
      <p id="status">Clicks recorded: 0</p>
      <button onclick="window.__c=(window.__c||0)+1;document.getElementById('status').textContent='Clicks recorded: '+window.__c;">
        Increment Counter
      </button>
    </div>
  </div>
</body>
</html>`;

async function generateMicrobesSamplePdf(): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle('World of Microbes — Chapter 1');
  doc.setAuthor('Dr. Kristin Watson');
  doc.setSubject('Endospores, Staining, and Microbial Cell Structure');
  doc.setKeywords(['microbiology', 'endospores', 'staining', 'bacteria']);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const pageSpecs = [
    {
      chapter: 'Chapter 1',
      section: 'BACTERIA',
      heading: 'Endospores',
      paragraphs: [
        'Endospores are dormant, tough, non-reproductive constructs produced by a select group of Gram-positive bacteria such as Bacillus and Clostridium. Their multi-layered spore coat protects DNA from UV radiation, desiccation, and extreme heat.',
        'In 1995, microbiologist Raul Cano isolated viable bacterial endospores preserved in fossilized amber dating back 25 to 40 million years. Later studies by Vreeland and Rosenzweig recovered halotolerant bacteria from 250-million-year-old salt crystals.',
        'Staining and Observation of Bacteria: Due to their microscopic size and low refractive index, vegetative cells and endospores appear nearly colorless under standard optical microscopes and require differential staining.',
      ],
      diagramTitle: 'Vegetative Cell & Free Endospore Cross-Section',
    },
    {
      chapter: 'Chapter 1',
      section: 'MORPHOLOGY',
      heading: 'Spore Coat & Cortex Architecture',
      paragraphs: [
        'The bacterial cortex consists of modified peptidoglycan that maintains core dehydration, a decisive factor in thermal resistance. Dipicolinic acid complexed with calcium ions stabilizes chromosomal DNA inside the core.',
        'During sporulation, asymmetric cell division partitions a smaller forespore engulfed by the mother cell. Subsequent maturation deposits keratin-like coat proteins prior to mother cell lysis.',
      ],
      diagramTitle: 'Sporulation Cycle Stages',
    },
    {
      chapter: 'Chapter 2',
      section: 'STAINING',
      heading: 'Schaeffer–Fulton Differential Protocol',
      paragraphs: [
        'Primary stain malachite green is forced into the resistant spore wall using gentle heat. Once cooled, water washes the dye out of vegetative cells while endospores retain the emerald pigment.',
        'Safranin serves as a counterstain, coloring vegetative cytoplasm pink-red so endospores stand out distinctly under 1000x oil-immersion microscopy.',
      ],
      diagramTitle: 'Brightfield Contrast Comparison',
    },
    {
      chapter: 'Chapter 2',
      section: 'GERMINATION',
      heading: 'Activation, Germination & Outgrowth',
      paragraphs: [
        'When environmental nutrients such as L-alanine or glucose return, specialized germinant receptors in the inner membrane trigger rapid release of Ca-DPA and rehydration of the core.',
        'Within minutes, cortex-lytic enzymes degrade the protective peptidoglycan shell and metabolic synthesis resumes, restoring an actively dividing vegetative bacterium.',
      ],
      diagramTitle: 'Rehydration Kinetics Curve',
    },
    {
      chapter: 'Chapter 3',
      section: 'STERILIZATION',
      heading: 'Thermal Resistance & Autoclave Validation',
      paragraphs: [
        'Because bacterial endospores represent the benchmark of biological resistance, Geobacillus stearothermophilus spore strips are used worldwide to validate pressurized steam sterilization at 121 degrees Celsius.',
        'D-value measurements quantify the exposure time required at a given temperature to reduce viable spore populations by ninety percent.',
      ],
      diagramTitle: 'Log Reduction Benchmark',
    },
    {
      chapter: 'Chapter 3',
      section: 'REVIEW',
      heading: 'Summary & Laboratory Review Notes',
      paragraphs: [
        'Key diagnostic markers include endospore position (central, subterminal, or terminal), swelling of the sporangium, and differential response to malachite green counterstaining.',
        'Complete all safety sign-offs and attach reviewer stamps prior to archiving laboratory protocols.',
      ],
      diagramTitle: 'Diagnostic Classification Key',
    },
  ];

  pageSpecs.forEach((spec, index) => {
    const page = doc.addPage([612, 792]);
    const { width, height } = page.getSize();

    // Header bar
    page.drawText(spec.chapter, { x: 54, y: height - 56, size: 10, font, color: rgb(0.42, 0.45, 0.5) });
    page.drawText(spec.section, { x: width - 120, y: height - 56, size: 10, font, color: rgb(0.42, 0.45, 0.5) });
    page.drawLine({
      start: { x: 54, y: height - 66 },
      end: { x: width - 54, y: height - 66 },
      thickness: 0.75,
      color: rgb(0.84, 0.86, 0.89),
    });

    // Heading
    page.drawText(spec.heading, {
      x: 54,
      y: height - 108,
      size: 20,
      font: bold,
      color: rgb(0.1, 0.12, 0.16),
    });

    // Wrapped paragraphs
    let cursorY = height - 144;
    for (const para of spec.paragraphs) {
      const words = para.split(' ');
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (test.length > 74) {
          page.drawText(line, { x: 54, y: cursorY, size: 11, font, color: rgb(0.18, 0.2, 0.24) });
          cursorY -= 17;
          line = word;
        } else {
          line = test;
        }
      }
      if (line) {
        page.drawText(line, { x: 54, y: cursorY, size: 11, font, color: rgb(0.18, 0.2, 0.24) });
        cursorY -= 26;
      }
    }

    // Crisp vector diagram card on page
    const boxY = 175;
    const boxH = 195;
    page.drawRectangle({
      x: 54,
      y: boxY,
      width: width - 108,
      height: boxH,
      borderColor: rgb(0.82, 0.84, 0.88),
      borderWidth: 1,
      color: rgb(0.97, 0.98, 0.99),
    });
    page.drawText(`Figure ${index + 1}.1 — ${spec.diagramTitle}`, {
      x: 72,
      y: boxY + boxH - 26,
      size: 10.5,
      font: italic,
      color: rgb(0.32, 0.36, 0.42),
    });

    // Concentric vector cell / spore diagram
    const cx = 195;
    const cy = boxY + 86;
    page.drawEllipse({
      x: cx,
      y: cy,
      xScale: 68,
      yScale: 36,
      color: rgb(0.93, 0.84, 0.7),
      borderColor: rgb(0.45, 0.32, 0.2),
      borderWidth: 1.5,
    });
    page.drawEllipse({
      x: cx + 18,
      y: cy,
      xScale: 28,
      yScale: 20,
      color: rgb(0.68, 0.26, 0.56),
      borderColor: rgb(0.35, 0.12, 0.3),
      borderWidth: 1.5,
    });
    page.drawEllipse({
      x: cx + 18,
      y: cy,
      xScale: 14,
      yScale: 10,
      color: rgb(0.96, 0.94, 0.98),
    });
    page.drawText('Vegetative Envelope', { x: 300, y: cy + 20, size: 9.5, font, color: rgb(0.25, 0.28, 0.34) });
    page.drawText('Spore Coat & Cortex', { x: 300, y: cy, size: 9.5, font, color: rgb(0.52, 0.18, 0.44) });
    page.drawText('Dehydrated DNA Core', { x: 300, y: cy - 20, size: 9.5, font, color: rgb(0.25, 0.28, 0.34) });

    // Footer
    page.drawText(`World of Microbes  ·  Page ${index + 1} of ${pageSpecs.length}`, {
      x: 54,
      y: 40,
      size: 9,
      font,
      color: rgb(0.5, 0.54, 0.6),
    });
  });

  return doc.save();
}

async function generateAcroFormSamplePdf(): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle('Quarterly Field Inspection Form');
  doc.setAuthor('Folio Document Studio');
  doc.setSubject('Interactive AcroForm Sample');

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();

  page.drawText('Quarterly Field Inspection & Sign-Off', {
    x: 54,
    y: 726,
    size: 19,
    font: bold,
    color: rgb(0.1, 0.12, 0.16),
  });
  page.drawText('Fill the interactive fields below, sign, and save or flatten your exported PDF.', {
    x: 54,
    y: 704,
    size: 10.5,
    font,
    color: rgb(0.4, 0.44, 0.5),
  });

  page.drawText('Inspector Full Name *', { x: 54, y: 658, size: 10, font: bold, color: rgb(0.2, 0.22, 0.26) });
  const nameField = form.createTextField('inspector_name');
  nameField.setText('Kristin Watson');
  nameField.addToPage(page, { x: 54, y: 626, width: 240, height: 24 });

  page.drawText('Department / Lab', { x: 320, y: 658, size: 10, font: bold, color: rgb(0.2, 0.22, 0.26) });
  const deptField = form.createDropdown('department');
  deptField.addOptions(['Microbiology Lab', 'Clinical QA', 'Environmental Field', 'Materials Research']);
  deptField.select('Microbiology Lab');
  deptField.addToPage(page, { x: 320, y: 626, width: 230, height: 24 });

  page.drawText('Inspection Date', { x: 54, y: 586, size: 10, font: bold, color: rgb(0.2, 0.22, 0.26) });
  const dateField = form.createTextField('inspection_date');
  dateField.setText('2026-11-15');
  dateField.addToPage(page, { x: 54, y: 554, width: 240, height: 24 });

  page.drawText('Compliance Checklist', { x: 54, y: 510, size: 11, font: bold, color: rgb(0.15, 0.18, 0.22) });
  const check1 = form.createCheckBox('autoclave_verified');
  check1.check();
  check1.addToPage(page, { x: 54, y: 482, width: 16, height: 16 });
  page.drawText('Autoclave thermal calibration verified (121 C)', { x: 78, y: 486, size: 10.5, font });

  const check2 = form.createCheckBox('samples_archived');
  check2.addToPage(page, { x: 54, y: 454, width: 16, height: 16 });
  page.drawText('Biological indicator samples archived with batch ID', { x: 78, y: 458, size: 10.5, font });

  page.drawText('Summary Observations', { x: 54, y: 414, size: 10, font: bold, color: rgb(0.2, 0.22, 0.26) });
  const notesField = form.createTextField('observations');
  notesField.enableMultiline();
  notesField.setText('All spore strip controls passed incubation without anomalous growth.');
  notesField.addToPage(page, { x: 54, y: 316, width: 496, height: 88 });

  return doc.save();
}

export const DEFAULT_BOOKMARKS: BookmarkItem[] = [
  {
    id: 'bm-mdn',
    title: 'MDN Web Docs',
    url: 'https://developer.mozilla.org/en-US/',
    folder: 'Reference',
    createdAt: 1700000000000,
  },
  {
    id: 'bm-wiki',
    title: 'Wikipedia — Markdown',
    url: 'https://en.wikipedia.org/wiki/Markdown',
    folder: 'Reference',
    createdAt: 1700000001000,
  },
  {
    id: 'bm-example',
    title: 'Example Domain',
    url: 'https://example.com',
    folder: 'Quick Links',
    createdAt: 1700000002000,
  },
];

let initPromise: Promise<WorkspaceFileMeta[]> | null = null;

export async function ensureSampleWorkspaceSeeded(): Promise<WorkspaceFileMeta[]> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const existing = await listWorkspaceFiles();
    const existingIds = new Set(existing.map((f) => f.id));

    if (!existingIds.has(SAMPLE_MARKDOWN_ID)) {
      await saveWorkspaceFile({
        id: SAMPLE_MARKDOWN_ID,
        meta: {
          id: SAMPLE_MARKDOWN_ID,
          name: 'Architecture & Shortcuts.md',
          kind: 'markdown',
          sizeBytes: SAMPLE_ARCHITECTURE_MD.length,
          updatedAt: Date.now() - 1000 * 60 * 5,
          folder: 'Notes',
        },
        textContent: SAMPLE_ARCHITECTURE_MD,
      });
    }

    if (!existingIds.has(SAMPLE_MARKDOWN_NOTES_ID)) {
      await saveWorkspaceFile({
        id: SAMPLE_MARKDOWN_NOTES_ID,
        meta: {
          id: SAMPLE_MARKDOWN_NOTES_ID,
          name: 'Endospore Research Notes.md',
          kind: 'markdown',
          sizeBytes: SAMPLE_RESEARCH_MD.length,
          updatedAt: Date.now() - 1000 * 60 * 12,
          folder: 'Notes',
        },
        textContent: SAMPLE_RESEARCH_MD,
      });
    }

    if (!existingIds.has(SAMPLE_HTML_ID)) {
      await saveWorkspaceFile({
        id: SAMPLE_HTML_ID,
        meta: {
          id: SAMPLE_HTML_ID,
          name: 'Local_Preview_Demo.html',
          kind: 'html',
          sizeBytes: SAMPLE_LOCAL_HTML.length,
          updatedAt: Date.now() - 1000 * 60 * 20,
          folder: 'Local Web',
        },
        textContent: SAMPLE_LOCAL_HTML,
      });
    }

    if (!existingIds.has(SAMPLE_PDF_MICROBES_ID)) {
      const pdfBytes = await generateMicrobesSamplePdf();
      await saveWorkspaceFile({
        id: SAMPLE_PDF_MICROBES_ID,
        meta: {
          id: SAMPLE_PDF_MICROBES_ID,
          name: 'World_of_Microbes.pdf',
          kind: 'pdf',
          sizeBytes: pdfBytes.byteLength,
          updatedAt: Date.now() - 1000 * 60 * 2,
          folder: 'Documents',
        },
        binaryContent: pdfBytes,
      });

      const seedAnnotations: PdfAnnotation[] = [
        {
          id: 'ann-seed-1',
          pageNumber: 1,
          type: 'highlight',
          x: 0.088,
          y: 0.168,
          width: 0.62,
          height: 0.022,
          color: '#facc15',
          opacity: 0.42,
          strokeWidth: 2,
          comment: 'Highlight key definition of dormant bacterial endospores.',
          author: 'Kristin Watson',
          createdAt: Date.now() - 3600_000,
        },
        {
          id: 'ann-seed-2',
          pageNumber: 1,
          type: 'note',
          x: 0.84,
          y: 0.265,
          width: 0.038,
          height: 0.03,
          color: '#a78bfa',
          opacity: 0.95,
          strokeWidth: 1.5,
          comment: 'Verify citation years for Cano (1995) and Vreeland (2000) before final review.',
          author: 'Kristin Watson',
          createdAt: Date.now() - 1800_000,
        },
        {
          id: 'ann-seed-3',
          pageNumber: 1,
          type: 'stamp',
          x: 0.65,
          y: 0.545,
          width: 0.2,
          height: 0.05,
          color: '#3b82f6',
          opacity: 0.9,
          strokeWidth: 2,
          stampLabel: 'REVIEWED',
          comment: 'Reviewed section 1 diagram accuracy.',
          author: 'Kristin Watson',
          createdAt: Date.now() - 900_000,
        },
      ];
      await savePdfAnnotations(SAMPLE_PDF_MICROBES_ID, seedAnnotations);
    }

    if (!existingIds.has(SAMPLE_PDF_FORM_ID)) {
      const formBytes = await generateAcroFormSamplePdf();
      await saveWorkspaceFile({
        id: SAMPLE_PDF_FORM_ID,
        meta: {
          id: SAMPLE_PDF_FORM_ID,
          name: 'Quarterly_Field_Report_Form.pdf',
          kind: 'pdf',
          sizeBytes: formBytes.byteLength,
          updatedAt: Date.now() - 1000 * 60 * 30,
          folder: 'Forms',
        },
        binaryContent: formBytes,
      });
    }

    if (!existingIds.has(SAMPLE_SPREADSHEET_ID)) {
      const inventoryRows = normalizeGridRows([
        ['Item', 'Category', 'Units', 'Unit Cost', 'Total'],
        ['Malachite Green Stain (500 mL)', 'Reagents', '14', '28.5', '=C2*D2'],
        ['Safranin Counterstain (500 mL)', 'Reagents', '18', '22', '=C3*D3'],
        ['Autoclave Spore Strips (100 pk)', 'Validation', '9', '64', '=C4*D4'],
        ['Borosilicate Slides (72 pk)', 'Glassware', '32', '12.5', '=C5*D5'],
        ['Total Inventory Value', '', '=SUM(C2:C5)', '', '=SUM(E2:E5)'],
      ]);
      const thresholdsRows = normalizeGridRows([
        ['Item', 'Min Stock', 'Current Units', 'Reorder Status'],
        ['Malachite Green Stain (500 mL)', '10', '14', 'Healthy'],
        ['Safranin Counterstain (500 mL)', '12', '18', 'Healthy'],
        ['Autoclave Spore Strips (100 pk)', '10', '9', 'Reorder Soon'],
        ['Borosilicate Slides (72 pk)', '20', '32', 'Healthy'],
      ]);
      const xlsxPayload = serializeWorkbook(
        {
          sheets: [
            { name: 'Inventory', rows: inventoryRows },
            { name: 'Thresholds', rows: thresholdsRows },
          ],
          activeSheetIndex: 0,
          sourceFormat: 'xlsx',
        },
        'xlsx'
      );
      await saveWorkspaceFile({
        id: SAMPLE_SPREADSHEET_ID,
        meta: {
          id: SAMPLE_SPREADSHEET_ID,
          name: 'Lab_Inventory_2026.xlsx',
          kind: 'spreadsheet',
          sizeBytes: xlsxPayload.bytes.byteLength,
          updatedAt: Date.now() - 1000 * 60 * 8,
          folder: 'Spreadsheets',
        },
        binaryContent: xlsxPayload.bytes,
      });
    }

    return listWorkspaceFiles();
  })();

  return initPromise;
}
