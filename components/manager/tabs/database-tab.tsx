"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Download, File as FileIcon, Loader2, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface ManagerFileRecord {
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

function ManagerDatabaseTab() {
  const [files, setFiles] = useState<ManagerFileRecord[]>([]);
  const [viewer, setViewer] = useState<{ managerId: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/manager-files");
      const data = await res.json();
      if (res.ok) {
        setFiles(data.files);
        setViewer({ managerId: data.viewerManagerId, role: data.viewerRole });
      } else {
        setError(data.error ?? "Не удалось загрузить список файлов.");
      }
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/manager-files", { method: "POST", body: formData });
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
    if (!window.confirm("Удалить этот файл?")) return;
    setPendingDeleteId(id);
    setError(null);
    try {
      const res = await fetch(`/api/manager-files/${id}`, { method: "DELETE" });
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
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-text">База данных</h2>
        <p className="mt-0.5 text-xs text-text-secondary">
          Общее хранилище рабочих файлов и документов для всех сотрудников.
        </p>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors",
          isDragOver ? "border-primary bg-primary/5" : "border-border bg-surface",
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
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <Upload className="h-5 w-5 text-text-secondary" />
        )}
        <p className="text-xs text-text-secondary">
          Перетащите файл сюда или{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="font-medium text-primary hover:underline disabled:opacity-50"
          >
            выберите файл
          </button>
        </p>
        <p className="text-[11px] text-text-secondary">PDF, DOC(X), XLS(X), PNG, JPG — до 100MB</p>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      {loading ? (
        <p className="text-xs text-text-secondary">Загрузка списка файлов…</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-text-secondary">Файлов пока нет.</p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <FileIcon className="h-4 w-4 shrink-0 text-text-secondary" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-text">{file.originalName}</div>
                <div className="text-[11px] text-text-secondary">
                  {formatSize(file.size)} · {new Date(file.uploadedAt).toLocaleDateString("ru-RU")}
                  {file.uploadedByManager ? ` · ${file.uploadedByManager.name}` : ""}
                </div>
              </div>
              <a
                href={`/api/manager-files/${file.id}`}
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
                  {pendingDeleteId === file.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { ManagerDatabaseTab };
