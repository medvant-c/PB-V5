import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { searchWbByKeyword, getWbItemByUrl, BhapiError } from "@/lib/bhapi-client";
import { extractWeightAndDimensions } from "@/lib/desk-services/wb-product-props-parser";

// Поиск WB (POST /wb/api/v1/search) не отдаёт ни картинку, ни
// вес/габариты в результатах — только полная карточка товара
// (item/by-url) их знает. Чтобы менеджер видел фото прямо в списке
// кандидатов, докидываем карточку на каждый результат отдельным
// запросом — раз уж всё равно её запрашиваем, заодно сразу парсим из неё
// вес/габариты (см. wb-product-props-parser.ts), чтобы выбор кандидата
// на фронте был мгновенным, без второго похода к bhapi за тем же товаром.
// Выдачу намеренно ограничиваем небольшим числом кандидатов (6, не 12) —
// это и так удваивает число запросов к bhapi.ru, важно на бесплатном
// тарифе (50 запросов/мес на парсер). Одна карточка, не найденная/
// сбойная, не должна ронять всю выдачу — просто без фото/веса. См. PB-V5
// chat 2026-08-31.
const RESULTS_WITH_IMAGES = 6;

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
    const result = await searchWbByKeyword(query.trim(), RESULTS_WITH_IMAGES);
    const products = await Promise.all(
      result.products.map(async (p) => {
        try {
          const item = await getWbItemByUrl(p.link);
          return {
            ...p,
            imageUrl: item.images[0] ?? null,
            title: item.title || p.description,
            dimensions: extractWeightAndDimensions(item.productProps),
          };
        } catch {
          return { ...p, imageUrl: null, title: p.description, dimensions: null };
        }
      }),
    );
    return Response.json({ ...result, products });
  } catch (error) {
    const message = error instanceof BhapiError ? error.message : "Не удалось выполнить поиск на Wildberries.";
    return Response.json({ error: message }, { status: 502 });
  }
}
