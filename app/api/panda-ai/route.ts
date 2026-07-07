import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `Ты — Panda AI, встроенный помощник экосистемы Panda Bridge
(Panda Start, Panda Business, Panda Factory, Panda Logistics, Panda Fulfillment,
Panda Academy). Твоя задача — помогать пользователям сайта разобраться в продуктах
экосистемы, объяснять как начать бизнес с Китаем, отвечать на вопросы про поиск
товара, поставщиков, логистику, таможню, маркетплейсы, и когда уместно —
генерировать черновики документов, писем поставщикам, описаний товаров.

Правила:
- Отвечай на русском языке, дружелюбно и по делу, без канцелярита.
- Если вопрос выходит за рамки бизнеса с Китаем — вежливо верни разговор в тему
  или предложи связаться с менеджером Panda Bridge.
- Ты пока не имеешь доступа к реальным заказам, складу и данным конкретного
  клиента — если спрашивают про конкретный заказ или отгрузку, предложи написать
  в поддержку или менеджерам.
- Держи ответы компактными: 3-6 предложений или короткий список, если не просят
  подробный разбор.
- Если пользователь готов обсудить сотрудничество — предложи оставить заявку
  через форму "Связаться с нами".`;

const MAX_HISTORY = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(ip, timestamps);
    return true;
  }

  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return false;
}

function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
        typeof item.content === "string",
    )
  );
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
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

  const trimmedMessages = messages.slice(-MAX_HISTORY);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: trimmedMessages,
    });

    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");

    return Response.json({ reply: text });
  } catch (error) {
    console.error("Panda AI error:", error);
    return Response.json(
      { error: "Не удалось получить ответ. Попробуйте ещё раз." },
      { status: 500 },
    );
  }
}
