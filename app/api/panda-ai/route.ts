import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { isRateLimited, peekRateLimited, recordRequest } from "@/lib/rate-limit";
import { isValidAccessCode } from "@/lib/access-codes";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `Ты — Panda AI, встроенный помощник экосистемы Panda Bridge
(Panda Start, Panda Business, Panda Factory, Panda Logistics, Panda Fulfillment,
Panda Academy). Твоя задача — помогать пользователям сайта разобраться в продуктах
экосистемы, объяснять как начать бизнес с Китаем, отвечать на вопросы про поиск
товара, поставщиков, логистику, таможню, маркетплейсы, сезонность и спрос, и
когда уместно — генерировать готовые документы: письма поставщикам, коммерческие
предложения, описания товаров для карточек.

Про анализ товара/ниши/бюджета (текстовые вопросы):
- Если вопрос касается выбора товара, ниши, сезонности спроса, поиска фабрики
  или расчёта бюджета (например "какой товар продавать", "сколько нужно денег",
  "найди фабрику для X") — используй инструмент present_analysis вместо обычного
  текста: 3-7 коротких пунктов с сутью анализа/рекомендации, и если уместно —
  ровно 2 ключевые метрики (например бюджет и срок выхода в прибыль, или число
  найденных вариантов и срок подбора) — не больше и не меньше двух, если метрики
  вообще уместны, иначе не включай их совсем.
- Это ориентир по общей практике рынка, а не гарантированный прогноз продаж
  конкретного продавца — если нужна оговорка об этом, укажи её в поле note
  коротко (1 предложение), а не выдавай общие рассуждения за точные цифры.
- Для казуальных вопросов, объяснений и генерации документов (ниже) этот
  инструмент не используй — отвечай обычным текстом.

Про анализ фото товара:
- Если пользователь прислал фото товара — используй инструмент
  present_product_analysis и заполни все поля: что за товар, есть ли у него
  сезонность, стоит ли его продавать и почему, риски, примерный потенциальный
  доход в месяц, уровень конкуренции, советы по продвижению на маркетплейсах и
  готовое продающее описание для карточки товара.
- Оценки (доход, конкуренция, риски) — ориентир на основе визуального
  распознавания и общих знаний о категории и рынке, а не данные живого анализа
  маркетплейсов конкретного продавца. Если фото нечёткое или товар неоднозначен —
  честно скажи это в worth_selling_reason и дай осторожную оценку.

Про генерацию документов:
- Если просят письмо фабрике, коммерческое предложение, описание товара или
  похожий документ — сразу пиши готовый черновик целиком, а не план из пунктов,
  и не через present_analysis.
- Оформляй результат в Markdown: заголовок, при необходимости списки и
  выделение ключевых полей жирным — так пользователю проще скопировать готовый
  текст и использовать его.
- Если для документа не хватает конкретики (название товара, объём, сроки,
  реквизиты и т.п.) — сначала кратко уточни 1-2 ключевых пункта, затем сгенерируй
  черновик с плейсхолдерами вида [название компании] на остальное.

Общие правила:
- Отвечай на русском языке, дружелюбно и по делу, без канцелярита.
- Если вопрос выходит за рамки бизнеса с Китаем — вежливо верни разговор в тему
  или предложи связаться с менеджером Panda Bridge.
- Ты пока не имеешь доступа к реальным заказам, складу и данным конкретного
  клиента — если спрашивают про конкретный заказ или отгрузку, предложи написать
  в поддержку или менеджерам.
- Держи обычные ответы компактными: 3-6 предложений или короткий список.
  Для документов это ограничение не действует — там нужен полный текст.
- Если пользователь готов обсудить сотрудничество — предложи оставить заявку
  через форму "Связаться с нами".`;

const ANALYSIS_TOOL: Anthropic.Tool = {
  name: "present_analysis",
  description:
    "Показать структурированный анализ бизнес-вопроса (выбор товара, ниша, сезонность, поиск фабрики, расчёт бюджета) в виде списка пунктов и ключевых метрик — вместо обычного текста.",
  input_schema: {
    type: "object",
    properties: {
      points: {
        type: "array",
        items: { type: "string" },
        description:
          "3-7 коротких пунктов: что проанализировано или что рекомендуется (например 'Анализ спроса и сезонности', 'Рекомендуемая закупка: термосы 500мл').",
      },
      metrics: {
        type: "array",
        maxItems: 2,
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            value: { type: "string" },
          },
          required: ["label", "value"],
        },
        description:
          "Ровно 2 ключевые метрики, например {label: 'Нужно денег', value: '≈ 340 000 ₽'}. Пропусти поле совсем, если для запроса нет уместных числовых ориентиров — не присылай 1 или 3.",
      },
      note: {
        type: "string",
        description: "Необязательная короткая приписка-оговорка или следующий шаг, 1 предложение.",
      },
    },
    required: ["points"],
  },
};

const PRODUCT_ANALYSIS_TOOL: Anthropic.Tool = {
  name: "present_product_analysis",
  description: "Показать структурированный анализ товара по присланному фото.",
  input_schema: {
    type: "object",
    properties: {
      product_name: {
        type: "string",
        description: "Краткое определение того, что изображено на фото (что за товар).",
      },
      seasonality: {
        type: "string",
        description:
          "Есть ли сезонность: например 'Да — пик спроса ноябрь-декабрь' или 'Нет, круглогодичный спрос'.",
      },
      worth_selling: {
        type: "string",
        enum: ["стоит", "рискованно", "требует доработки"],
        description: "Вердикт: стоит ли продавать этот товар.",
      },
      worth_selling_reason: {
        type: "string",
        description: "Краткое обоснование вердикта, 1-2 предложения.",
      },
      risks: {
        type: "array",
        items: { type: "string" },
        description: "3-5 ключевых рисков продажи этого товара.",
      },
      potential_earnings: {
        type: "string",
        description: "Примерный диапазон дохода в месяц как ориентир, например '≈ 50 000 – 150 000 ₽/мес'.",
      },
      competition: {
        type: "string",
        enum: ["низкая", "средняя", "высокая"],
        description: "Уровень конкуренции по этой категории товара.",
      },
      promotion_tips: {
        type: "array",
        items: { type: "string" },
        description: "3-5 конкретных советов по продвижению этого товара на маркетплейсах.",
      },
      listing_description: {
        type: "string",
        description: "Готовое продающее описание товара для карточки на маркетплейсе, 3-5 предложений.",
      },
    },
    required: [
      "product_name",
      "seasonality",
      "worth_selling",
      "worth_selling_reason",
      "risks",
      "potential_earnings",
      "competition",
      "promotion_tips",
      "listing_description",
    ],
  },
};

interface AnalysisPayload {
  points: string[];
  metrics?: { label: string; value: string }[];
  note?: string;
}

function isAnalysisPayload(value: unknown): value is AnalysisPayload {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Array.isArray((value as { points?: unknown }).points) &&
    (value as { points: unknown[] }).points.every((point) => typeof point === "string")
  );
}

function buildFallbackText(analysis: AnalysisPayload): string {
  const pointLines = analysis.points.map((point) => `• ${point}`).join("\n");
  const metricsLine = (analysis.metrics ?? [])
    .map((metric) => `${metric.label}: ${metric.value}`)
    .join(" | ");
  return [pointLines, metricsLine, analysis.note].filter(Boolean).join("\n\n");
}

interface ProductAnalysisPayload {
  product_name: string;
  seasonality: string;
  worth_selling: string;
  worth_selling_reason: string;
  risks: string[];
  potential_earnings: string;
  competition: string;
  promotion_tips: string[];
  listing_description: string;
}

function isProductAnalysisPayload(value: unknown): value is ProductAnalysisPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.product_name === "string" &&
    typeof v.seasonality === "string" &&
    typeof v.worth_selling === "string" &&
    typeof v.worth_selling_reason === "string" &&
    Array.isArray(v.risks) &&
    v.risks.every((item) => typeof item === "string") &&
    typeof v.potential_earnings === "string" &&
    typeof v.competition === "string" &&
    Array.isArray(v.promotion_tips) &&
    v.promotion_tips.every((item) => typeof item === "string") &&
    typeof v.listing_description === "string"
  );
}

function buildProductAnalysisFallbackText(analysis: ProductAnalysisPayload): string {
  return [
    `Товар: ${analysis.product_name}`,
    `Сезонность: ${analysis.seasonality}`,
    `Стоит ли продавать (${analysis.worth_selling}): ${analysis.worth_selling_reason}`,
    `Риски:\n${analysis.risks.map((risk) => `• ${risk}`).join("\n")}`,
    `Потенциальный доход: ${analysis.potential_earnings}`,
    `Конкуренция: ${analysis.competition}`,
    `Советы по продвижению:\n${analysis.promotion_tips.map((tip) => `• ${tip}`).join("\n")}`,
    `Описание для карточки:\n${analysis.listing_description}`,
  ].join("\n\n");
}

const MAX_HISTORY = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

// Trial quota for the public demo widget — separate from the burst-abuse
// limiter above. Keeps API costs bounded and nudges serious prospects toward
// "Связаться с нами" instead of unlimited free use of a real paid API key.
const TRIAL_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const TRIAL_LIMIT_MAX_REQUESTS = 3;
const TRIAL_LIMIT_MESSAGE =
  "Вы использовали все вопросы тестовой версии Panda AI (лимит — 3 вопроса). " +
  "Чтобы получить полноценный доступ к AI для вашего бизнеса — свяжитесь с нами, и мы откроем доступ.";

// Message length cap for the free/trial dialog only — bounds input-token cost
// and discourages pasting whole documents into the demo. Doesn't apply once
// a valid access code is present.
const FREE_MESSAGE_MAX_LENGTH = 1000;
const FREE_MESSAGE_TOO_LONG_MESSAGE =
  "Сообщение слишком длинное для бесплатной версии (максимум 1000 символов). " +
  "Сократите вопрос или свяжитесь с нами для полного доступа без ограничений.";

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_IMAGE_BASE64_LENGTH = 6_000_000; // ~4.5MB raw — keeps the Anthropic request comfortably under its image limit

function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  image?: string;
}

function isValidMessages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        (item.image === undefined || typeof item.image === "string"),
    )
  );
}

function parseImageDataUrl(dataUrl: string): { mediaType: Anthropic.Base64ImageSource["media_type"]; data: string } | null {
  const match = /^data:(image\/[a-zA-Z]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const [, mediaType, data] = match;
  if (!SUPPORTED_IMAGE_TYPES.has(mediaType) || data.length > MAX_IMAGE_BASE64_LENGTH) return null;
  return { mediaType: mediaType as Anthropic.Base64ImageSource["media_type"], data };
}

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages.map((message) => {
    const parsedImage = message.image ? parseImageDataUrl(message.image) : null;
    if (!parsedImage) {
      return { role: message.role, content: message.content };
    }
    return {
      role: message.role,
      content: [
        { type: "image", source: { type: "base64", media_type: parsedImage.mediaType, data: parsedImage.data } },
        { type: "text", text: message.content || "Проанализируй этот товар для продажи на маркетплейсах." },
      ],
    };
  });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(ip, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS)) {
    return Response.json(
      { error: "Слишком много запросов. Подождите немного и попробуйте снова." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const messages = (body as { messages?: unknown })?.messages;
  if (!isValidMessages(messages)) {
    return Response.json({ error: "Некорректный формат сообщений." }, { status: 400 });
  }

  const hasAccessCode = isValidAccessCode((body as { accessCode?: unknown })?.accessCode);
  const trialKey = `trial:${ip}`;
  if (!hasAccessCode && peekRateLimited(trialKey, TRIAL_LIMIT_WINDOW_MS, TRIAL_LIMIT_MAX_REQUESTS)) {
    return Response.json({ error: TRIAL_LIMIT_MESSAGE, limitReached: true }, { status: 403 });
  }

  const trimmedMessages = messages.slice(-MAX_HISTORY);
  const lastMessage = trimmedMessages[trimmedMessages.length - 1];

  if (!hasAccessCode && lastMessage && lastMessage.content.length > FREE_MESSAGE_MAX_LENGTH) {
    return Response.json({ error: FREE_MESSAGE_TOO_LONG_MESSAGE }, { status: 400 });
  }

  if (lastMessage?.image && !parseImageDataUrl(lastMessage.image)) {
    return Response.json(
      { error: "Не удалось обработать изображение. Попробуйте другое фото (JPEG, PNG или WebP, до ~4.5MB)." },
      { status: 400 },
    );
  }

  const hasImage = Boolean(lastMessage?.image);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: toAnthropicMessages(trimmedMessages),
      tools: hasImage ? [PRODUCT_ANALYSIS_TOOL] : [ANALYSIS_TOOL],
      ...(hasImage ? { tool_choice: { type: "tool", name: "present_product_analysis" } } : {}),
    });

    const productToolUseBlock = response.content.find(
      (block) => block.type === "tool_use" && block.name === "present_product_analysis",
    );

    if (productToolUseBlock && productToolUseBlock.type === "tool_use") {
      if (!isProductAnalysisPayload(productToolUseBlock.input)) {
        console.error("Panda AI: invalid present_product_analysis payload", {
          stopReason: response.stop_reason,
          input: productToolUseBlock.input,
        });
        return Response.json(
          { error: "Не удалось разобрать ответ AI. Попробуйте ещё раз или другое фото." },
          { status: 500 },
        );
      }
      if (!hasAccessCode) recordRequest(trialKey);
      return Response.json({
        reply: buildProductAnalysisFallbackText(productToolUseBlock.input),
        productAnalysis: productToolUseBlock.input,
      });
    }

    const toolUseBlock = response.content.find(
      (block) => block.type === "tool_use" && block.name === "present_analysis",
    );

    if (toolUseBlock && toolUseBlock.type === "tool_use") {
      if (!isAnalysisPayload(toolUseBlock.input)) {
        console.error("Panda AI: invalid present_analysis payload", {
          stopReason: response.stop_reason,
          input: toolUseBlock.input,
        });
        return Response.json(
          { error: "Не удалось разобрать ответ AI. Попробуйте ещё раз." },
          { status: 500 },
        );
      }
      if (!hasAccessCode) recordRequest(trialKey);
      return Response.json({
        reply: buildFallbackText(toolUseBlock.input),
        analysis: toolUseBlock.input,
      });
    }

    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");

    if (!text) {
      console.error("Panda AI: empty response", {
        stopReason: response.stop_reason,
        content: response.content,
      });
      return Response.json(
        { error: "Не удалось получить ответ. Попробуйте ещё раз." },
        { status: 500 },
      );
    }

    if (!hasAccessCode) recordRequest(trialKey);
    return Response.json({ reply: text });
  } catch (error) {
    console.error("Panda AI error:", error);
    return Response.json(
      { error: "Не удалось получить ответ. Попробуйте ещё раз." },
      { status: 500 },
    );
  }
}
