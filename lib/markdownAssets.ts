import type { WorkspaceFileKind } from '../types/workspace';

export interface WorkspaceFileLike {
  id: string;
  name: string;
  kind: WorkspaceFileKind;
  mimeType?: string;
}

export interface RelatedBundleEntry<T extends WorkspaceFileLike = WorkspaceFileLike> {
  file: T;
  zipPath: string;
  isRoot: boolean;
  depth: number;
}

export interface RelatedBundleResult<T extends WorkspaceFileLike = WorkspaceFileLike> {
  entries: Array<RelatedBundleEntry<T>>;
  missingRefs: string[];
}

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'avif',
  'bmp',
  'ico',
]);

const EXTERNAL_SCHEME_RE = /^(?:https?:|data:|blob:|mailto:|tel:|javascript:|about:)/i;

export function inferMimeTypeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'avif':
      return 'image/avif';
    case 'bmp':
      return 'image/bmp';
    case 'ico':
      return 'image/x-icon';
    case 'md':
    case 'markdown':
      return 'text/markdown';
    case 'pdf':
      return 'application/pdf';
    case 'csv':
      return 'text/csv';
    case 'tsv':
      return 'text/tab-separated-values';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'html':
    case 'htm':
      return 'text/html';
    case 'json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

export function isImageFilename(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTENSIONS.has(ext);
}

export function sanitizeAssetFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop()?.trim() || 'image.png';
  const dotIdx = base.lastIndexOf('.');
  const rawStem = dotIdx > 0 ? base.slice(0, dotIdx) : base;
  const rawExt = dotIdx > 0 ? base.slice(dotIdx + 1) : 'png';

  const cleanStem =
    rawStem
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '') || 'image';
  const cleanExt = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  return `${cleanStem}.${cleanExt}`;
}

export function buildUniqueAssetPath(rawFilename: string, existingNames: string[]): string {
  const clean = sanitizeAssetFilename(rawFilename);
  const dotIdx = clean.lastIndexOf('.');
  const stem = dotIdx > 0 ? clean.slice(0, dotIdx) : clean;
  const ext = dotIdx > 0 ? clean.slice(dotIdx) : '';

  const taken = new Set(existingNames.map((n) => normalizeWorkspacePath(n).toLowerCase()));
  let candidate = `assets/${stem}${ext}`;
  let counter = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `assets/${stem}-${counter}${ext}`;
    counter += 1;
  }
  return candidate;
}

export function isWorkspaceAssetRef(rawUrl: string | undefined | null): boolean {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('#')) return false;
  if (EXTERNAL_SCHEME_RE.test(trimmed)) return false;
  return true;
}

export function normalizeWorkspacePath(rawRef: string): string {
  let cleaned = rawRef.trim();
  if (!cleaned) return '';

  // Strip surrounding angle brackets <...>
  if (cleaned.startsWith('<') && cleaned.endsWith('>')) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Strip optional markdown title ("title" or 'title') when no angle brackets were used
  if (!rawRef.trim().startsWith('<')) {
    const titleMatch = cleaned.match(/^(\S+)\s+(?:"[^"]*"|'[^']*'|\([^)]*\))$/);
    if (titleMatch) {
      cleaned = titleMatch[1];
    }
  }

  // Strip local:// prefix if present
  if (/^local:\/\//i.test(cleaned)) {
    cleaned = cleaned.slice('local://'.length);
  }

  // Drop query and hash fragments for local files
  const hashIdx = cleaned.indexOf('#');
  if (hashIdx >= 0) cleaned = cleaned.slice(0, hashIdx);
  const queryIdx = cleaned.indexOf('?');
  if (queryIdx >= 0) cleaned = cleaned.slice(0, queryIdx);

  cleaned = cleaned.trim().replace(/\\/g, '/');

  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // Keep raw if percent-encoding is malformed
  }

  // Strip leading ./ or /
  while (cleaned.startsWith('./')) {
    cleaned = cleaned.slice(2);
  }
  cleaned = cleaned.replace(/^\/+/, '');
  return cleaned;
}

export function sanitizeZipEntryPath(rawPath: string, fallbackName = 'document.md'): string {
  const normalized = normalizeWorkspacePath(rawPath)
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/');
  return normalized || fallbackName;
}

function stripMarkdownCodeRegions(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const kept: string[] = [];
  let activeFenceChar: '`' | '~' | null = null;
  let activeFenceLen = 0;

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const ch = marker[0] as '`' | '~';
      if (!activeFenceChar) {
        activeFenceChar = ch;
        activeFenceLen = marker.length;
        continue;
      } else if (activeFenceChar === ch && marker.length >= activeFenceLen) {
        activeFenceChar = null;
        activeFenceLen = 0;
        continue;
      }
    }
    if (activeFenceChar) continue;
    // Strip inline code spans (`...`) on non-fenced lines
    kept.push(line.replace(/`+[^`\n]*`+/g, ' '));
  }

  return kept.join('\n');
}

function parseLinkTargetToken(rawInsideParens: string): string {
  const trimmed = rawInsideParens.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('<')) {
    const endIdx = trimmed.indexOf('>');
    if (endIdx > 1) {
      return trimmed.slice(1, endIdx).trim();
    }
  }
  // Take up to first unescaped whitespace (before optional title)
  const match = trimmed.match(/^((?:\\.|[^\s])+)/);
  return match ? match[1].replace(/\\([() ])/g, '$1') : trimmed;
}

/**
 * Extracts all local or external image & link references from a Markdown document,
 * ignoring fenced code blocks and inline code spans.
 */
export function extractMarkdownReferences(markdown: string): string[] {
  const stripped = stripMarkdownCodeRegions(markdown);
  const refs: string[] = [];
  const seen = new Set<string>();

  const pushRef = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#') || EXTERNAL_SCHEME_RE.test(trimmed)) return;
    const normalized = normalizeWorkspacePath(trimmed);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    refs.push(normalized);
  };

  // 1. Standard inline images and links: ![alt](target) or [label](target)
  const inlineRe = /!?\[(?:[^\]\\]|\\.)*\]\(((?:[^()\\]|\\.|(?:\([^()]*\)))+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = inlineRe.exec(stripped)) !== null) {
    const token = parseLinkTargetToken(m[1]);
    if (token) pushRef(token);
  }

  // 2. Reference-style definitions: [id]: target "title" or [id]: <target>
  const refDefRe = /^[ \t]{0,3}\[[^\]]+\]:[ \t]*(?:<([^>\n]+)>|(\S+))/gm;
  while ((m = refDefRe.exec(stripped)) !== null) {
    pushRef(m[1] || m[2] || '');
  }

  // 3. Obsidian / Wiki links & embeds: ![[path|alias]] or [[path#heading|alias]]
  const wikiRe = /!?\[\[([^\]|\n]+?)(?:\|[^\]\n]*)?\]\]/g;
  while ((m = wikiRe.exec(stripped)) !== null) {
    pushRef(m[1]);
  }

  // 4. HTML <img src="..."> and <a href="...">
  const htmlAttrRe = /<(?:img|a|source|video|audio)\b[^>]*?\b(?:src|href)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  while ((m = htmlAttrRe.exec(stripped)) !== null) {
    pushRef(m[1] || m[2] || '');
  }

  return refs;
}

export function extractHtmlReferences(html: string): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();
  const attrRe = /\b(?:src|href)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(html)) !== null) {
    const raw = (m[1] || m[2] || '').trim();
    if (!raw || raw.startsWith('#') || EXTERNAL_SCHEME_RE.test(raw)) continue;
    const norm = normalizeWorkspacePath(raw);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      refs.push(norm);
    }
  }
  return refs;
}

export function matchWorkspaceFileByReference<T extends WorkspaceFileLike>(
  ref: string,
  files: T[]
): T | null {
  if (!isWorkspaceAssetRef(ref) && !/^local:\/\//i.test(ref.trim())) {
    return null;
  }
  const normalized = normalizeWorkspacePath(ref);
  if (!normalized) return null;

  const lowerNorm = normalized.toLowerCase();
  const baseName = normalized.split('/').pop() || normalized;
  const lowerBase = baseName.toLowerCase();

  // 1. Exact path match (case-sensitive then case-insensitive)
  const exact = files.find((f) => normalizeWorkspacePath(f.name) === normalized);
  if (exact) return exact;

  const exactInsensitive = files.find(
    (f) => normalizeWorkspacePath(f.name).toLowerCase() === lowerNorm
  );
  if (exactInsensitive) return exactInsensitive;

  // 2. Wiki-link without .md extension (e.g. [[Endospore Research Notes]])
  if (!baseName.includes('.')) {
    const mdExact = files.find((f) => {
      const fn = normalizeWorkspacePath(f.name).toLowerCase();
      return fn === `${lowerNorm}.md` || fn === `${lowerNorm}.markdown`;
    });
    if (mdExact) return mdExact;
  }

  // 3. Basename match (preferring assets when path mentions assets/ or is an image)
  const preferAsset = lowerNorm.startsWith('assets/') || isImageFilename(lowerNorm);
  const candidates = files.filter((f) => {
    const fNorm = normalizeWorkspacePath(f.name).toLowerCase();
    const fBase = fNorm.split('/').pop() || fNorm;
    if (fBase === lowerBase) return true;
    if (!baseName.includes('.') && (fBase === `${lowerBase}.md` || fBase === `${lowerBase}.markdown`)) {
      return true;
    }
    return false;
  });

  if (candidates.length === 0) return null;
  if (preferAsset) {
    const assetMatch = candidates.find((c) => c.kind === 'asset');
    if (assetMatch) return assetMatch;
  }
  return candidates[0];
}

function makeUniqueZipPath(desiredPath: string, usedPaths: Set<string>): string {
  const clean = sanitizeZipEntryPath(desiredPath);
  if (!usedPaths.has(clean.toLowerCase())) {
    usedPaths.add(clean.toLowerCase());
    return clean;
  }
  const slashIdx = clean.lastIndexOf('/');
  const dir = slashIdx >= 0 ? clean.slice(0, slashIdx + 1) : '';
  const filename = slashIdx >= 0 ? clean.slice(slashIdx + 1) : clean;
  const dotIdx = filename.lastIndexOf('.');
  const stem = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
  const ext = dotIdx > 0 ? filename.slice(dotIdx) : '';

  let counter = 2;
  let candidate = `${dir}${stem}-${counter}${ext}`;
  while (usedPaths.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${dir}${stem}-${counter}${ext}`;
  }
  usedPaths.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Traces all reachable assets and linked workspace documents starting from a root Markdown file.
 * Unrelated workspace files/assets are excluded, and link cycles are safely deduplicated.
 */
export function collectRelatedWorkspaceFiles<T extends WorkspaceFileLike>(options: {
  rootFileId: string;
  rootFilename: string;
  rootContent: string;
  files: T[];
  getTextContent: (file: T) => string | undefined;
}): RelatedBundleResult<T> {
  const { rootFileId, rootFilename, rootContent, files, getTextContent } = options;

  const existingRoot = files.find((f) => f.id === rootFileId);
  const rootFile: T =
    existingRoot ??
    ({
      id: rootFileId,
      name: rootFilename,
      kind: 'markdown',
    } as T);

  const visitedIds = new Set<string>([rootFileId]);
  const usedZipPaths = new Set<string>();
  const missingRefs: string[] = [];
  const seenMissing = new Set<string>();

  const rootZipPath = makeUniqueZipPath(rootFilename, usedZipPaths);
  const entries: Array<RelatedBundleEntry<T>> = [
    { file: rootFile, zipPath: rootZipPath, isRoot: true, depth: 0 },
  ];

  const queue: Array<{ file: T; content: string; depth: number }> = [
    { file: rootFile, content: rootContent, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const refs =
      current.file.kind === 'html'
        ? extractHtmlReferences(current.content)
        : extractMarkdownReferences(current.content);

    for (const ref of refs) {
      const matched = matchWorkspaceFileByReference(ref, files);
      if (!matched) {
        if (!seenMissing.has(ref)) {
          seenMissing.add(ref);
          missingRefs.push(ref);
        }
        continue;
      }

      if (visitedIds.has(matched.id)) {
        continue;
      }
      visitedIds.add(matched.id);

      const zipPath = makeUniqueZipPath(matched.name, usedZipPaths);
      const nextDepth = current.depth + 1;
      entries.push({ file: matched, zipPath, isRoot: false, depth: nextDepth });

      if (matched.kind === 'markdown' || matched.kind === 'html' || matched.kind === 'text') {
        const linkedText = getTextContent(matched);
        if (typeof linkedText === 'string' && linkedText.length > 0) {
          queue.push({ file: matched, content: linkedText, depth: nextDepth });
        }
      }
    }
  }

  return { entries, missingRefs };
}
