import "server-only";
import sharp from "sharp";

// Список/превью-миниатюры (36–80px в CSS, максимум ~260px в hover-превью)
// раньше грузили и декодировали оригинал фото 1:1 — телефонная фотография
// в 3–8 МБ ради квадратика 36×36px. При десятках просчётов в списке это
// означало десятки одновременных многомегабайтных загрузок и декодирований
// — прямая причина зависаний и медленной загрузки на мобильных. 256px с
// запасом хватает под retina (2x) для любого из этих мест. См. PB-V5 chat
// 2026-08-10.
const THUMBNAIL_MAX_SIZE = 256;
const THUMBNAIL_JPEG_QUALITY = 72;

async function renderPhotoThumbnail(original: Buffer): Promise<Buffer> {
  return sharp(original)
    .rotate() // читает EXIF-ориентацию из оригинала до ресайза, чтобы миниатюра не оказалась повёрнутой
    .resize({ width: THUMBNAIL_MAX_SIZE, height: THUMBNAIL_MAX_SIZE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: THUMBNAIL_JPEG_QUALITY })
    .toBuffer();
}

export { renderPhotoThumbnail };
