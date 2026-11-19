export type TabType = 'home' | 'browser' | 'markdown' | 'pdf' | 'spreadsheet' | 'batch' | 'settings';

export type ThemeMode = 'light' | 'dark' | 'system';

export type AccentColor = 'blue' | 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose';

export type SearchEngine = 'duckduckgo' | 'google' | 'bing' | 'custom';

export type MarkdownViewMode = 'live' | 'source' | 'read';

export type PdfLayoutMode = 'continuous' | 'single' | 'two-page';

export type PdfTool =
  | 'select'
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'freehand'
  | 'eraser'
  | 'text'
  | 'textbox'
  | 'checkbox'
  | 'note'
  | 'rect'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'stamp';

export type PdfExportMode = 'editable' | 'solid';

export type StampStyle = 'outline' | 'solid' | 'badge';

export interface PdfLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  order: number;
}

export type SidebarSection =
  | 'bookmarks'
  | 'history'
  | 'downloads'
  | 'files'
  | 'outline'
  | 'thumbnails'
  | 'layers'
  | 'annotations'
  | 'search';

export interface TabItem {
  id: string;
  type: TabType;
  title: string;
  url?: string;
  fileId?: string;
  isLoading?: boolean;
  isDirty?: boolean;
  privateMode?: boolean;
  browserHistory: string[];
  browserHistoryIndex: number;
  zoom: number;
  error?: string | null;
  lifecycleState?: 'active' | 'inactive' | 'suspended';
  lastActiveAt?: number;
}

export interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  folder: string;
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  title: string;
  url: string;
  visitedAt: number;
}

export interface DownloadItem {
  id: string;
  filename: string;
  url: string;
  sizeBytes: number;
  progress: number;
  status: 'downloading' | 'completed' | 'cancelled' | 'error';
  createdAt: number;
  mimeType?: string;
}

export type WorkspaceFileKind =
  | 'markdown'
  | 'pdf'
  | 'html'
  | 'code'
  | 'text'
  | 'spreadsheet'
  | 'asset';

export interface WorkspaceFileMeta {
  id: string;
  name: string;
  kind: WorkspaceFileKind;
  sizeBytes: number;
  updatedAt: number;
  folder?: string;
  mimeType?: string;
  hasNativeHandle?: boolean;
}

export interface PdfPoint {
  x: number; // normalized 0..1 relative to page width
  y: number; // normalized 0..1 relative to page height
}

export interface PdfAnnotation {
  id: string;
  pageNumber: number; // 1-indexed
  layerId?: string;
  type:
    | 'highlight'
    | 'underline'
    | 'strikethrough'
    | 'freehand'
    | 'text'
    | 'textbox'
    | 'checkbox'
    | 'note'
    | 'rect'
    | 'circle'
    | 'line'
    | 'arrow'
    | 'stamp'
    | 'image'
    | 'signature';
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  width: number; // normalized 0..1
  height: number; // normalized 0..1
  points?: PdfPoint[]; // for freehand
  color: string;
  fillColor?: string;
  opacity: number;
  strokeWidth: number;
  fontSize?: number;
  text?: string;
  placeholder?: string;
  fieldName?: string;
  checked?: boolean;
  comment?: string;
  stampLabel?: string;
  stampSubtext?: string;
  stampStyle?: StampStyle;
  imageDataUrl?: string;
  author: string;
  createdAt: number;
}

export interface SavedStampTemplate {
  id: string;
  label: string;
  subtext?: string;
  color: string;
  style: StampStyle;
  createdAt: number;
}

export interface SavedSignature {
  id: string;
  label: string;
  dataUrl: string;
  createdAt: number;
}

export interface AppSettings {
  theme: ThemeMode;
  accentColor: AccentColor;
  density: 'compact' | 'comfortable';
  restoreSession: boolean;
  homeUrl: string;
  searchEngine: SearchEngine;
  customSearchUrl: string;
  markdownDefaultMode: MarkdownViewMode;
  markdownFontSize: number;
  markdownLineHeight: number;
  markdownWordWrap: boolean;
  pdfDefaultZoom: number;
  pdfDefaultLayout: PdfLayoutMode;
  pdfDefaultExportFormat: 'png' | 'jpeg';
  pdfDefaultExportDpi: number;
  autoSuspendTabs: boolean;
  autoSuspendMinutes: number;
  developerDiagnostics: boolean;
}
