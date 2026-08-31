import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { search1688ByImage, BhapiError } from "@/lib/bhapi-client";
import { resolvePublicPhotoToken } from "@/lib/desk-services/product-search-photo-tokens";

// Поиск на 1688 по загруженному ранее фото (см. /api/product-lookup/photo).
// Принимает publicUrl напрямую (минтится там же, при загрузке фото) — не
// нужно заново резолвить токен здесь, только использовать его. Резолвим
// его отдельно лишь для быстрой проверки, что ссылка ещё жива, прежде чем
// тратить запрос к bhapi.
export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const publicUrl = (body as { publicUrl?: unknown })?.publicUrl;
  if (typeof publicUrl !== "string" || !publicUrl.trim()) {
    return Response.json({ error: "Не указана ссылка на фото. Загрузите фото ещё раз." }, { status: 400 });
  }
  const token = publicUrl.trim().split("/").pop() ?? "";
  if (!resolvePublicPhotoToken(token)) {
    return Response.json({ error: "Ссылка на фото истекла — загрузите фото заново." }, { status: 400 });
  }

  try {
    const items = await search1688ByImage(publicUrl.trim());
    return Response.json({ items });
  } catch (error) {
    const message = error instanceof BhapiError ? error.message : "Не удалось выполнить поиск по фото на 1688.";
    return Response.json({ error: message }, { status: 502 });
  }
}
