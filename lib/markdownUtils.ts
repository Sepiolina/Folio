import type { WorkspaceFileKind } from '../types/workspace';

export interface MarkdownHeading {
  id: string;
  level: number;
  text: string;
  line: number;
}

export interface MarkdownStats {
  words: number;
  chars: number;
  lines: number;
  readingTimeMinutes: number;
}

/**
 * Extracts document outline headings from Markdown while ignoring fenced code blocks.
 */
export function extractMarkdownOutline(markdown: string): MarkdownHeading[] {
  const lines = markdown.split(/\r?\n/);
  const headings: MarkdownHeading[] = [];
  const slugCounts = new Map<string, number>();
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/[*_`~]/g, '').trim();
      const baseSlug = text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-') || 'section';
      const count = slugCounts.get(baseSlug) ?? 0;
      slugCounts.set(baseSlug, count + 1);
      const id = count === 0 ? baseSlug : `${baseSlug}-${count}`;

      headings.push({
        id,
        level,
        text,
        line: i + 1,
      });
    }
  }

  return headings;
}

export function countWordsAndChars(markdown: string): MarkdownStats {
  const trimmed = markdown.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const chars = markdown.length;
  const lines = markdown ? markdown.split(/\r?\n/).length : 1;
  const readingTimeMinutes = Math.max(1, Math.ceil(words / 220));
  return { words, chars, lines, readingTimeMinutes };
}

export function detectFileTypeFromName(filename: string): WorkspaceFileKind {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.avif') ||
    lower.endsWith('.bmp') ||
    lower.endsWith('.ico')
  ) {
    return 'asset';
  }
  if (
    lower.endsWith('.csv') ||
    lower.endsWith('.tsv') ||
    lower.endsWith('.xls') ||
    lower.endsWith('.xlsx')
  ) {
    return 'spreadsheet';
  }
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (
    lower.endsWith('.css') ||
    lower.endsWith('.js') ||
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.json')
  ) {
    return 'code';
  }
  return 'text';
}

interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: { hName?: string };
}

/**
 * Safely converts `<mark>...</mark>` inline HTML tag pairs and Obsidian `==...==`
 * syntax in MDAST into structured `<mark>` highlight elements without enabling raw HTML.
 */
export function remarkMarkHighlight() {
  const splitEqualsMarks = (text: string): MdastNode[] | null => {
    const regex = /==([^=\n]+?)==/g;
    let match: RegExpExecArray | null;
    let lastIdx = 0;
    const parts: MdastNode[] = [];
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        parts.push({ type: 'text', value: text.slice(lastIdx, match.index) });
      }
      parts.push({
        type: 'markHighlight',
        data: { hName: 'mark' },
        children: [{ type: 'text', value: match[1] }],
      });
      lastIdx = match.index + match[0].length;
    }
    if (parts.length === 0) return null;
    if (lastIdx < text.length) {
      parts.push({ type: 'text', value: text.slice(lastIdx) });
    }
    return parts;
  };

  return (tree: MdastNode) => {
    const walk = (node: MdastNode) => {
      if (node.type === 'code' || node.type === 'inlineCode') return;
      if (!Array.isArray(node.children)) return;
      const out: MdastNode[] = [];
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === 'html' && child.value?.trim().toLowerCase() === '<mark>') {
          const closeIdx = node.children.findIndex(
            (c, idx) => idx > i && c.type === 'html' && c.value?.trim().toLowerCase() === '</mark>'
          );
          if (closeIdx > i) {
            const inner = node.children.slice(i + 1, closeIdx);
            inner.forEach(walk);
            out.push({
              type: 'markHighlight',
              data: { hName: 'mark' },
              children: inner,
            });
            i = closeIdx;
            continue;
          }
        }
        if (child.type === 'text' && typeof child.value === 'string' && child.value.includes('==')) {
          const splitNodes = splitEqualsMarks(child.value);
          if (splitNodes) {
            out.push(...splitNodes);
            continue;
          }
        }
        walk(child);
        out.push(child);
      }
      node.children = out;
    };
    walk(tree);
  };
}
