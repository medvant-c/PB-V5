import { NextRequest } from "next/server";
import sharp from "sharp";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { storage } from "@/lib/storage";
import { mintPublicPhotoToken } from "@/lib/desk-services/product-search-photo-tokens";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Загрузка фото товара для «Автопоиска товаров» — используется и как
// hero-фото итогового PDF, и (через publicUrl) как источник для поиска по
// изображению на 1688. См. lib/desk-services/product-search-photo-tokens.ts
// для того, зачем нужна отдельная неавторизованная ссылка.
export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const photo = formData.get("photo");
  if (!(photo instanceof File)) {
    return Response.json({ error: "Файл не найден в запросе." }, { status: 400 });
  }
  if (!SUPPORTED_IMAGE_TYPES.has(photo.type)) {
    return Response.json({ error: "Недопустимый тип файла. Разрешены: JPG, PNG, WEBP, GIF." }, { status: 400 });
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return Response.json({ error: "Файл слишком большой (максимум 8MB)." }, { status: 400 });
  }

  // Всегда перегоняем в JPEG независимо от исходного формата — react-pdf
  // (renderQuotePdf, см. lib/desk-services/quote-pdf.tsx) умеет JPEG/PNG,
  // но молча не отрисовывает WEBP/GIF (пустой блок вместо ошибки,
  // проверено на реальном экспорте, PB-V5 chat 2026-08-31). Заодно
  // упрощает /1688-search — bhapi.ru точно получит формат, который сам же
  // умеет разобрать.
  const originalBuffer = Buffer.from(await photo.arrayBuffer());
  const buffer = await sharp(originalBuffer).jpeg({ quality: 92 }).toBuffer();
  const stored = await storage.upload(buffer, "photo.jpg");
  const token = mintPublicPhotoToken(stored.key, "image/jpeg");
  const publicUrl = new URL(`/api/product-lookup/public-photo/${token}`, req.url).toString();

  return Response.json({ storageKey: stored.key, publicUrl });
}
