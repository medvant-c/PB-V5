import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getWbItemByUrl, BhapiError } from "@/lib/bhapi-client";
import { extractWeightAndDimensions } from "@/lib/desk-services/wb-product-props-parser";

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
    return Response.json({ error: "Укажите ссылку на товар Wildberries." }, { status: 400 });
  }

  try {
    const item = await getWbItemByUrl(url.trim());
    const dimensions = extractWeightAndDimensions(item.productProps);
    return Response.json({ item, dimensions });
  } catch (error) {
    const message = error instanceof BhapiError ? error.message : "Не удалось получить карточку товара Wildberries.";
    return Response.json({ error: message }, { status: 502 });
  }
}
