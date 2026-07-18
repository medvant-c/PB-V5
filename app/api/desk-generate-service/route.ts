import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { hasDeskSession } from "@/lib/desk-auth";
import { isRateLimited } from "@/lib/rate-limit";
import { getDeskServiceConfig, type ServiceConfig } from "@/lib/desk-services/registry";
import {
  REPORT_TOOL_NAME,
  buildReportTool,
  normalizeServiceReportPayload,
  type ServiceReportPayload,
} from "@/lib/desk-services/schema";
import { renderServiceReport } from "@/lib/desk-services/render";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const MAX_INPUT_LENGTH = 200;
// Reports with many large tables (esp. trend-analysis) occasionally make
// Claude emit a malformed/stringified "sections" field under generation
// pressure — a probabilistic structured-output quirk, not a deterministic
// bug. One automatic retry recovers almost all of these.
const MAX_GENERATION_ATTEMPTS = 2;

function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

function sanitizeFileNamePart(text: string): string {
  return text.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 60);
}

async function generateReportPayload(
  config: ServiceConfig,
  input: string,
): Promise<ServiceReportPayload | null> {
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    let response;
    try {
      // These reports (esp. trend-analysis, many large tables) can take several
      // minutes to generate. A plain non-streaming create() sits on one idle
      // connection for that whole time and has been observed to hit the
      // client's request timeout with no retry — streaming keeps the
      // connection alive via incremental events, which is what Anthropic
      // recommends for long-running large max_tokens requests.
      response = await anthropic.messages
        .stream({
          model: "claude-sonnet-5",
          max_tokens: 12000,
          system: config.systemPrompt,
          messages: [{ role: "user", content: `Тема отчёта: ${input}` }],
          tools: [buildReportTool("указанное в системном промпте количество")],
          tool_choice: { type: "tool", name: REPORT_TOOL_NAME },
        })
        .finalMessage();
    } catch (error) {
      console.error("Desk generate-service: request failed", config.id, attempt, error);
      continue;
    }

    const toolUseBlock = response.content.find(
      (block) => block.type === "tool_use" && block.name === REPORT_TOOL_NAME,
    );

    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      console.error("Desk generate-service: no tool_use block", {
        serviceId: config.id,
        attempt,
        stopReason: response.stop_reason,
      });
      continue;
    }

    const payload = normalizeServiceReportPayload(toolUseBlock.input);
    if (payload) return payload;

    console.error(
      "Desk generate-service: invalid payload",
      config.id,
      attempt,
      response.stop_reason,
      JSON.stringify(toolUseBlock.input, null, 2),
    );
  }
  return null;
}

export async function POST(req: NextRequest) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const ip = getClientIp(req);
  if (isRateLimited(`desk-generate-service:${ip}`, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS)) {
    return Response.json({ error: "Слишком много запросов. Подождите немного." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const serviceId = (body as { serviceId?: unknown })?.serviceId;
  const input = (body as { input?: unknown })?.input;

  if (typeof serviceId !== "string" || typeof input !== "string" || !input.trim()) {
    return Response.json({ error: "Укажите нишу или товар." }, { status: 400 });
  }
  if (input.length > MAX_INPUT_LENGTH) {
    return Response.json({ error: `Слишком длинный запрос (максимум ${MAX_INPUT_LENGTH} символов).` }, { status: 400 });
  }

  const config = getDeskServiceConfig(serviceId);
  if (!config) {
    return Response.json({ error: "Неизвестная услуга." }, { status: 400 });
  }

  try {
    const payload = await generateReportPayload(config, input.trim());
    if (!payload) {
      return Response.json({ error: "Не удалось сформировать отчёт. Попробуйте ещё раз." }, { status: 500 });
    }

    // Claude reliably omits title/subtitle from the tool call (see schema.ts) —
    // fall back to the user's own input and the service's default subtitle.
    const resolvedPayload = {
      ...payload,
      title: payload.title ?? input.trim(),
      subtitle: payload.subtitle ?? config.defaultSubtitle,
    };

    const docxBuffer = await renderServiceReport(config.label, resolvedPayload);
    const fileName = `${sanitizeFileNamePart(config.fileNamePrefix)} — ${sanitizeFileNamePart(input.trim())}.docx`;

    return new Response(new Uint8Array(docxBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    console.error("Desk generate-service error:", error);
    return Response.json({ error: "Не удалось сформировать отчёт. Попробуйте ещё раз." }, { status: 500 });
  }
}
