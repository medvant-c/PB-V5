"use client";

import { X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface PhotoLightboxProps {
  // URL самого файла (напр. `/api/manager-quotes/photos/${id}`) — фото
  // отдаётся сервером в оригинальном разрешении без сжатия (см.
  // app/api/manager-quotes/photos/[photoId]/route.ts), так что здесь
  // показывается ровно то, что менеджер загрузил, без потери качества.
  src: string | null;
  onClose: () => void;
}

// Полноразмерный просмотр фото по клику — раньше "увеличение" фото
// зависело от нативного зума браузера (двойной тап на мобильном), что
// работает непредсказуемо и растягивает саму маленькую превьюшку, а не
// показывает оригинал. Здесь — обычный клик/тап открывает диалог с
// оригинальным файлом, работает одинаково на десктопе и мобильном.
// См. PB-V5 chat 2026-08-08.
function PhotoLightbox({ src, onClose }: PhotoLightboxProps) {
  return (
    <Dialog open={src !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-w-[95vw] items-center justify-center border-none bg-transparent p-0 shadow-none sm:max-w-[90vw]"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Фото товара</DialogTitle>
        {src && (
          // eslint-disable-next-line @next/next/no-img-element -- session-gated API route, not a static asset
          <img src={src} alt="Фото товара" className="max-h-[85vh] max-w-full rounded-lg object-contain" />
        )}
        {/* Свой крестик вместо стандартного из DialogContent — тот
            рассчитан на светлый фон карточки, здесь же под ним произвольное
            фото (может быть и светлым, и тёмным), поэтому нужен тот же
            непрозрачный тёмный кружок, что уже используется для крестиков
            поверх фото в quote-dialog.tsx/photo-picker.tsx. */}
        <DialogClose
          aria-label="Закрыть"
          className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/90"
        >
          <X className="h-4 w-4" />
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

export { PhotoLightbox };
