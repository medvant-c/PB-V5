import { NextRequest } from "next/server";
import { storage } from "@/lib/storage";
import { resolvePublicPhotoToken } from "@/lib/desk-services/product-search-photo-tokens";

interface RouteParams {
  params: Promise<{ token: string }>;
}

// Единственный роут в «Автопоиске товаров» БЕЗ проверки сессии — сторонний
// сервис bhapi.ru должен сам скачать эту картинку для поиска по
// изображению на 1688, у него нет нашей cookie. Защита — не сессия, а сам
// токен: случайная непредсказуемая строка с TTL (см.
// lib/desk-services/product-search-photo-tokens.ts), тот же принцип, что у
// app/api/telegram-cny-rate-webhook (секрет вместо сессии).
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { token } = await params;
  const resolved = resolvePublicPhotoToken(token);
  if (!resolved) {
    return Response.json({ error: "Ссылка не найдена или истекла." }, { status: 404 });
  }

  const buffer = await storage.get(resolved.storageKey);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": resolved.mimeType,
      "Cache-Control": "no-store",
    },
  });
}
