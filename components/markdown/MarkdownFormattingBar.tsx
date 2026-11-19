'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Bold,
  CheckSquare,
  Code,
  FileCode2,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Strikethrough,
  Table,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { saveImageFileToWorkspaceAssets } from '@/lib/markdownAssetStore';
import { formatBytes } from '@/lib/pageRange';

export type MarkdownFormatAction =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'paragraph'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'highlight'
  | 'code'
  | 'codeblock'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'quote'
  | 'link'
  | 'image'
  | 'table'
  | 'hr';

export interface MarkdownActionPayload {
  alt?: string;
  url?: string;
  lang?: string;
  cols?: number;
  rows?: number;
}

interface MarkdownFormattingBarProps {
  onAction: (action: MarkdownFormatAction, payload?: MarkdownActionPayload) => void;
}

interface ToolbarBtnProps {
  label: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}

function ToolbarBtn({ label, title, onClick, active, children }: ToolbarBtnProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex items-center justify-center h-7 min-w-7 px-1.5 rounded text-xs transition-colors shrink-0 ${
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
      }`}
    >
      {children}
    </button>
  );
}

export function MarkdownFormattingBar({ onAction }: MarkdownFormattingBarProps) {
  const [imagePopoverOpen, setImagePopoverOpen] = useState(false);
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [imgUrl, setImgUrl] = useState('');
  const [imgAlt, setImgAlt] = useState('');
  const [linkUrl, setLinkUrl] = useState('https://');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const workspaceFiles = useWorkspaceStore((s) => s.workspaceFiles);
  const upsertWorkspaceFile = useWorkspaceStore((s) => s.upsertWorkspaceFile);
  const workspaceAssets = workspaceFiles.filter((f) => f.kind === 'asset');

  useEffect(() => {
    if (!imagePopoverOpen && !linkPopoverOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setImagePopoverOpen(false);
        setLinkPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [imagePopoverOpen, linkPopoverOpen]);

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const meta = await saveImageFileToWorkspaceAssets(file, workspaceFiles);
    upsertWorkspaceFile(meta);
    const cleanAlt = imgAlt.trim() || file.name.replace(/\.[^.]+$/, '') || 'image';
    onAction('image', { alt: cleanAlt, url: meta.name });
    setImgAlt('');
    setImgUrl('');
    setImagePopoverOpen(false);
  };

  const handleInsertImageUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const url = imgUrl.trim();
    if (!url) return;
    onAction('image', { alt: imgAlt.trim() || 'image', url });
    setImgUrl('');
    setImgAlt('');
    setImagePopoverOpen(false);
  };

  const handleInsertLink = (e: React.FormEvent) => {
    e.preventDefault();
    const url = linkUrl.trim() || 'https://example.com';
    onAction('link', { url });
    setLinkUrl('https://');
    setLinkPopoverOpen(false);
  };

  return (
    <div
      ref={barRef}
      className="relative border-b border-[var(--border-hairline)] bg-[var(--surface-chrome)] select-none"
    >
      <div
        role="toolbar"
        aria-label="Markdown formatting toolbar"
        className="flex items-center gap-0.5 h-9 px-3 overflow-x-auto"
      >
        {/* Headings */}
        <ToolbarBtn label="Heading 1" title="Heading 1" onClick={() => onAction('h1')}>
          <Heading1 className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn label="Heading 2" title="Heading 2" onClick={() => onAction('h2')}>
          <Heading2 className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn label="Heading 3" title="Heading 3" onClick={() => onAction('h3')}>
          <Heading3 className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn label="Paragraph" title="Body text (clear heading)" onClick={() => onAction('paragraph')}>
          <Pilcrow className="w-3.5 h-3.5" />
        </ToolbarBtn>

        <span className="w-px h-4 bg-[var(--border-hairline)] mx-1.5 shrink-0" />

        {/* Inline styles */}
        <ToolbarBtn label="Bold" title="Bold (Ctrl/Cmd + B)" onClick={() => onAction('bold')}>
          <Bold className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn label="Italic" title="Italic (Ctrl/Cmd + I)" onClick={() => onAction('italic')}>
          <Italic className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn label="Strikethrough" title="Strikethrough (Ctrl/Cmd + Shift + X)" onClick={() => onAction('strike')}>
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn label="Highlight" title="Highlight (Ctrl/Cmd + Shift + H)" onClick={() => onAction('highlight')}>
          <Highlighter className="w-3.5 h-3.5" />
        </ToolbarBtn>

        <span className="w-px h-4 bg-[var(--border-hairline)] mx-1.5 shrink-0" />

        {/* Lists & Blocks */}
        <ToolbarBtn label="Bullet list" title="Bullet list" onClick={() => onAction('bullet')}>
          <List className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn label="Numbered list" title="Numbered list" onClick={() => onAction('ordered')}>
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn label="Task list" title="Task checkbox list" onClick={() => onAction('task')}>
          <CheckSquare className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn label="Blockquote" title="Blockquote" onClick={() => onAction('quote')}>
          <Quote className="w-3.5 h-3.5" />
        </ToolbarBtn>

        <span className="w-px h-4 bg-[var(--border-hairline)] mx-1.5 shrink-0" />

        {/* Code, Links, Media, Tables */}
        <ToolbarBtn label="Inline code" title="Inline code (Ctrl/Cmd + E)" onClick={() => onAction('code')}>
          <Code className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn label="Code block" title="Fenced code block" onClick={() => onAction('codeblock')}>
          <FileCode2 className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Insert link"
          title="Insert link (Ctrl/Cmd + K)"
          active={linkPopoverOpen}
          onClick={() => {
            setImagePopoverOpen(false);
            setLinkPopoverOpen((v) => !v);
          }}
        >
          <Link2 className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Insert image"
          title="Insert image from file or URL"
          active={imagePopoverOpen}
          onClick={() => {
            setLinkPopoverOpen(false);
            setImagePopoverOpen((v) => !v);
          }}
        >
          <ImagePlus className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn label="Insert table" title="Insert formatted table" onClick={() => onAction('table')}>
          <Table className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn label="Horizontal divider" title="Insert horizontal divider" onClick={() => onAction('hr')}>
          <Minus className="w-3.5 h-3.5" />
        </ToolbarBtn>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageFileChange}
        />
      </div>

      {/* Link Popover */}
      {linkPopoverOpen && (
        <form
          onSubmit={handleInsertLink}
          className="absolute top-full left-3 sm:left-64 mt-1.5 z-40 p-2.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] shadow-xl w-72 flex flex-col gap-2"
        >
          <div className="text-[11px] font-medium text-[var(--text-primary)]">Insert Hyperlink</div>
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
            autoFocus
            className="w-full h-7 px-2 rounded border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setLinkPopoverOpen(false)}
              className="px-2 py-1 rounded text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-2.5 py-1 rounded text-[11px] font-medium bg-[var(--accent-color)] text-white hover:opacity-90"
            >
              Insert Link
            </button>
          </div>
        </form>
      )}

      {/* Image Popover */}
      {imagePopoverOpen && (
        <div className="absolute top-full left-3 sm:left-72 mt-1.5 z-40 p-3 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] shadow-xl w-76 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[var(--text-primary)]">Insert Image</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[11px] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)]"
            >
              <Upload className="w-3 h-3" />
              <span>Upload File</span>
            </button>
          </div>
          <form onSubmit={handleInsertImageUrl} className="flex flex-col gap-1.5">
            <input
              type="text"
              value={imgAlt}
              onChange={(e) => setImgAlt(e.target.value)}
              placeholder="Caption / alt text (optional)"
              className="w-full h-7 px-2 rounded border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
            />
            <input
              type="url"
              value={imgUrl}
              onChange={(e) => setImgUrl(e.target.value)}
              placeholder="Paste image URL (https://...)"
              className="w-full h-7 px-2 rounded border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
            />
            <div className="flex items-center justify-end gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => setImagePopoverOpen(false)}
                className="px-2 py-1 rounded text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!imgUrl.trim()}
                className="px-2.5 py-1 rounded text-[11px] font-medium bg-[var(--accent-color)] text-white hover:opacity-90 disabled:opacity-40"
              >
                Insert URL
              </button>
            </div>
          </form>

          {workspaceAssets.length > 0 && (
            <div className="pt-2 border-t border-[var(--border-hairline)]">
              <div className="text-[10px] font-medium text-[var(--text-muted)] mb-1.5">
                Workspace Assets ({workspaceAssets.length})
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {workspaceAssets.map((asset) => {
                  const base = asset.name.split('/').pop() || asset.name;
                  const stem = base.replace(/\.[^.]+$/, '');
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => {
                        onAction('image', {
                          alt: imgAlt.trim() || stem,
                          url: asset.name,
                        });
                        setImgAlt('');
                        setImagePopoverOpen(false);
                      }}
                      className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-left text-[11px] hover:bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <ImageIcon className="w-3 h-3 text-sky-400 shrink-0" />
                        <span className="truncate">{asset.name}</span>
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] tabular-nums shrink-0">
                        {formatBytes(asset.sizeBytes)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
