"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { ChevronDown, Download, Eye, File as FileIcon, Loader2, Trash2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PhotoLightbox } from "@/components/manager/photo-lightbox";
import { cn } from "@/lib/utils";

interface SupplierDocumentRecord {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedByManagerId: string | null;
  uploadedByManager: { name: string } | null;
}

const ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,application/pdf,application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

// Только картинки и PDF браузер умеет показать по месту — остальное
// (DOC(X)/XLS(X)) только через «Скачать». Та же логика, что у документов
// клиента (components/manager/client-files-panel.tsx).
function isPreviewable(mimeType: string): "image" | "pdf" | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  return null;
}

interface SupplierDocumentsPanelProps {
  supplierId: string;
}

// Документы поставщика (прайс-листы, договоры и т.п.) — отдельно от фото
// витрины, тот же паттерн, что ClientFilesPanel, но со своим набором
// роутов (/api/suppliers/[id]/documents, /api/suppliers/documents/[id]) и
// без scoping по клиенту — «База поставщиков» общая для всех менеджеров.
// См. PB-V5 chat 2026-08-27.
function SupplierDocumentsPanel({ supplierId }: SupplierDocumentsPanelProps) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<SupplierDocumentRecord[]>([]);
  const [viewer, setViewer] = useState<{ managerId: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [previewImageId, setPreviewImageId] = useState<string | null>(null);
  const [previewPdf, setPreviewPdf] = useState<SupplierDocumentRecord | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/documents`);
      const data = await res.json();
      if (res.ok) {
        setFiles(data.files);
        setViewer({ managerId: data.viewerManagerId, role: data.viewerRole });
      } else {
        setError(data.error ?? "Не удалось загрузить список документов.");
      }
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/suppliers/${supplierId}/documents`, { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setFiles((current) => [data.file, ...current]);
      } else {
        setError(data.error ?? "Не удалось загрузить файл.");
      }
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setUploading(false);
    }
  }

  async function deleteFile(id: string) {
    if (!window.confirm("Удалить этот документ?")) return;
    setPendingDeleteId(id);
    setError(null);
    try {
      const res = await fetch(`/api/suppliers/documents/${id}`, { method: "DELETE" });
      if (res.ok) {
        setFiles((current) => current.filter((f) => f.id !== id));
      } else {
        const data = await res.json();
        setError(data.error ?? "Не удалось удалить файл.");
      }
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setPendingDeleteId(null);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium text-text">
          <FileIcon className="h-4 w-4 shrink-0 text-text-secondary" />
          Документы поставщика{!loading && files.length > 0 ? ` (${files.length})` : ""}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-2 border-t border-border p-3">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-center transition-colors",
              isDragOver ? "border-primary bg-primary/5" : "border-border bg-bg",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) uploadFile(file);
              }}
            />
            {uploading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            ) : (
              <Upload className="h-4 w-4 shrink-0 text-text-secondary" />
            )}
            <p className="text-xs text-text-secondary">
              Перетащите прайс-лист, договор и т.п. сюда, или{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="font-medium text-primary hover:underline disabled:opacity-50"
              >
                выберите файл
              </button>{" "}
              — PDF, DOC(X), XLS(X), PNG, JPG, до 100MB
            </p>
          </div>

          {error && <p className="text-xs text-error">{error}</p>}

          {loading ? (
            <p className="text-xs text-text-secondary">Загрузка списка документов…</p>
          ) : files.length === 0 ? (
            <p className="text-xs text-text-secondary">Документов пока нет.</p>
          ) : (
            <ul className="space-y-1.5">
              {files.map((file) => {
                const previewKind = isPreviewable(file.mimeType);
                return (
                  <li key={file.id} className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-sm">
                    <FileIcon className="h-4 w-4 shrink-0 text-text-secondary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-text">{file.originalName}</div>
                      <div className="text-[11px] text-text-secondary">
                        {formatSize(file.size)} · {new Date(file.uploadedAt).toLocaleDateString("ru-RU")}
                        {file.uploadedByManager ? ` · ${file.uploadedByManager.name}` : ""}
                      </div>
                    </div>
                    {previewKind && (
                      <button
                        type="button"
                        onClick={() => (previewKind === "image" ? setPreviewImageId(file.id) : setPreviewPdf(file))}
                        aria-label={`Просмотреть ${file.originalName}`}
                        className="shrink-0 rounded-md p-1.5 text-text-secondary transition-colors hover:bg-black/5 hover:text-primary"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    <a
                      href={`/api/suppliers/documents/${file.id}`}
                      aria-label={`Скачать ${file.originalName}`}
                      className="shrink-0 rounded-md p-1.5 text-text-secondary transition-colors hover:bg-black/5 hover:text-primary"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    {viewer && (viewer.role === "owner" || viewer.managerId === file.uploadedByManagerId) && (
                      <button
                        type="button"
                        onClick={() => deleteFile(file.id)}
                        disabled={pendingDeleteId === file.id}
                        aria-label={`Удалить ${file.originalName}`}
                        className="shrink-0 rounded-md p-1.5 text-text-secondary transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
                      >
                        {pendingDeleteId === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <PhotoLightbox
        src={previewImageId ? `/api/suppliers/documents/${previewImageId}?preview=1` : null}
        onClose={() => setPreviewImageId(null)}
      />

      <Dialog open={previewPdf !== null} onOpenChange={(v) => !v && setPreviewPdf(null)}>
        <DialogContent className="flex h-[90vh] max-w-4xl flex-col gap-2 p-3">
          <DialogTitle className="truncate pr-6 text-sm">{previewPdf?.originalName}</DialogTitle>
          {previewPdf && (
            <iframe src={`/api/suppliers/documents/${previewPdf.id}?preview=1`} className="min-h-0 flex-1 rounded-lg border border-border" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { SupplierDocumentsPanel };
