"use client";

import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { ClipboardList, File as FileIcon, Loader2, Send, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_FILES = 5;
const ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,application/pdf,application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

// The client-facing counterpart to a manager building a real Quote — a
// deliberately minimal "just tell us what you need" form (description +
// quantity + reference photo/spec file), landing as a QuoteDraftRequest
// with managerId null so it shows up flagged "создано клиентом" in every
// manager's "Черновики"/"Заявки на поиск" view. The trigger button is
// styled to be impossible to miss (explicit ask: "прям такая — очень
// заметная") since this is the client's only self-serve way to start a
// new calculation without waiting for a manager to reach out first. See
// PB-V5 chat 2026-07-29.
function AccountQuoteDraftForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        setError(`Можно приложить не больше ${MAX_FILES} файлов.`);
        break;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`Файл «${file.name}» слишком большой (максимум 100MB).`);
        continue;
      }
      next.push(file);
    }
    setFiles(next);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    addFiles(event.dataTransfer.files);
  }

  function resetAndClose() {
    setNote("");
    setQuantity("");
    setFiles([]);
    setError(null);
    setOpen(false);
  }

  async function handleSubmit() {
    if (submitting || !note.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("note", note.trim());
      if (quantity.trim()) formData.append("quantity", quantity.trim());
      files.forEach((file) => formData.append("files", file));

      const res = await fetch("/api/account-quote-drafts", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось отправить заявку.");
        return;
      }
      toast.success("Заявка отправлена! Менеджер свяжется с вами и подготовит просчёт.");
      resetAndClose();
      onSubmitted();
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-primary to-secondary p-4 text-left text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.01]"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <ClipboardList className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold">Отправить ТЗ на просчёт</span>
          <span className="block text-sm text-white/85">
            Опишите товар, приложите фото или файл — менеджер посчитает стоимость и сроки
          </span>
        </span>
        <Send className="h-5 w-5 shrink-0" />
      </button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : resetAndClose())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая заявка на просчёт</DialogTitle>
            <DialogDescription>
              Не нужно ничего считать самим — просто опишите, что хотите заказать. Менеджер свяжется с вами.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="draft-note">Что нужно посчитать</Label>
              <Textarea
                id="draft-note"
                placeholder="Например: складной стул, металлический каркас, ткань оксфорд, похож на фото"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="draft-quantity">Количество, шт (необязательно)</Label>
              <Input
                id="draft-quantity"
                type="number"
                min={1}
                placeholder="Например: 100"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Фото референса или файл ТЗ (необязательно)</Label>
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className={`flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-center transition-colors ${
                  isDragOver ? "border-primary bg-primary/5" : "border-border bg-bg"
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    addFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
                <Upload className="h-4 w-4 shrink-0 text-text-secondary" />
                <p className="text-xs text-text-secondary">
                  Перетащите файлы сюда, или{" "}
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="font-medium text-primary hover:underline"
                  >
                    выберите файл
                  </button>{" "}
                  — фото, PDF, DOC(X), XLS(X), до 100MB, максимум {MAX_FILES}
                </p>
              </div>

              {files.length > 0 && (
                <ul className="space-y-1.5">
                  {files.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                      <FileIcon className="h-4 w-4 shrink-0 text-text-secondary" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-text">{file.name}</div>
                        <div className="text-[11px] text-text-secondary">{formatSize(file.size)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                        aria-label={`Убрать ${file.name}`}
                        className="shrink-0 rounded-md p-1.5 text-text-secondary transition-colors hover:bg-error/10 hover:text-error"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && <p className="text-xs text-error">{error}</p>}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={resetAndClose}>
              Отмена
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={submitting || !note.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Отправить заявку
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { AccountQuoteDraftForm };
