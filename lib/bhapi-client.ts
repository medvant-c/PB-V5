import "server-only";

// Тонкая обёртка над bhapi.ru (сторонний сервис парсинга Wildberries/1688) —
// см. план «Автопоиск товаров», PB-V5 chat 2026-08-31. Ключи привязаны к
// конкретному парсеру (отдельный для WB, отдельный для 1688) — два разных
// env var, не один общий токен.

const BHAPI_BASE_URL = "https://bhapi.ru";
// Сервис сам рекомендует таймаут ≥30с на одиночный запрос — image-search
// на практике медленнее обычного поиска, берём с запасом.
const REQUEST_TIMEOUT_MS = 45_000;

function getWbToken(): string {
  const token = process.env.BHAPI_WB_API_TOKEN;
  if (!token) throw new Error("BHAPI_WB_API_TOKEN is not set");
  return token;
}

function get1688Token(): string {
  const token = process.env.BHAPI_1688_API_TOKEN;
  if (!token) throw new Error("BHAPI_1688_API_TOKEN is not set");
  return token;
}

class BhapiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BhapiError";
  }
}

async function bhapiRequest(
  token: string,
  path: string,
  init: { method: "GET" | "POST"; query?: Record<string, string>; body?: Record<string, unknown> },
): Promise<unknown> {
  const url = new URL(path, BHAPI_BASE_URL);
  if (init.query) {
    for (const [key, value] of Object.entries(init.query)) url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: init.method,
      headers: {
        "X-API-Token": token,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new BhapiError(`bhapi.ru: некорректный ответ (HTTP ${res.status}).`);
    }

    if (!res.ok) {
      const detail = (json as { detail?: { message?: string; error?: { message?: string } } })?.detail;
      const message = detail?.message ?? detail?.error?.message ?? `HTTP ${res.status}`;
      throw new BhapiError(`bhapi.ru: ${message}`);
    }
    return json;
  } catch (error) {
    if (error instanceof BhapiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new BhapiError("bhapi.ru не ответил вовремя — попробуйте ещё раз.");
    }
    throw new BhapiError(`bhapi.ru: не удалось связаться с сервисом (${(error as Error).message}).`);
  } finally {
    clearTimeout(timeout);
  }
}

interface WbSearchProduct {
  id: number;
  link: string;
  price: number;
  rating: number;
  feedbacks: number;
  description: string;
}

interface WbSearchResult {
  total: number;
  products: WbSearchProduct[];
}

async function searchWbByKeyword(query: string, maxLinks = 12): Promise<WbSearchResult> {
  const json = (await bhapiRequest(getWbToken(), "/wb/api/v1/search", {
    method: "POST",
    body: { query, max_links: maxLinks },
  })) as { data?: { total?: number; products?: WbSearchProduct[] } };
  return { total: json.data?.total ?? 0, products: json.data?.products ?? [] };
}

interface WbItemDetail {
  itemId: number;
  title: string;
  priceRub: number | null;
  images: string[];
  productProps: Record<string, string>;
}

async function getWbItemByUrl(url: string): Promise<WbItemDetail> {
  const json = (await bhapiRequest(getWbToken(), "/wb/api/v1/item/by-url", {
    method: "GET",
    query: { url },
  })) as {
    data?: {
      data?: {
        item_id?: number;
        title?: string;
        price_info?: { sale_price?: number | null; pre_sale_price?: number | null };
        main_imgs?: string[];
        product_props?: Record<string, string>;
      };
    };
  };
  const data = json.data?.data ?? {};
  return {
    itemId: data.item_id ?? 0,
    title: data.title ?? "",
    priceRub: data.price_info?.sale_price ?? data.price_info?.pre_sale_price ?? null,
    images: data.main_imgs ?? [],
    productProps: data.product_props ?? {},
  };
}

interface Item1688SearchResult {
  itemId: number;
  title: string;
  titleOrigin: string;
  imageUrl: string;
  priceCny: number;
  productUrl: string;
  moq: string;
  companyName: string | null;
}

async function search1688ByImage(imgUrl: string, pageSize = 12): Promise<Item1688SearchResult[]> {
  const json = (await bhapiRequest(get1688Token(), "/1688/api/v2/cross-border/search-by-image", {
    method: "POST",
    body: { img_url: imgUrl, page_size: pageSize },
  })) as { data?: { data?: { items?: Record<string, unknown>[] } } };
  return normalize1688Items(json.data?.data?.items ?? []);
}

async function search1688ByKeyword(keyword: string, pageSize = 12): Promise<Item1688SearchResult[]> {
  const json = (await bhapiRequest(get1688Token(), "/1688/api/v2/cross-border/search-by-keyword", {
    method: "POST",
    body: { keyword, page_size: pageSize },
  })) as { data?: { data?: { items?: Record<string, unknown>[] } } };
  return normalize1688Items(json.data?.data?.items ?? []);
}

function normalize1688Items(items: Record<string, unknown>[]): Item1688SearchResult[] {
  return items.map((item) => ({
    itemId: Number(item.item_id) || 0,
    title: String(item.title ?? ""),
    titleOrigin: String(item.title_origin ?? ""),
    imageUrl: String(item.img ?? ""),
    priceCny: Number((item.price_info as { price?: string })?.price ?? item.price ?? 0),
    productUrl: String(item.product_url ?? ""),
    moq: String(item.moq ?? ""),
    companyName: (item.shop_info as { company_name?: string })?.company_name ?? null,
  }));
}

// Ответ item/detail(-by-url) устроен ИНАЧЕ, чем элемент списка search —
// проверено живым запросом (см. PB-V5 chat 2026-08-31): цена приходит как
// price_info.price (базовая) плюс tiered_price_info.prices (ступени по
// объёму закупки, begin_num — от какого количества действует каждая), а не
// плоское поле price/moq как в результатах поиска.
interface Item1688PriceTier {
  beginAmount: number;
  priceCny: number;
}

interface Item1688Detail {
  itemId: number;
  title: string;
  images: string[];
  basePriceCny: number;
  priceTiers: Item1688PriceTier[];
  shopName: string | null;
  productUrl: string;
}

// Выбирает применимую цену за штуку для заданного количества — берёт
// ступень с наибольшим beginAmount, не превышающим quantity (та же логика
// "highest qualifying tier wins", что и pickCnyRateForTotal в
// lib/quote-engine.ts, просто по количеству штук, а не по объёму в ¥).
function pickTieredPriceCny(tiers: Item1688PriceTier[], quantity: number, fallback: number): number {
  if (tiers.length === 0) return fallback;
  const sorted = [...tiers].sort((a, b) => a.beginAmount - b.beginAmount);
  let applicable = sorted[0].priceCny;
  for (const tier of sorted) {
    if (quantity >= tier.beginAmount) applicable = tier.priceCny;
  }
  return applicable;
}

async function get1688ItemDetailByUrl(url: string): Promise<Item1688Detail | null> {
  const json = (await bhapiRequest(get1688Token(), "/1688/api/v2/item/detail-by-url", {
    method: "POST",
    body: { url, language: "en" },
  })) as { data?: { data?: Record<string, unknown> } };
  const item = json.data?.data;
  if (!item) return null;

  const priceInfo = item.price_info as { price?: string } | undefined;
  const tieredPriceInfo = item.tiered_price_info as { prices?: { beginAmount?: string; price?: string }[] } | undefined;
  const shopInfo = item.shop_info as { shop_name?: string } | undefined;

  return {
    itemId: Number(item.item_id) || 0,
    title: String(item.title ?? ""),
    images: Array.isArray(item.main_imgs) ? (item.main_imgs as string[]) : [],
    basePriceCny: Number(priceInfo?.price ?? 0),
    priceTiers: (tieredPriceInfo?.prices ?? []).map((p) => ({
      beginAmount: Number(p.beginAmount) || 0,
      priceCny: Number(p.price) || 0,
    })),
    shopName: shopInfo?.shop_name ?? null,
    productUrl: String(item.product_url ?? url),
  };
}

export {
  BhapiError,
  searchWbByKeyword,
  getWbItemByUrl,
  search1688ByImage,
  search1688ByKeyword,
  get1688ItemDetailByUrl,
  pickTieredPriceCny,
};
export type { WbSearchProduct, WbItemDetail, Item1688SearchResult, Item1688Detail, Item1688PriceTier };
