import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { searchWbByKeyword, BhapiError } from "@/lib/bhapi-client";

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
  const query = (body as { query?: unknown })?.query;
  if (typeof query !== "string" || !query.trim()) {
    return Response.json({ error: "Укажите название товара для поиска." }, { status: 400 });
  }

  try {
    const result = await searchWbByKeyword(query.trim());
    return Response.json(result);
  } catch (error) {
    const message = error instanceof BhapiError ? error.message : "Не удалось выполнить поиск на Wildberries.";
    return Response.json({ error: message }, { status: 502 });
  }
}
