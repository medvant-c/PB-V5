import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { get1688ItemDetailByUrl, BhapiError } from "@/lib/bhapi-client";

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
  const url = (body as { url?: unknown })?.url;
  if (typeof url !== "string" || !url.trim()) {
    return Response.json({ error: "Укажите ссылку на товар 1688." }, { status: 400 });
  }

  try {
    const item = await get1688ItemDetailByUrl(url.trim());
    if (!item) {
      return Response.json({ error: "Товар не найден по этой ссылке." }, { status: 404 });
    }
    return Response.json({ item });
  } catch (error) {
    const message = error instanceof BhapiError ? error.message : "Не удалось получить карточку товара 1688.";
    return Response.json({ error: message }, { status: 502 });
  }
}
