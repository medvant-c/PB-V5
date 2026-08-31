import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { search1688ByKeyword, BhapiError } from "@/lib/bhapi-client";

// Запасной вариант поиска на 1688, пока поиск по фото
// (cross-border/search-by-image) недоступен на стороне bhapi.ru — по
// названию товара, тот же список кандидатов на выбор. См. PB-V5 chat
// 2026-08-31.
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
  const keyword = (body as { keyword?: unknown })?.keyword;
  if (typeof keyword !== "string" || !keyword.trim()) {
    return Response.json({ error: "Укажите название товара для поиска." }, { status: 400 });
  }

  try {
    const items = await search1688ByKeyword(keyword.trim());
    return Response.json({ items });
  } catch (error) {
    const message = error instanceof BhapiError ? error.message : "Не удалось выполнить поиск на 1688.";
    return Response.json({ error: message }, { status: 502 });
  }
}
