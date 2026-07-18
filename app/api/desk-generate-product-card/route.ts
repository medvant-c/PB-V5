import Anthropic from "@anthropic-ai/sdk";
import JSZip from "jszip";
import { NextRequest } from "next/server";
import { hasDeskSession } from "@/lib/desk-auth";
import { isRateLimited } from "@/lib/rate-limit";
import {
  PRODUCT_CARD_TOOL_NAME,
  buildProductCardTool,
  normalizeProductCardPayload,
  type ProductCardPayload,
} from "@/lib/desk-services/product-card-schema";
import { renderProductCardBrief } from "@/lib/desk-services/product-card-render";
import { generateProductPhoto, COMPANY_SLIDE_BRIEF } from "@/lib/desk-services/generate-product-photo";
import { createJob, updateJob } from "@/lib/desk-services/product-card-jobs";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const MAX_GENERATION_ATTEMPTS = 2;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CONTEXT_LENGTH = 200;
const MAX_SPEC_TEXT_LENGTH = 4000;
const SUPPORTED_IMAGE_TYPES = new Set<string>(["image/jpeg", "image/png", "image/gif", "image/webp"]);

// Structure generalized from an approved reference deck (built for a car
// jump-starter — hero / power+compressor / compatibility+package / trust+
// specs) into a pattern that adapts to any Panda Bridge client's product,
// not just that one example. The shared visual design system itself
// (colors, typography, cards, icons, logo placement, safe margins) lives in
// lib/desk-services/generate-product-photo.ts and applies identically
// regardless of what Claude puts in each brief here.
const SYSTEM_PROMPT = `Ты — старший дизайнер премиальных карточек товаров для маркетплейсов (Wildberries,
Ozon, Amazon) в стиле Apple/DJI/Anker/Baseus, работаешь для Panda Bridge — экосистемы для бизнеса с Китаем.
Менеджер прислал фото товара и характеристики (скриншотом или текстом). Определи товар и подготовь содержание для 4 из
5 слайдов премиальной презентации (5-й фирменный слайд о самой Panda Bridge добавляется отдельно, не
описывай его). Слайды вертикальные (примерно 3:4) — вместе они должны выглядеть как единый премиальный
каталог одного бренда: одинаковый визуальный язык, разное только содержание.

Структура 4 слайдов (ровно 4, в этом порядке; если у товара меньше функций, чем пунктов ниже — раскрой
разные грани одного и того же реального преимущества, НЕ выдумывай несуществующие функции):
1. Hero — главный слайд, самый насыщенный: короткий заголовок с главным УТП (3-5 слов, вторая строка
   градиентом), под ним короткий подзаголовок-пояснение (3-6 слов). Слева — вертикальный список ИЗ 3-4
   карточек-фич (закруглённый "стеклянный" блок на каждую): в каждой — цветной кружок с тонкой иконкой,
   рядом название функции заглавными буквами (2-3 слова) и под ним конкретное значение с числом и единицей
   измерения (например "12V / 1500A", "до 150 PSI", "до 12000 mAh") — только из подтверждённых характеристик,
   без обобщений вроде "мощный". Справа — товар крупным планом. Внизу слайда — отдельная горизонтальная
   плашка с тонкой цветной рамкой на 3-4 ячейки, в каждой: иконка + крупное число с единицей измерения +
   короткая подпись под ним (например "1500A / Пиковый ток"). Числа и подписи каждой ячейки указывай отдельно
   и явно в textOverlay — этот слайд должен выглядеть плотно заполненным конкретными цифрами, а не пустым.
2. Ключевые преимущества — 2 самые сильные измеримые характеристики товара (мощность/ёмкость/скорость/вес
   и т.п.), каждая крупной цифрой в своём блоке, с контекстным фоном по теме этих характеристик. Если у
   товара только одна измеримая цифра — раскрой вторую грань того же преимущества другими словами, не
   выдумывай новую характеристику.
3. Применение и комплектация — слева "Идеален для" со сценариями использования/совместимости, каждый со
   своей тонкой иконкой и коротким подписанным словом (2-3 иконки); справа "Что в комплекте" — аккуратная
   разложенная композиция предметов из комплекта с номерами под каждым (если у товара нет комплекта из
   нескольких предметов — замени правую часть на "Гарантия / сертификация / материалы").
4. Характеристики и доверие — компактная таблица технических характеристик из присланного скриншота/текста
   (5-8 строк "параметр — значение") + акцент на качестве и надёжности материалов/сборки.

Для каждого слайда в textOverlay пропиши ПОЛНЫЙ текст построчно (каждый элемент — с новой строки): заголовок
(3-5 слов), название каждого блока-фичи (2-3 слова) и его числовое значение отдельной строкой. Текста должно
быть мало и он должен быть коротким — меньше слов значит меньше риск ошибок при генерации. Весь текст —
только из подтверждённых характеристик/фото, ничего не выдумывай — это касается и артикула/модели товара:
если в характеристиках или на фото не указан конкретный номер модели, не придумывай и не пиши никакой
(бренд с упаковки/корпуса, если он виден на фото, указывать можно, но не изобретай отдельный код товара).
Проверь каждое слово на отсутствие опечаток перед тем как его написать.
В purpose — короткое название темы слайда, в composition — что показать на фото товара и как скомпоновать
блоки, в notes — на что обратить внимание при генерации именно этого слайда.

НЕ используй запрещённые модерацией маркетплейсов превосходные степени без подтверждения ("лучший",
"самый качественный").

Также подготовь продающее описание (2-4 абзаца, выгоды, а не только свойства), SEO-описание (естественно
насыщено релевантными запросами) и ключевые слова.

Пиши на русском языке, по делу, без "воды".`;

async function generateProductCardPayload(
  imageBlocks: Anthropic.ImageBlockParam[],
  context: string,
  specText: string,
): Promise<ProductCardPayload | null> {
  const textParts = [
    specText ? `Характеристики товара (введены менеджером вручную):\n${specText}` : null,
    context ? `Дополнительный контекст от менеджера: ${context}` : null,
  ].filter((part): part is string => Boolean(part));

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    let response;
    try {
      response = await anthropic.messages
        .stream({
          model: "claude-sonnet-5",
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                ...imageBlocks,
                {
                  type: "text",
                  text: textParts.length > 0 ? textParts.join("\n\n") : "Определи товар по фото и характеристикам.",
                },
              ],
            },
          ],
          tools: [buildProductCardTool()],
          tool_choice: { type: "tool", name: PRODUCT_CARD_TOOL_NAME },
        })
        .finalMessage();
    } catch (error) {
      console.error("Desk generate-product-card: request failed", attempt, error);
      continue;
    }

    const toolUseBlock = response.content.find(
      (block) => block.type === "tool_use" && block.name === PRODUCT_CARD_TOOL_NAME,
    );
    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      console.error("Desk generate-product-card: no tool_use block", { attempt, stopReason: response.stop_reason });
      continue;
    }

    const payload = normalizeProductCardPayload(toolUseBlock.input);
    if (payload) return payload;

    console.error(
      "Desk generate-product-card: invalid payload",
      attempt,
      response.stop_reason,
      JSON.stringify(toolUseBlock.input, null, 2),
    );
  }
  return null;
}

function sanitizeFileNamePart(text: string): string {
  return text.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 60);
}

// The OpenAI org's gpt-image-1 tier is rate-limited to a handful of
// concurrent images/minute — firing all slide generations at once (as a
// single Promise.all) reliably hits that limit and drops slides. Batching
// keeps concurrency safely under it; generate-product-photo.ts also retries
// once on a 429 as a second line of defense for edge-of-window timing.
const IMAGE_GENERATION_BATCH_SIZE = 3;

async function generateImagesInBatches<T>(
  items: T[],
  generate: (item: T, index: number) => Promise<Buffer | null>,
  onSlideDone?: (completed: number, total: number) => void,
) {
  const results: (Buffer | null)[] = [];
  let completed = 0;
  for (let start = 0; start < items.length; start += IMAGE_GENERATION_BATCH_SIZE) {
    const batch = items.slice(start, start + IMAGE_GENERATION_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (item, i) => {
        const result = await generate(item, start + i);
        completed += 1;
        onSlideDone?.(completed, items.length);
        return result;
      }),
    );
    results.push(...batchResults);
  }
  return results;
}

function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

async function fileToBuffer(file: File): Promise<Buffer | null> {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES) return null;
  return Buffer.from(await file.arrayBuffer());
}

function bufferToImageBlock(buffer: Buffer, mimeType: string): Anthropic.ImageBlockParam {
  return {
    type: "image",
    source: { type: "base64", media_type: mimeType as Anthropic.Base64ImageSource["media_type"], data: buffer.toString("base64") },
  };
}

// Runs the whole brief → images → packaging pipeline for one job, updating
// job state as it goes so the client can poll real progress instead of
// staring at a static "please wait" message for 5-10 minutes. Not awaited by
// the request handler — kicked off and left to run against the job store.
async function runProductCardJob(
  jobId: string,
  imageBlocks: Anthropic.ImageBlockParam[],
  context: string,
  specText: string,
  productPhotoBuffer: Buffer,
  productPhotoMimeType: string,
) {
  try {
    const payload = await generateProductCardPayload(imageBlocks, context, specText);
    if (!payload) {
      updateJob(jobId, { status: "error", error: "Не удалось сформировать бриф. Попробуйте ещё раз." });
      return;
    }

    // Slide 10 — the fixed "universal company slide" — is appended here
    // (never generated by Claude) so both the docx brief and the image
    // generation loop below naturally include it as the 10th and final slide.
    const resolvedPayload = {
      ...payload,
      productTitle: payload.productTitle ?? "Товар",
      photoBriefs: [...payload.photoBriefs, COMPANY_SLIDE_BRIEF],
    };
    const docxBuffer = await renderProductCardBrief(resolvedPayload);
    const safeTitle = sanitizeFileNamePart(resolvedPayload.productTitle);

    updateJob(jobId, { stage: "images", totalSlides: resolvedPayload.photoBriefs.length });

    // Real photo generation only runs if OPENAI_API_KEY is configured — falls
    // back to the .docx brief alone otherwise (or if every generation call
    // fails), same fail-soft pattern used for Resend elsewhere in the app.
    let generatedPhotos: { buffer: Buffer; name: string }[] = [];
    if (process.env.OPENAI_API_KEY) {
      const results = await generateImagesInBatches(
        resolvedPayload.photoBriefs,
        (brief, i) => generateProductPhoto(productPhotoBuffer, productPhotoMimeType, resolvedPayload.productTitle, brief, i),
        (completed, total) => updateJob(jobId, { completedSlides: completed, totalSlides: total }),
      );
      generatedPhotos = results
        .map((buffer, i) =>
          buffer ? { buffer, name: `Слайд ${i + 1} — ${sanitizeFileNamePart(resolvedPayload.photoBriefs[i].purpose)}.png` } : null,
        )
        .filter((item): item is { buffer: Buffer; name: string } => item !== null);
    }

    updateJob(jobId, { stage: "packaging" });

    let finalBuffer: Buffer;
    let finalFileName: string;
    let finalMimeType: string;

    if (generatedPhotos.length === 0) {
      finalBuffer = docxBuffer;
      finalFileName = `Карточка товара — ${safeTitle}.docx`;
      finalMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else {
      const zip = new JSZip();
      zip.file(`Карточка товара — ${safeTitle}.docx`, docxBuffer);
      for (const photo of generatedPhotos) zip.file(photo.name, photo.buffer);
      finalBuffer = await zip.generateAsync({ type: "nodebuffer" });
      finalFileName = `Карточка товара — ${safeTitle}.zip`;
      finalMimeType = "application/zip";
    }

    // Unlike the old synchronous response, persistence is now the ONLY way
    // to hand the finished file to the client (the job model has nothing to
    // stream it through) — a storage/DB failure here has to fail the job,
    // not be swallowed as best-effort like it could be when the buffer was
    // also returned directly in the same response.
    const stored = await storage.upload(finalBuffer, finalFileName);
    const record = await prisma.productCardExport.create({
      data: {
        productTitle: resolvedPayload.productTitle,
        fileName: finalFileName,
        storageKey: stored.key,
        mimeType: finalMimeType,
        size: stored.size,
      },
    });

    updateJob(jobId, { status: "done", exportId: record.id });
  } catch (error) {
    console.error("Desk generate-product-card job failed:", jobId, error);
    updateJob(jobId, { status: "error", error: "Не удалось сформировать карточку. Попробуйте ещё раз." });
  }
}

export async function POST(req: NextRequest) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const ip = getClientIp(req);
  if (isRateLimited(`desk-generate-product-card:${ip}`, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS)) {
    return Response.json({ error: "Слишком много запросов. Подождите немного." }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const productPhoto = formData.get("productPhoto");
  const specScreenshot = formData.get("specScreenshot");
  const specTextRaw = formData.get("specText");
  const specText = typeof specTextRaw === "string" ? specTextRaw.trim().slice(0, MAX_SPEC_TEXT_LENGTH) : "";
  const contextRaw = formData.get("context");
  const context = typeof contextRaw === "string" ? contextRaw.trim().slice(0, MAX_CONTEXT_LENGTH) : "";

  if (!(productPhoto instanceof File)) {
    return Response.json({ error: "Загрузите фото товара." }, { status: 400 });
  }
  if (!(specScreenshot instanceof File) && !specText) {
    return Response.json({ error: "Добавьте характеристики товара — скриншотом или текстом." }, { status: 400 });
  }

  const productPhotoBuffer = await fileToBuffer(productPhoto);
  if (!productPhotoBuffer) {
    return Response.json({ error: "Фото товара должно быть изображением (JPEG/PNG/GIF/WebP) до 8MB." }, { status: 400 });
  }

  const imageBlocks = [bufferToImageBlock(productPhotoBuffer, productPhoto.type)];
  if (specScreenshot instanceof File) {
    const specScreenshotBuffer = await fileToBuffer(specScreenshot);
    if (!specScreenshotBuffer) {
      return Response.json(
        { error: "Скриншот характеристик должен быть изображением (JPEG/PNG/GIF/WebP) до 8MB." },
        { status: 400 },
      );
    }
    imageBlocks.push(bufferToImageBlock(specScreenshotBuffer, specScreenshot.type));
  }

  const jobId = crypto.randomUUID();
  createJob(jobId);
  void runProductCardJob(jobId, imageBlocks, context, specText, productPhotoBuffer, productPhoto.type);

  return Response.json({ jobId }, { status: 202 });
}
