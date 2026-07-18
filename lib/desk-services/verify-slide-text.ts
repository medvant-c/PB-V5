import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { coerceToString, normalizeStringArray } from "@/lib/desk-services/schema";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TEXT_CHECK_TOOL_NAME = "report_text_check";

interface TextCheckResult {
  matches: boolean;
  issues: string[];
}

function buildTextCheckTool(): Anthropic.Tool {
  return {
    name: TEXT_CHECK_TOOL_NAME,
    description: "Report whether the text actually rendered on a slide image matches the intended text, with no typos or garbled characters.",
    input_schema: {
      type: "object",
      properties: {
        matches: {
          type: "boolean",
          description:
            "true only if every word of visible text on the image is spelled correctly and matches the intended text, with no typos, missing/extra letters, or garbled characters. Minor line-wrapping or rewording differences that don't change spelling are fine — only flag actual spelling/rendering errors.",
        },
        issues: {
          type: "array",
          items: { type: "string" },
          description: "Short list of specific problems found, e.g. 'PANGA BRIDOF instead of PANDA BRIDGE'. Empty array if matches is true.",
        },
      },
      required: ["matches", "issues"],
    },
  };
}

function normalizeTextCheckResult(value: unknown): TextCheckResult | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.matches !== "boolean") return null;
  return { matches: v.matches, issues: normalizeStringArray(v.issues) ?? [] };
}

// Catches the Cyrillic-text-rendering typos gpt-image-1 reliably introduces
// (garbled letters, dropped/duplicated characters, mangled brand names).
// Traditional OCR struggles with this specific failure mode because the
// text is stylized (glow, gradients, unusual weights) rather than the clean
// printed text OCR engines are tuned for — a vision-capable LLM reading the
// image and comparing it against the intended copy catches these far more
// reliably. Best-effort: any failure here (network, malformed tool response)
// is treated as "couldn't verify" rather than blocking the slide — the
// caller ships what it has instead of failing the export over a check that
// itself broke.
async function verifySlideText(imageBuffer: Buffer, intendedText: string): Promise<TextCheckResult | null> {
  const trimmed = coerceToString(intendedText)?.trim();
  if (!trimmed) return { matches: true, issues: [] };

  try {
    const response = await anthropic.messages
      .stream({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: imageBuffer.toString("base64") } },
              {
                type: "text",
                text: `This is a generated marketplace product slide. Read every piece of text actually visible on
the image (headline, labels, numbers, captions — everything). The intended text content for this slide was:

${trimmed}

Compare what's actually visible on the image against this intended text. Flag any typos, misspellings,
garbled/malformed characters, or missing/duplicated letters — even small ones. Do not flag differences in
line-wrapping, capitalization style, or minor rewording that doesn't change spelling.`,
              },
            ],
          },
        ],
        tools: [buildTextCheckTool()],
        tool_choice: { type: "tool", name: TEXT_CHECK_TOOL_NAME },
      })
      .finalMessage();

    const toolUseBlock = response.content.find((block) => block.type === "tool_use" && block.name === TEXT_CHECK_TOOL_NAME);
    if (!toolUseBlock || toolUseBlock.type !== "tool_use") return null;

    return normalizeTextCheckResult(toolUseBlock.input);
  } catch (error) {
    console.error("Desk generate-product-card: text verification failed", error);
    return null;
  }
}

export { verifySlideText };
export type { TextCheckResult };
