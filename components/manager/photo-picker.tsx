"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 3;
// Below this on the shorter side, a photo will visibly soften/blur once
// stretched into the PDF's large hero-photo box — the PDF pipeline embeds
// images at full original resolution with zero recompression (verified),
// so this is a source-quality warning, not something the export can fix.
const LOW_RES_THRESHOLD_PX = 400;

interface PhotoPickerProps {
  photos: File[];
  onChange: (photos: File[]) => void;
  // Overridable per-caller — quote photos stay at the original MAX_PHOTOS
  // (3, PDF hero-photo layout only ever shows that many), but a supplier
  // showcase can reasonably want more angles. See PB-V5 chat 2026-08-23.
  maxPhotos?: number;
}

// Supports three ways in — click-to-browse, drag/drop, AND clipboard paste
// (Ctrl/Cmd+V) — pasting a screenshot straight from the clipboard is the
// primary way managers actually get product photos day to day, per the
// manager spec ("вставляет через буфер - это важно").
function PhotoPicker({ photos, onChange, maxPhotos = MAX_PHOTOS }: PhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [lowResFlags, setLowResFlags] = useState<boolean[]>([]);

  useEffect(() => {
    const urls = photos.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);

    let cancelled = false;
    Promise.all(
      urls.map(
        (url) =>
          new Promise<boolean>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(Math.min(img.naturalWidth, img.naturalHeight) < LOW_RES_THRESHOLD_PX);
            img.onerror = () => resolve(false);
            img.src = url;
          }),
      ),
    ).then((flags) => {
      if (!cancelled) setLowResFlags(flags);
    });

    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photos]);

  function addPhotos(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    onChange([...photos, ...images].slice(0, maxPhotos));
  }

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (photos.length >= maxPhotos) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      const pastedFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) pastedFiles.push(file);
        }
      }
      if (pastedFiles.length > 0) {
        event.preventDefault();
        addPhotos(pastedFiles);
      }
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- addPhotos closes over photos/onChange fresh on each render; re-subscribing every render is intentional here, not worth memoizing for a low-frequency event.
  }, [photos, onChange]);

  function removePhoto(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {previewUrls.map((url, index) => (
          <div key={url} className="relative aspect-square overflow-hidden rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- client-side object URL preview, not a static asset */}
            <img src={url} alt={`Фото ${index + 1}`} className="h-full w-full object-cover" />
            {lowResFlags[index] && (
              <span className="absolute bottom-1 left-1 right-1 rounded bg-warning/90 px-1 py-0.5 text-center text-[9px] font-medium leading-tight text-white">
                Маленькое фото — в PDF будет нечётким
              </span>
            )}
            <button
              type="button"
              onClick={() => removePhoto(index)}
              aria-label="Убрать фото"
              className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-error"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {photos.length < maxPhotos && (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragOver(false);
              addPhotos(Array.from(event.dataTransfer.files ?? []));
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center transition-colors",
              isDragOver ? "border-primary bg-primary/5" : "border-border bg-surface hover:border-primary/30",
            )}
          >
            <ImagePlus className="h-4 w-4 text-text-secondary" />
            <span className="px-1 text-[10px] leading-tight text-text-secondary">Вставить (Ctrl+V) или выбрать</span>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(event) => {
          addPhotos(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <p className="text-[11px] text-text-secondary">До {maxPhotos} фото товара.</p>
    </div>
  );
}

export { PhotoPicker, MAX_PHOTOS, LOW_RES_THRESHOLD_PX };
