'use client';

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type {
  AppSettings,
  BookmarkItem,
  DownloadItem,
  HistoryEntry,
  SavedSignature,
  SavedStampTemplate,
  SidebarSection,
  TabItem,
  TabType,
  WorkspaceFileMeta,
} from '@/types/workspace';
import { DEFAULT_BOOKMARKS } from '@/lib/sampleData';
import { DEFAULT_STAMP_TEMPLATES } from '@/lib/stampTemplates';
import { resolveAddressInput, urlMatchesHost } from '@/lib/urlUtils';
import { findTabsDueForSuspension } from '@/lib/tabLifecycle';
import { resourceManager } from '@/lib/resourceManager';

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  accentColor: 'blue',
  density: 'compact',
  restoreSession: true,
  homeUrl: '',
  searchEngine: 'duckduckgo',
  customSearchUrl: 'https://duckduckgo.com/?q={query}',
  markdownDefaultMode: 'live',
  markdownFontSize: 15,
  markdownLineHeight: 1.65,
  markdownWordWrap: true,
  pdfDefaultZoom: 1.15,
  pdfDefaultLayout: 'continuous',
  pdfDefaultExportFormat: 'png',
  pdfDefaultExportDpi: 300,
  autoSuspendTabs: true,
  autoSuspendMinutes: 15,
  developerDiagnostics: false,
};

const INITIAL_TAB_ID = 'tab-home-1';

interface WorkspaceState {
  tabs: TabItem[];
  activeTabId: string;
  closedTabs: TabItem[];
  sidebarOpen: boolean;
  sidebarSection: SidebarSection;
  settings: AppSettings;
  bookmarks: BookmarkItem[];
  history: HistoryEntry[];
  downloads: DownloadItem[];
  workspaceFiles: WorkspaceFileMeta[];
  recentFileIds: string[];
  savedSignatures: SavedSignature[];
  savedStamps: SavedStampTemplate[];

  // Tab actions
  openNewTab: (type?: TabType, opts?: Partial<TabItem>) => string;
  openFileInTab: (file: WorkspaceFileMeta, forceType?: TabType) => string;
  closeTab: (tabId: string) => void;
  reopenClosedTab: () => void;
  setActiveTab: (tabId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  updateTab: (tabId: string, patch: Partial<TabItem>) => void;
  suspendTab: (tabId: string) => void;
  restoreTab: (tabId: string) => void;
  suspendEligibleTabs: () => number;
  navigateBrowserTab: (tabId: string, rawInput: string) => void;
  goBackTab: (tabId: string) => void;
  goForwardTab: (tabId: string) => void;

  // Sidebar
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarSection: (section: SidebarSection) => void;

  // Bookmarks & History & Downloads
  toggleBookmarkForUrl: (url: string, title: string, folder?: string) => void;
  addBookmark: (bookmark: Omit<BookmarkItem, 'id' | 'createdAt'>) => void;
  updateBookmark: (id: string, patch: Partial<BookmarkItem>) => void;
  removeBookmark: (id: string) => void;
  recordHistory: (url: string, title: string) => void;
  clearHistory: () => void;
  clearSiteDataForHost: (host: string) => number;
  addDownload: (item: Omit<DownloadItem, 'id' | 'createdAt'>) => string;
  updateDownload: (id: string, patch: Partial<DownloadItem>) => void;
  clearDownloads: () => void;

  // Files & Signatures
  setWorkspaceFiles: (files: WorkspaceFileMeta[]) => void;
  upsertWorkspaceFile: (file: WorkspaceFileMeta) => void;
  removeWorkspaceFileMeta: (fileId: string) => void;
  addSavedSignature: (label: string, dataUrl: string) => void;
  removeSavedSignature: (id: string) => void;
  addSavedStamp: (tpl: Omit<SavedStampTemplate, 'id' | 'createdAt'>) => SavedStampTemplate;
  updateSavedStamp: (id: string, patch: Partial<SavedStampTemplate>) => void;
  removeSavedStamp: (id: string) => void;
  resetSavedStamps: () => void;

  // Settings
  updateSettings: (patch: Partial<AppSettings>) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [
        {
          id: INITIAL_TAB_ID,
          type: 'home',
          title: 'New Tab',
          browserHistory: [],
          browserHistoryIndex: -1,
          zoom: 1,
        },
      ],
      activeTabId: INITIAL_TAB_ID,
      closedTabs: [],
      sidebarOpen: false,
      sidebarSection: 'files',
      settings: DEFAULT_SETTINGS,
      bookmarks: DEFAULT_BOOKMARKS,
      history: [],
      downloads: [],
      workspaceFiles: [],
      recentFileIds: [],
      savedSignatures: [],
      savedStamps: DEFAULT_STAMP_TEMPLATES,

      openNewTab: (type = 'home', opts = {}) => {
        const id = uid('tab');
        const now = Date.now();
        const newTab: TabItem = {
          id,
          type,
          title:
            opts.title ||
            (type === 'home'
              ? 'New Tab'
              : type === 'batch'
                ? 'PDF Batch Tools'
                : type === 'spreadsheet'
                  ? 'Spreadsheet'
                  : type === 'settings'
                    ? 'Settings'
                    : 'Untitled'),
          browserHistory: opts.url ? [opts.url] : [],
          browserHistoryIndex: opts.url ? 0 : -1,
          zoom: type === 'pdf' ? get().settings.pdfDefaultZoom : 1,
          lifecycleState: 'active',
          lastActiveAt: now,
          ...opts,
        };
        set((state) => ({
          tabs: [
            ...state.tabs.map((t) =>
              t.lifecycleState === 'suspended'
                ? t
                : { ...t, lifecycleState: 'inactive' as const }
            ),
            newTab,
          ],
          activeTabId: id,
        }));
        return id;
      },

      openFileInTab: (file, forceType) => {
        const existing = get().tabs.find((t) => t.fileId === file.id);
        if (existing) {
          get().setActiveTab(existing.id);
          return existing.id;
        }
        const tabType: TabType =
          forceType ||
          (file.kind === 'pdf'
            ? 'pdf'
            : file.kind === 'html' || file.kind === 'asset'
              ? 'browser'
              : file.kind === 'spreadsheet'
                ? 'spreadsheet'
                : 'markdown');

        const id = get().openNewTab(tabType, {
          title: file.name,
          fileId: file.id,
          url: file.kind === 'html' || file.kind === 'asset' ? `local://${file.name}` : undefined,
        });

        set((state) => ({
          recentFileIds: [file.id, ...state.recentFileIds.filter((fid) => fid !== file.id)].slice(0, 15),
        }));
        return id;
      },

      closeTab: (tabId) => {
        void resourceManager.cleanupScope(tabId);
        set((state) => {
          const idx = state.tabs.findIndex((t) => t.id === tabId);
          if (idx === -1) return state;
          const closing = state.tabs[idx];
          const remaining = state.tabs.filter((t) => t.id !== tabId);

          if (remaining.length === 0) {
            const replacement: TabItem = {
              id: uid('tab'),
              type: 'home',
              title: 'New Tab',
              browserHistory: [],
              browserHistoryIndex: -1,
              zoom: 1,
              lifecycleState: 'active',
              lastActiveAt: Date.now(),
            };
            return {
              tabs: [replacement],
              activeTabId: replacement.id,
              closedTabs: [closing, ...state.closedTabs].slice(0, 15),
            };
          }

          let nextActive = state.activeTabId;
          if (state.activeTabId === tabId) {
            const nextIdx = Math.min(idx, remaining.length - 1);
            nextActive = remaining[nextIdx].id;
          }

          const now = Date.now();
          return {
            tabs: remaining.map((t) =>
              t.id === nextActive
                ? { ...t, lifecycleState: 'active' as const, lastActiveAt: now }
                : t
            ),
            activeTabId: nextActive,
            closedTabs: [closing, ...state.closedTabs].slice(0, 15),
          };
        });
      },

      reopenClosedTab: () => {
        set((state) => {
          if (state.closedTabs.length === 0) return state;
          const [last, ...rest] = state.closedTabs;
          const now = Date.now();
          const restored: TabItem = {
            ...last,
            id: uid('tab'),
            lifecycleState: 'active',
            lastActiveAt: now,
          };
          return {
            tabs: [
              ...state.tabs.map((t) =>
                t.lifecycleState === 'suspended'
                  ? t
                  : { ...t, lifecycleState: 'inactive' as const }
              ),
              restored,
            ],
            activeTabId: restored.id,
            closedTabs: rest,
          };
        });
      },

      setActiveTab: (tabId) => {
        const now = Date.now();
        set((state) => ({
          activeTabId: tabId,
          tabs: state.tabs.map((t) => {
            if (t.id === tabId) {
              return { ...t, lifecycleState: 'active' as const, lastActiveAt: now };
            }
            if (t.id === state.activeTabId && t.lifecycleState !== 'suspended') {
              return { ...t, lifecycleState: 'inactive' as const, lastActiveAt: now };
            }
            return t;
          }),
        }));
      },

      reorderTabs: (fromIndex, toIndex) => {
        set((state) => {
          if (
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= state.tabs.length ||
            toIndex >= state.tabs.length ||
            fromIndex === toIndex
          ) {
            return state;
          }
          const copy = [...state.tabs];
          const [moved] = copy.splice(fromIndex, 1);
          copy.splice(toIndex, 0, moved);
          return { tabs: copy };
        });
      },

      updateTab: (tabId, patch) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)),
        }));
      },

      suspendTab: (tabId) => {
        const { activeTabId } = get();
        if (tabId === activeTabId) return;
        void resourceManager.cleanupScope(tabId);
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId ? { ...t, lifecycleState: 'suspended' as const, isLoading: false } : t
          ),
        }));
      },

      restoreTab: (tabId) => {
        get().setActiveTab(tabId);
      },

      suspendEligibleTabs: () => {
        const { tabs, activeTabId, settings } = get();
        if (!settings.autoSuspendTabs) return 0;
        const timeoutMs = Math.max(1, settings.autoSuspendMinutes) * 60 * 1000;
        const dueIds = findTabsDueForSuspension(tabs, activeTabId, timeoutMs, Date.now());
        if (dueIds.length === 0) return 0;
        for (const id of dueIds) {
          void resourceManager.cleanupScope(id);
        }
        const dueSet = new Set(dueIds);
        set((state) => ({
          tabs: state.tabs.map((t) =>
            dueSet.has(t.id) ? { ...t, lifecycleState: 'suspended' as const, isLoading: false } : t
          ),
        }));
        return dueIds.length;
      },

      navigateBrowserTab: (tabId, rawInput) => {
        const { settings } = get();
        const resolved = resolveAddressInput(rawInput, settings.searchEngine, settings.customSearchUrl);
        if (resolved.url === 'about:blank') return;

        set((state) => ({
          tabs: state.tabs.map((t) => {
            if (t.id !== tabId) return t;
            const trimmedHistory = t.browserHistory.slice(0, t.browserHistoryIndex + 1);
            const nextHistory = [...trimmedHistory, resolved.url];
            return {
              ...t,
              type: 'browser',
              fileId: undefined,
              url: resolved.url,
              title: resolved.displayLabel,
              isLoading: true,
              error: null,
              browserHistory: nextHistory,
              browserHistoryIndex: nextHistory.length - 1,
            };
          }),
        }));
      },

      goBackTab: (tabId) => {
        set((state) => ({
          tabs: state.tabs.map((t) => {
            if (t.id !== tabId || t.browserHistoryIndex <= 0) return t;
            const nextIdx = t.browserHistoryIndex - 1;
            const nextUrl = t.browserHistory[nextIdx];
            return {
              ...t,
              url: nextUrl,
              browserHistoryIndex: nextIdx,
              isLoading: true,
              error: null,
            };
          }),
        }));
      },

      goForwardTab: (tabId) => {
        set((state) => ({
          tabs: state.tabs.map((t) => {
            if (t.id !== tabId || t.browserHistoryIndex >= t.browserHistory.length - 1) return t;
            const nextIdx = t.browserHistoryIndex + 1;
            const nextUrl = t.browserHistory[nextIdx];
            return {
              ...t,
              url: nextUrl,
              browserHistoryIndex: nextIdx,
              isLoading: true,
              error: null,
            };
          }),
        }));
      },

      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarSection: (section) => set({ sidebarSection: section, sidebarOpen: true }),

      toggleBookmarkForUrl: (url, title, folder = 'Quick Links') => {
        if (!url || url.startsWith('local://')) return;
        set((state) => {
          const existing = state.bookmarks.find((b) => b.url === url);
          if (existing) {
            return { bookmarks: state.bookmarks.filter((b) => b.id !== existing.id) };
          }
          return {
            bookmarks: [
              {
                id: uid('bm'),
                title: title || url,
                url,
                folder,
                createdAt: Date.now(),
              },
              ...state.bookmarks,
            ],
          };
        });
      },

      addBookmark: (bm) =>
        set((state) => ({
          bookmarks: [{ ...bm, id: uid('bm'), createdAt: Date.now() }, ...state.bookmarks],
        })),

      updateBookmark: (id, patch) =>
        set((state) => ({
          bookmarks: state.bookmarks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        })),

      removeBookmark: (id) =>
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.id !== id),
        })),

      recordHistory: (url, title) => {
        if (!url || url.startsWith('local://') || url === 'about:blank') return;
        set((state) => ({
          history: [
            { id: uid('hist'), url, title: title || url, visitedAt: Date.now() },
            ...state.history.filter((h) => h.url !== url || Date.now() - h.visitedAt > 30000),
          ].slice(0, 150),
        }));
      },

      clearHistory: () => set({ history: [] }),

      clearSiteDataForHost: (host) => {
        const current = get().history;
        if (host === '*') {
          set({ history: [] });
          return current.length;
        }
        const remaining = current.filter((h) => !urlMatchesHost(h.url, host));
        const removedCount = current.length - remaining.length;
        set({ history: remaining });
        return removedCount;
      },

      addDownload: (item) => {
        const id = uid('dl');
        set((state) => ({
          downloads: [{ ...item, id, createdAt: Date.now() }, ...state.downloads].slice(0, 50),
        }));
        return id;
      },

      updateDownload: (id, patch) =>
        set((state) => ({
          downloads: state.downloads.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        })),

      clearDownloads: () => set({ downloads: [] }),

      setWorkspaceFiles: (files) => set({ workspaceFiles: files }),

      upsertWorkspaceFile: (file) =>
        set((state) => ({
          workspaceFiles: [file, ...state.workspaceFiles.filter((f) => f.id !== file.id)],
        })),

      removeWorkspaceFileMeta: (fileId) =>
        set((state) => ({
          workspaceFiles: state.workspaceFiles.filter((f) => f.id !== fileId),
          recentFileIds: state.recentFileIds.filter((id) => id !== fileId),
        })),

      addSavedSignature: (label, dataUrl) =>
        set((state) => ({
          savedSignatures: [
            { id: uid('sig'), label, dataUrl, createdAt: Date.now() },
            ...state.savedSignatures,
          ].slice(0, 12),
        })),

      removeSavedSignature: (id) =>
        set((state) => ({
          savedSignatures: state.savedSignatures.filter((s) => s.id !== id),
        })),

      addSavedStamp: (tpl) => {
        const created: SavedStampTemplate = {
          ...tpl,
          id: uid('stamp'),
          createdAt: Date.now(),
        };
        set((state) => ({
          savedStamps: [created, ...state.savedStamps].slice(0, 32),
        }));
        return created;
      },

      updateSavedStamp: (id, patch) =>
        set((state) => ({
          savedStamps: state.savedStamps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        })),

      removeSavedStamp: (id) =>
        set((state) => ({
          savedStamps: state.savedStamps.filter((s) => s.id !== id),
        })),

      resetSavedStamps: () => set({ savedStamps: DEFAULT_STAMP_TEMPLATES }),

      updateSettings: (patch) =>
        set((state) => ({
          settings: { ...state.settings, ...patch },
        })),
    }),
    {
      name: 'folio-workspace-state-v1',
      storage: createJSONStorage(() => {
        const safeStorage: StateStorage = {
          getItem: (name) => {
            if (typeof window === 'undefined') return null;
            try {
              const raw = window.localStorage.getItem(name);
              if (!raw) return null;
              JSON.parse(raw);
              return raw;
            } catch {
              try {
                window.localStorage.removeItem(name);
              } catch {
                // ignore
              }
              return null;
            }
          },
          setItem: (name, value) => {
            if (typeof window === 'undefined') return;
            try {
              window.localStorage.setItem(name, value);
            } catch {
              // ignore storage quota errors
            }
          },
          removeItem: (name) => {
            if (typeof window === 'undefined') return;
            try {
              window.localStorage.removeItem(name);
            } catch {
              // ignore
            }
          },
        };
        return safeStorage;
      }),
      partialize: (state) => ({
        tabs: state.settings.restoreSession ? state.tabs : [],
        activeTabId: state.settings.restoreSession ? state.activeTabId : INITIAL_TAB_ID,
        settings: state.settings,
        bookmarks: state.bookmarks,
        history: state.history,
        downloads: state.downloads,
        recentFileIds: state.recentFileIds,
        savedSignatures: state.savedSignatures,
        savedStamps: state.savedStamps,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (!state.tabs || state.tabs.length === 0) {
            state.tabs = [
              {
                id: INITIAL_TAB_ID,
                type: 'home',
                title: 'New Tab',
                browserHistory: [],
                browserHistoryIndex: -1,
                zoom: 1,
              },
            ];
            state.activeTabId = INITIAL_TAB_ID;
          }
          if (!Array.isArray(state.savedStamps)) {
            state.savedStamps = DEFAULT_STAMP_TEMPLATES;
          }
          const rawMode = state.settings?.markdownDefaultMode as string | undefined;
          if (!rawMode || rawMode === 'split' || rawMode === 'edit') {
            state.settings.markdownDefaultMode = 'live';
          }
        }
      },
    }
  )
);
