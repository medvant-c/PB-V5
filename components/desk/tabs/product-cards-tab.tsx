"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Check, Download, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/desk/empty-state";
import { cn } from "@/lib/utils";

// Persisted so a manager who reloads the tab or closes it mid-generation
// doesn't lose track of a job that's still running server-side — the
// generation itself is fire-and-forget on the backend (see
// app/api/desk-generate-product-card/route.ts), so there's a real job to
// resume, not just a lost request.
const JOB_STORAGE_KEY = "desk-product-card-job";
const POLL_INTERVAL_MS = 1500;
// Mirrors the server's job TTL (product-card-jobs.ts) — no point resuming a
// poll for a job the server has already forgotten.
const JOB_RESUME_MAX_AGE_MS = 30 * 60 * 1000;

interface ActiveJob {
  jobId: string;
  startedAt: number;
}

type JobStage = "brief" | "images" | "packaging";

interface JobStatusResponse {
  status: "running" | "done" | "error";
  stage: JobStage;
  completedSlides: number;
  totalSlides: number;
  error: string | null;
  exportId: string | null;
}

function stageLabel(stage: JobStage, completedSlides: number, totalSlides: number): string {
  if (stage === "brief") return "Изучаю фото и характеристики, готовлю тексты…";
  if (stage === "images") {
    if (totalSlides === 0) return "Готовлю слайды…";
    if (completedSlides >= totalSlides) return "Собираю архив с результатом…";
    return `Генерирую слайд ${completedSlides + 1} из ${totalSlides}…`;
  }
  return "Собираю архив с результатом…";
}

interface ImageDropzoneProps {
  label: string;
  hint: string;
  file: File | null;
  onChange: (file: File | null) => void;
}

function ImageDropzone({ label, hint, file, onChange }: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleFile(candidate: File | undefined) {
    if (!candidate) return;
    if (!candidate.type.startsWith("image/")) return;
    onChange(candidate);
  }

  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
          isDragOver ? "border-primary bg-primary/5" : "border-border bg-surface",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- client-side object URL preview, not a static asset */}
            <img src={previewUrl} alt={label} className="h-28 w-auto rounded-lg object-contain" />
            <p className="max-w-full truncate text-xs text-text-secondary">{file?.name}</p>
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label="Убрать файл"
              className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-error"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <ImagePlus className="h-5 w-5 text-text-secondary" />
            <p className="text-xs text-text-secondary">
              Перетащите файл сюда или{" "}
              <button type="button" onClick={() => inputRef.current?.click()} className="font-medium text-primary hover:underline">
                выберите файл
              </button>
            </p>
            <p className="text-[11px] text-text-secondary">{hint}</p>
          </>
        )}
      </div>
    </div>
  );
}

interface ExportRecord {
  id: string;
  productTitle: string;
  fileName: string;
  size: number;
  createdAt: string;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

async function downloadExport(exportId: string) {
  const res = await fetch(`/api/desk-product-card-exports/${exportId}`);
  if (!res.ok) throw new Error("download failed");

  const disposition = res.headers.get("Content-Disposition") ?? "";
  const fileNameMatch = /filename\*=UTF-8''([^;]+)/.exec(disposition);
  const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : "Карточка товара.zip";

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ProductCardsTab() {
  const [productPhoto, setProductPhoto] = useState<File | null>(null);
  const [specMode, setSpecMode] = useState<"screenshot" | "text">("screenshot");
  const [specScreenshot, setSpecScreenshot] = useState<File | null>(null);
  const [specText, setSpecText] = useState("");
  const [context, setContext] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [jobStage, setJobStage] = useState<JobStage>("brief");
  const [completedSlides, setCompletedSlides] = useState(0);
  const [totalSlides, setTotalSlides] = useState(0);

  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [loadingExports, setLoadingExports] = useState(true);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollFailureCountRef = useRef(0);

  const hasSpec = specMode === "screenshot" ? Boolean(specScreenshot) : Boolean(specText.trim());
  const canSubmit = Boolean(productPhoto) && hasSpec && status !== "loading";

  const loadExports = useCallback(async () => {
    setLoadingExports(true);
    try {
      const res = await fetch("/api/desk-product-card-exports");
      const data = await res.json();
      if (res.ok) setExports(data.exports);
    } finally {
      setLoadingExports(false);
    }
  }, []);

  useEffect(() => {
    loadExports();
  }, [loadExports]);

  const clearActiveJob = useCallback(() => {
    window.localStorage.removeItem(JOB_STORAGE_KEY);
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
  }, []);

  const pollJob = useCallback(
    async (jobId: string) => {
      let data: JobStatusResponse;
      try {
        const res = await fetch(`/api/desk-generate-product-card/${jobId}`);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          clearActiveJob();
          setError(body?.error ?? "Не удалось получить статус задачи.");
          setStatus("error");
          return;
        }
        data = await res.json();
        pollFailureCountRef.current = 0;
      } catch {
        // Transient network blip — retry a few times before giving up, so a
        // flaky connection doesn't fail a 5-10 minute job over one dropped poll.
        pollFailureCountRef.current += 1;
        if (pollFailureCountRef.current > 5) {
          clearActiveJob();
          setError("Не удалось связаться с сервером.");
          setStatus("error");
          return;
        }
        pollTimeoutRef.current = setTimeout(() => pollJob(jobId), POLL_INTERVAL_MS);
        return;
      }

      setJobStage(data.stage);
      setCompletedSlides(data.completedSlides);
      setTotalSlides(data.totalSlides);

      if (data.status === "running") {
        pollTimeoutRef.current = setTimeout(() => pollJob(jobId), POLL_INTERVAL_MS);
        return;
      }

      if (data.status === "error") {
        clearActiveJob();
        setError(data.error ?? "Не удалось сформировать карточку. Попробуйте ещё раз.");
        setStatus("error");
        return;
      }

      clearActiveJob();
      try {
        if (data.exportId) await downloadExport(data.exportId);
        setStatus("done");
      } catch {
        setError("Карточка готова, но не удалось скачать файл — найдите её в истории выгрузок ниже.");
        setStatus("error");
      }
      loadExports();
    },
    [clearActiveJob, loadExports],
  );

  // Resume a job left running from before a reload/tab-close — the
  // generation itself is fire-and-forget server-side, so there's a real job
  // to reconnect to, not just an abandoned request.
  useEffect(() => {
    const raw = window.localStorage.getItem(JOB_STORAGE_KEY);
    if (!raw) return;
    try {
      const saved: ActiveJob = JSON.parse(raw);
      if (Date.now() - saved.startedAt > JOB_RESUME_MAX_AGE_MS) {
        window.localStorage.removeItem(JOB_STORAGE_KEY);
        return;
      }
      setStatus("loading");
      setError(null);
      pollJob(saved.jobId);
    } catch {
      window.localStorage.removeItem(JOB_STORAGE_KEY);
    }
  }, [pollJob]);

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  async function handleGenerate() {
    if (!productPhoto || !hasSpec || status === "loading") return;
    setStatus("loading");
    setError(null);
    setJobStage("brief");
    setCompletedSlides(0);
    setTotalSlides(0);
    pollFailureCountRef.current = 0;

    try {
      const formData = new FormData();
      formData.append("productPhoto", productPhoto);
      if (specMode === "screenshot" && specScreenshot) {
        formData.append("specScreenshot", specScreenshot);
      } else {
        formData.append("specText", specText.trim());
      }
      if (context.trim()) formData.append("context", context.trim());

      const res = await fetch("/api/desk-generate-product-card", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.jobId) {
        setError(data?.error ?? "Не удалось запустить генерацию. Попробуйте ещё раз.");
        setStatus("error");
        return;
      }

      window.localStorage.setItem(JOB_STORAGE_KEY, JSON.stringify({ jobId: data.jobId, startedAt: Date.now() }));
      pollJob(data.jobId);
    } catch {
      setError("Не удалось связаться с сервером.");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-bold text-text">Карточки товара для маркетплейса</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Загрузите фото товара и скриншот с характеристиками — AI сгенерирует премиальную презентацию из 5
          слайдов 1080×1440 в едином фирменном стиле Panda Bridge (сохраняя реальный товар с фото и логотип
          на каждом слайде) и подготовит продающее и SEO-описание. Скачается архив .zip с изображениями и
          .docx с текстами и брифом по каждому слайду.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ImageDropzone label="Фото товара" hint="JPEG, PNG, WebP — до 8MB" file={productPhoto} onChange={setProductPhoto} />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Характеристики товара</Label>
            <div className="flex gap-1 rounded-lg border border-border bg-surface p-0.5">
              <button
                type="button"
                onClick={() => setSpecMode("screenshot")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  specMode === "screenshot" ? "bg-primary/10 text-primary" : "text-text-secondary hover:text-text",
                )}
              >
                Скриншот
              </button>
              <button
                type="button"
                onClick={() => setSpecMode("text")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  specMode === "text" ? "bg-primary/10 text-primary" : "text-text-secondary hover:text-text",
                )}
              >
                Текст
              </button>
            </div>
          </div>

          {specMode === "screenshot" ? (
            <ImageDropzone
              label=""
              hint="Скрин с описанием/характеристиками товара"
              file={specScreenshot}
              onChange={setSpecScreenshot}
            />
          ) : (
            <Textarea
              value={specText}
              onChange={(e) => setSpecText(e.target.value)}
              placeholder="Впишите или вставьте характеристики товара: материал, размеры, комплектация, мощность и т.д."
              className="min-h-43 bg-surface"
            />
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="product-context">Название / ниша товара (необязательно)</Label>
        <Input
          id="product-context"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Например: термос для чая 500 мл"
        />
      </div>

      {error && <p className="text-xs text-error">{error}</p>}
      {status === "loading" && (
        <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-text">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
              {stageLabel(jobStage, completedSlides, totalSlides)}
            </span>
            {jobStage === "images" && totalSlides > 0 && (
              <span className="shrink-0 tabular-nums text-text-secondary">
                {Math.min(completedSlides, totalSlides)}/{totalSlides}
              </span>
            )}
          </div>
          <Progress
            value={
              jobStage === "brief"
                ? 5
                : jobStage === "packaging"
                  ? 100
                  : totalSlides > 0
                    ? Math.round((completedSlides / totalSlides) * 90) + 5
                    : 5
            }
          />
          <p className="text-[11px] text-text-secondary">
            Обычно занимает 3–5 минут. Можно закрыть вкладку или перейти в другой раздел — генерация продолжится
            на сервере, а файл появится в истории выгрузок ниже.
          </p>
        </div>
      )}
      {status === "done" && (
        <p className="flex items-center gap-1 text-xs font-medium text-success">
          <Check className="h-3.5 w-3.5" /> Готово, файл скачан.
        </p>
      )}

      <Button type="button" onClick={handleGenerate} disabled={!canSubmit}>
        {status === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Генерирую…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" /> Создать карточку
          </>
        )}
      </Button>

      <div className="border-t border-border pt-4">
        <h3 className="text-xs font-semibold text-text-secondary">История выгрузок</h3>
        {loadingExports ? (
          <p className="mt-2 text-xs text-text-secondary">Загрузка…</p>
        ) : exports.length === 0 ? (
          <div className="mt-2">
            <EmptyState icon={Archive} message="Выгрузок пока нет — первая появится здесь после генерации." compact />
          </div>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {exports.map((item) => (
              <li key={item.id}>
                <a
                  href={`/api/desk-product-card-exports/${item.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm transition-colors hover:border-primary/30"
                >
                  <Download className="h-4 w-4 shrink-0 text-text-secondary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-text">{item.productTitle}</span>
                    <span className="block truncate text-xs text-text-secondary">
                      {formatDate(item.createdAt)} · {item.fileName} · {formatSize(item.size)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export { ProductCardsTab };
