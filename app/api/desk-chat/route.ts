import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { hasDeskSession } from "@/lib/desk-auth";
import { isRateLimited } from "@/lib/rate-limit";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Ported from panda-bridge-desk.html's reference system prompt, adapted to
// Panda Bridge's actual scope (full ecosystem — sourcing, factory, logistics,
// fulfillment, academy — not just logistics/customs as the original demo copy said).
const SYSTEM_PROMPT = `Ты — Panda AI, внутренний ассистент менеджеров компании Panda Bridge — экосистемы
для бизнеса с Китаем (поиск поставщиков и товара, производство, логистика, таможенное оформление,
фулфилмент, обучение). Отвечай кратко и по делу на русском языке, помогай с письмами клиентам и
поставщикам, расчётами и рабочими вопросами. Используй Markdown, где уместны списки или выделение —
для удобства чтения.

Важно: ты не умеешь сама формировать и присылать .docx-отчёты прямо в этом чате. Готовые отчёты
«Анализ ниши», «Анализ конкурентов» и «Анализ трендов» генерируются отдельным инструментом на вкладке
«Услуги» рабочего стола. Если менеджер просит тебя сделать один из этих отчётов (например «сделай анализ
ниши для термосов»), не пытайся написать его текстом в чате — объясни, что нужно открыть вкладку «Услуги»,
найти нужную карточку, ввести нишу/товар и нажать «Выполнить услугу»: формирование займёт примерно 1–3
минуты, после чего .docx скачается автоматически.`;

const MAX_HISTORY = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_IMAGE_BASE64_LENGTH = 6_000_000;

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

function parseImageDataUrl(
  dataUrl: string,
): { mediaType: Anthropic.Base64ImageSource["media_type"]; data: string } | null {
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
        { type: "text", text: message.content || "Проанализируй это изображение." },
      ],
    };
  });
}

function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

export async function POST(req: NextRequest) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const ip = getClientIp(req);
  if (isRateLimited(`desk-chat:${ip}`, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS)) {
    return Response.json({ error: "Слишком много запросов. Подождите немного." }, { status: 429 });
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

  const trimmedMessages = messages.slice(-MAX_HISTORY);
  const lastMessage = trimmedMessages[trimmedMessages.length - 1];

  if (lastMessage?.image && !parseImageDataUrl(lastMessage.image)) {
    return Response.json(
      { error: "Не удалось обработать изображение. Поддерживаются JPEG, PNG, WebP до ~4.5MB." },
      { status: 400 },
    );
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: toAnthropicMessages(trimmedMessages),
    });

    const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");

    if (!text) {
      console.error("Desk chat: empty response", { stopReason: response.stop_reason });
      return Response.json({ error: "Не удалось получить ответ. Попробуйте ещё раз." }, { status: 500 });
    }

    return Response.json({ reply: text });
  } catch (error) {
    console.error("Desk chat error:", error);
    return Response.json({ error: "Не удалось получить ответ. Попробуйте ещё раз." }, { status: 500 });
  }
}
