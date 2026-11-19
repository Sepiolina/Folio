'use client';

import React, { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { searchKeymap, openSearchPanel } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';
import { syntaxHighlighting, defaultHighlightStyle, syntaxTree } from '@codemirror/language';
import { createLivePreviewExtensions } from '@/lib/codemirrorLivePreview';
import {
  computeCodeBlockChange,
  computeHrInsertChange,
  computeImageInsertChange,
  computeInlineWrapChange,
  computeLineHeadingChange,
  computeLinePrefixChange,
  computeLinkChange,
  computeTableInsertChange,
  htmlToMarkdownBasic,
  type TextEditSpec,
} from '@/lib/markdownFormatting';
import { saveImageFileToWorkspaceAssets } from '@/lib/markdownAssetStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { MarkdownActionPayload, MarkdownFormatAction } from './MarkdownFormattingBar';

export interface MarkdownEditorHandle {
  applyAction: (action: MarkdownFormatAction, payload?: MarkdownActionPayload) => void;
  jumpToLine: (lineNumber: number) => void;
  openSearch: () => void;
  focus: () => void;
}

interface CodeMirrorEditorProps {
  value: string;
  onChange: (next: string) => void;
  mode: 'live' | 'source';
  isDark: boolean;
  fontSize: number;
  lineHeight: number;
  wordWrap: boolean;
  showLineNumbers?: boolean;
  scrollToLine?: number | null;
  searchTrigger?: number;
  onOpenLink?: (url: string) => void;
  onSaveShortcut?: () => void;
  onEditorReady?: (handle: MarkdownEditorHandle | null) => void;
}

interface EditorCompartments {
  theme: Compartment;
  style: Compartment;
  wrap: Compartment;
  mode: Compartment;
  lineNum: Compartment;
}

function makeStyleTheme(fs: number, lh: number, dark: boolean, editorMode: 'live' | 'source') {
  const isLive = editorMode === 'live';
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        fontSize: `${fs}px`,
        backgroundColor: dark ? '#18181b' : '#ffffff',
        color: dark ? '#f1f2f4' : '#111318',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-scroller': {
        fontFamily: isLive ? 'var(--font-body)' : 'var(--font-mono)',
        lineHeight: String(lh),
        padding: isLive ? '28px 28px 72px 28px' : '16px 8px 48px 8px',
      },
      '.cm-content': {
        maxWidth: isLive ? '76ch' : 'none',
        width: '100%',
        margin: isLive ? '0 auto' : '0',
        caretColor: 'var(--accent-color)',
      },
      '.cm-line': {
        padding: isLive ? '2px 4px' : '0 4px',
      },
      '.cm-gutters': {
        backgroundColor: dark ? '#18181b' : '#fafafa',
        color: dark ? '#52525b' : '#9ca3af',
        borderRight: 'none',
        paddingRight: '8px',
      },
      '&.cm-editor .cm-activeLine': {
        backgroundColor: dark
          ? isLive
            ? 'rgba(255,255,255,0.028) !important'
            : 'rgba(255,255,255,0.038) !important'
          : isLive
            ? 'rgba(15,23,42,0.025) !important'
            : 'rgba(0,0,0,0.025) !important',
        borderRadius: isLive ? '4px' : '0',
      },
    },
    { dark }
  );
}

function dispatchEditSpec(view: EditorView, spec: TextEditSpec) {
  view.dispatch({
    changes: { from: spec.from, to: spec.to, insert: spec.insert },
    selection: { anchor: spec.selectionAnchor, head: spec.selectionHead },
    scrollIntoView: true,
  });
  view.focus();
}

function applyActionToView(
  view: EditorView,
  action: MarkdownFormatAction,
  payload?: MarkdownActionPayload
) {
  const docText = view.state.doc.toString();
  const { from, to } = view.state.selection.main;

  switch (action) {
    case 'h1':
      dispatchEditSpec(view, computeLineHeadingChange(docText, from, to, 1));
      break;
    case 'h2':
      dispatchEditSpec(view, computeLineHeadingChange(docText, from, to, 2));
      break;
    case 'h3':
      dispatchEditSpec(view, computeLineHeadingChange(docText, from, to, 3));
      break;
    case 'paragraph':
      dispatchEditSpec(view, computeLineHeadingChange(docText, from, to, 0));
      break;
    case 'bold':
      dispatchEditSpec(view, computeInlineWrapChange(docText, from, to, '**', 'bold text'));
      break;
    case 'italic':
      dispatchEditSpec(view, computeInlineWrapChange(docText, from, to, '*', 'italic text'));
      break;
    case 'strike':
      dispatchEditSpec(view, computeInlineWrapChange(docText, from, to, '~~', 'strikethrough'));
      break;
    case 'highlight':
      dispatchEditSpec(view, computeInlineWrapChange(docText, from, to, '==', 'highlighted'));
      break;
    case 'code':
      dispatchEditSpec(view, computeInlineWrapChange(docText, from, to, '`', 'code'));
      break;
    case 'codeblock':
      dispatchEditSpec(view, computeCodeBlockChange(docText, from, to, payload?.lang || 'typescript'));
      break;
    case 'bullet':
      dispatchEditSpec(view, computeLinePrefixChange(docText, from, to, 'bullet'));
      break;
    case 'ordered':
      dispatchEditSpec(view, computeLinePrefixChange(docText, from, to, 'ordered'));
      break;
    case 'task':
      dispatchEditSpec(view, computeLinePrefixChange(docText, from, to, 'task'));
      break;
    case 'quote':
      dispatchEditSpec(view, computeLinePrefixChange(docText, from, to, 'quote'));
      break;
    case 'link':
      dispatchEditSpec(view, computeLinkChange(docText, from, to, payload?.url || 'https://example.com'));
      break;
    case 'image':
      if (payload?.url) {
        dispatchEditSpec(
          view,
          computeImageInsertChange(docText, to, payload.alt || 'image', payload.url)
        );
      }
      break;
    case 'table':
      dispatchEditSpec(
        view,
        computeTableInsertChange(docText, to, payload?.cols ?? 3, payload?.rows ?? 2)
      );
      break;
    case 'hr':
      dispatchEditSpec(view, computeHrInsertChange(docText, to));
      break;
  }
}

export function CodeMirrorEditor({
  value,
  onChange,
  mode,
  isDark,
  fontSize,
  lineHeight,
  wordWrap,
  showLineNumbers = true,
  scrollToLine,
  searchTrigger,
  onOpenLink,
  onSaveShortcut,
  onEditorReady,
}: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const compartmentsRef = useRef<EditorCompartments | null>(null);

  const onChangeRef = useRef(onChange);
  const onOpenLinkRef = useRef(onOpenLink);
  const onSaveShortcutRef = useRef(onSaveShortcut);
  const onEditorReadyRef = useRef(onEditorReady);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onOpenLinkRef.current = onOpenLink;
  }, [onOpenLink]);

  useEffect(() => {
    onSaveShortcutRef.current = onSaveShortcut;
  }, [onSaveShortcut]);

  useEffect(() => {
    onEditorReadyRef.current = onEditorReady;
  }, [onEditorReady]);

  useEffect(() => {
    if (!hostRef.current) return;

    const comps: EditorCompartments = {
      theme: new Compartment(),
      style: new Compartment(),
      wrap: new Compartment(),
      mode: new Compartment(),
      lineNum: new Compartment(),
    };
    compartmentsRef.current = comps;

    const formattingKeymap = keymap.of([
      {
        key: 'Mod-b',
        run: (v) => {
          applyActionToView(v, 'bold');
          return true;
        },
      },
      {
        key: 'Mod-i',
        run: (v) => {
          applyActionToView(v, 'italic');
          return true;
        },
      },
      {
        key: 'Mod-e',
        run: (v) => {
          applyActionToView(v, 'code');
          return true;
        },
      },
      {
        key: 'Mod-k',
        run: (v) => {
          applyActionToView(v, 'link');
          return true;
        },
      },
      {
        key: 'Mod-Shift-x',
        run: (v) => {
          applyActionToView(v, 'strike');
          return true;
        },
      },
      {
        key: 'Mod-Shift-h',
        run: (v) => {
          applyActionToView(v, 'highlight');
          return true;
        },
      },
      {
        key: 'Mod-s',
        run: () => {
          onSaveShortcutRef.current?.();
          return true;
        },
      },
    ]);

    const liveExtensions = () =>
      createLivePreviewExtensions({
        onOpenLink: (url) => onOpenLinkRef.current?.(url),
      });

    const lineNumExtensions = (editorMode: 'live' | 'source', showLines: boolean) =>
      editorMode === 'source' && showLines
        ? [lineNumbers(), highlightActiveLine()]
        : [highlightActiveLine()];

    const insertImageFileAt = (view: EditorView, file: File, pos: number) => {
      const store = useWorkspaceStore.getState();
      void saveImageFileToWorkspaceAssets(file, store.workspaceFiles).then((meta) => {
        store.upsertWorkspaceFile(meta);
        const alt = file.name.replace(/\.[^.]+$/, '') || 'pasted-image';
        const spec = computeImageInsertChange(view.state.doc.toString(), pos, alt, meta.name);
        dispatchEditSpec(view, spec);
      });
    };

    const clipboardHandlers = EditorView.domEventHandlers({
      paste(event, view) {
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          const imgFile = Array.from(files).find((f) => f.type.startsWith('image/'));
          if (imgFile) {
            event.preventDefault();
            insertImageFileAt(view, imgFile, view.state.selection.main.head);
            return true;
          }
        }

        const html = event.clipboardData?.getData('text/html');
        if (
          html &&
          /<(h[1-6]|strong|b|em|i|ul|ol|li|blockquote|pre|code|a|mark|del|s|img)\b/i.test(html)
        ) {
          const head = view.state.selection.main.head;
          const nodeAtCursor = syntaxTree(view.state).resolveInner(head, -1);
          let inCode = false;
          for (let n: typeof nodeAtCursor | null = nodeAtCursor; n; n = n.parent) {
            if (n.name === 'FencedCode' || n.name === 'InlineCode') {
              inCode = true;
              break;
            }
          }
          if (!inCode) {
            const md = htmlToMarkdownBasic(html);
            if (md) {
              event.preventDefault();
              const { from, to } = view.state.selection.main;
              view.dispatch({
                changes: { from, to, insert: md },
                selection: { anchor: from + md.length },
                scrollIntoView: true,
              });
              return true;
            }
          }
        }
        return false;
      },
      drop(event, view) {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const imgFile = Array.from(files).find((f) => f.type.startsWith('image/'));
        if (!imgFile) return false;
        event.preventDefault();
        event.stopPropagation();
        const dropPos =
          view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
        insertImageFileAt(view, imgFile, dropPos);
        return true;
      },
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        drawSelection(),
        history(),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        formattingKeymap,
        keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        comps.lineNum.of(lineNumExtensions(mode, showLineNumbers)),
        comps.theme.of(isDark ? oneDark : []),
        comps.style.of(makeStyleTheme(fontSize, lineHeight, isDark, mode)),
        comps.wrap.of(wordWrap ? EditorView.lineWrapping : []),
        comps.mode.of(mode === 'live' ? liveExtensions() : []),
        clipboardHandlers,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    const handle: MarkdownEditorHandle = {
      applyAction: (action, payload) => applyActionToView(view, action, payload),
      jumpToLine: (lineNumber) => {
        const totalLines = view.state.doc.lines;
        const clamped = Math.max(1, Math.min(totalLines, lineNumber));
        const lineInfo = view.state.doc.line(clamped);
        view.dispatch({
          selection: { anchor: lineInfo.from },
          effects: EditorView.scrollIntoView(lineInfo.from, { y: 'start' }),
        });
        view.focus();
      },
      openSearch: () => {
        openSearchPanel(view);
      },
      focus: () => {
        view.focus();
      },
    };
    onEditorReadyRef.current?.(handle);

    return () => {
      onEditorReadyRef.current?.(null);
      view.destroy();
      viewRef.current = null;
      compartmentsRef.current = null;
    };
    // Mount once per editor instance; dynamic props update via compartments below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external document reloads
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  // Reconfigure mode, theme, typography, wrap, and line numbers dynamically
  useEffect(() => {
    const view = viewRef.current;
    const comps = compartmentsRef.current;
    if (!view || !comps) return;
    view.dispatch({
      effects: [
        comps.theme.reconfigure(isDark ? oneDark : []),
        comps.style.reconfigure(makeStyleTheme(fontSize, lineHeight, isDark, mode)),
        comps.wrap.reconfigure(wordWrap ? EditorView.lineWrapping : []),
        comps.lineNum.reconfigure(
          mode === 'source' && showLineNumbers
            ? [lineNumbers(), highlightActiveLine()]
            : [highlightActiveLine()]
        ),
        comps.mode.reconfigure(
          mode === 'live'
            ? createLivePreviewExtensions({
                onOpenLink: (url) => onOpenLinkRef.current?.(url),
              })
            : []
        ),
      ],
    });
  }, [mode, isDark, fontSize, lineHeight, wordWrap, showLineNumbers]);

  // Scroll to line when clicking an outline heading
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !scrollToLine) return;
    const totalLines = view.state.doc.lines;
    const clamped = Math.max(1, Math.min(totalLines, scrollToLine));
    const lineInfo = view.state.doc.line(clamped);
    view.dispatch({
      selection: { anchor: lineInfo.from },
      effects: EditorView.scrollIntoView(lineInfo.from, { y: 'start' }),
    });
  }, [scrollToLine]);

  useEffect(() => {
    if (!searchTrigger || !viewRef.current) return;
    openSearchPanel(viewRef.current);
  }, [searchTrigger]);

  return (
    <div
      ref={hostRef}
      className="h-full w-full overflow-hidden"
      data-testid="codemirror-host"
      data-editor-mode={mode}
    />
  );
}
