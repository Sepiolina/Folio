'use client';

import React, { useEffect, useRef, useState } from 'react';
import { PenTool, ShieldCheck, Trash2, Type, Upload, X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { PdfMetadataInfo } from '@/lib/pdfOperations';

interface PdfSignatureModalProps {
  open: boolean;
  onClose: () => void;
  onInsertSignature: (dataUrl: string, label: string) => void;
  metadataInfo: PdfMetadataInfo | null;
}

export function PdfSignatureModal({
  open,
  onClose,
  onInsertSignature,
  metadataInfo,
}: PdfSignatureModalProps) {
  const { savedSignatures, addSavedSignature, removeSavedSignature } = useWorkspaceStore();
  const [tab, setTab] = useState<'draw' | 'type' | 'upload' | 'security'>('draw');
  const [penColor, setPenColor] = useState('#111827');
  const [typedName, setTypedName] = useState('Kristin Watson');
  const [hasStroke, setHasStroke] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    if (!open || tab !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasStroke(false);
    }
  }, [open, tab]);

  if (!open) return null;

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawingRef.current = true;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setHasStroke(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const p = getPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  };

  const handleUseDrawnSignature = (saveForLater: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke) return;
    const dataUrl = canvas.toDataURL('image/png');
    if (saveForLater) {
      addSavedSignature(`Drawn (${new Date().toLocaleDateString()})`, dataUrl);
    }
    onInsertSignature(dataUrl, 'Visual Signature');
    onClose();
  };

  const handleUseTypedSignature = () => {
    if (!typedName.trim()) return;
    const offscreen = document.createElement('canvas');
    offscreen.width = 420;
    offscreen.height = 120;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    ctx.font = 'italic 44px Georgia, "Times New Roman", serif';
    ctx.fillStyle = penColor;
    ctx.textBaseline = 'middle';
    ctx.fillText(typedName.trim(), 18, 62);
    const dataUrl = offscreen.toDataURL('image/png');
    addSavedSignature(typedName.trim(), dataUrl);
    onInsertSignature(dataUrl, typedName.trim());
    onClose();
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        addSavedSignature(file.name, reader.result);
        onInsertSignature(reader.result, file.name);
        onClose();
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signature-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-[var(--border-strong)] bg-[var(--surface-chrome)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-hairline)]">
          <h2 id="signature-modal-title" className="text-sm font-semibold text-[var(--text-primary)]">
            Signatures & Document Security
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close signature dialog"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-[var(--border-hairline)] text-xs">
          {[
            { id: 'draw' as const, label: 'Draw', icon: PenTool },
            { id: 'type' as const, label: 'Type', icon: Type },
            { id: 'upload' as const, label: 'Upload Image', icon: Upload },
            { id: 'security' as const, label: 'Digital Signatures & Security', icon: ShieldCheck },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-1.5 px-3 py-2 border-b-2 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'border-[var(--accent-color)] text-[var(--text-primary)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-5 space-y-4 text-xs">
          {tab === 'draw' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)]">
                  Draw a visual signature below (placed as an image overlay, not a cryptographic X.509 signature).
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {['#111827', '#1d4ed8', '#0f766e'].map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setPenColor(col)}
                      aria-label={`Ink color ${col}`}
                      className={`w-4 h-4 rounded-full border ${
                        penColor === col ? 'ring-2 ring-[var(--accent-color)]' : 'border-white/30'
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>

              <canvas
                ref={canvasRef}
                width={440}
                height={150}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className="w-full h-36 rounded-lg border border-[var(--border-strong)] bg-white cursor-crosshair touch-none"
              />

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleClearCanvas}
                  className="px-2.5 py-1 rounded border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Clear
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!hasStroke}
                    onClick={() => handleUseDrawnSignature(true)}
                    className="px-3 py-1.5 rounded-md bg-[var(--accent-color)] text-white font-medium disabled:opacity-40"
                  >
                    Save & Insert
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'type' && (
            <div className="space-y-3">
              <input
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Type your signature name"
                className="w-full h-9 px-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-primary)] focus:outline-none"
              />
              <div className="h-24 rounded-lg border border-[var(--border-hairline)] bg-white flex items-center px-6">
                <span
                  style={{
                    fontFamily: 'Georgia, "Times New Roman", serif',
                    fontStyle: 'italic',
                    fontSize: '32px',
                    color: penColor,
                  }}
                >
                  {typedName || 'Preview'}
                </span>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleUseTypedSignature}
                  className="px-3.5 py-1.5 rounded-md bg-[var(--accent-color)] text-white font-medium"
                >
                  Save & Insert
                </button>
              </div>
            </div>
          )}

          {tab === 'upload' && (
            <div className="space-y-3">
              <label className="flex flex-col items-center justify-center h-32 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] cursor-pointer hover:border-[var(--accent-color)]">
                <Upload className="w-5 h-5 text-[var(--text-muted)] mb-2" />
                <span className="font-medium text-[var(--text-primary)]">
                  Choose transparent PNG or JPEG signature image
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleUploadFile}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {tab === 'security' && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] space-y-1.5">
                <div className="font-semibold text-[var(--text-primary)]">
                  Visual vs. Cryptographic Digital Signatures
                </div>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  Drawn, typed, or uploaded signatures are <strong>visual overlays</strong> embedded
                  into the page graphics. Cryptographic PDF digital signatures require an X.509
                  private key certificate and PKCS#7 `/ByteRange` signing dictionary.
                </p>
              </div>

              {metadataInfo && (
                <div className="space-y-1.5 border border-[var(--border-hairline)] rounded-lg p-3">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">PDF Encryption</span>
                    <span className="text-[var(--text-primary)] font-medium">
                      {metadataInfo.isEncrypted ? 'Encrypted' : 'Unencrypted'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Cryptographic /Sig Fields</span>
                    <span className="text-[var(--text-primary)] tabular-nums font-medium">
                      {metadataInfo.signatureCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Interactive AcroForm</span>
                    <span className="text-[var(--text-primary)] font-medium">
                      {metadataInfo.hasAcroForm ? 'Present' : 'None'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block mb-0.5">SHA-256 Integrity Digest</span>
                    <code className="block p-1.5 rounded bg-[var(--surface-subtle)] text-[10px] break-all text-[var(--text-primary)]">
                      {metadataInfo.sha256Hex}
                    </code>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reusable Saved Signatures */}
          {tab !== 'security' && savedSignatures.length > 0 && (
            <div className="pt-2 border-t border-[var(--border-hairline)]">
              <div className="font-medium text-[var(--text-secondary)] mb-2">Saved Signatures</div>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                {savedSignatures.map((sig) => (
                  <div
                    key={sig.id}
                    className="group flex items-center gap-2 p-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-subtle)]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onInsertSignature(sig.dataUrl, sig.label);
                        onClose();
                      }}
                      className="flex-1 flex items-center gap-2 min-w-0 text-left"
                    >
                      <img
                        src={sig.dataUrl}
                        alt={sig.label}
                        className="h-7 w-14 object-contain bg-white rounded px-1"
                      />
                      <span className="truncate text-[11px] text-[var(--text-primary)]">
                        {sig.label}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSavedSignature(sig.id)}
                      aria-label={`Delete signature ${sig.label}`}
                      className="p-1 text-[var(--text-muted)] hover:text-rose-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
