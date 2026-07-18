import "server-only";
import type Anthropic from "@anthropic-ai/sdk";

// Generic shape shared by all AI-generated service reports (Анализ ниши,
// Анализ конкурентов, Анализ трендов, and any future ones) — modeled directly
// on the three real sample reports (public/documents/analiz-*-primer.pdf):
// cover + executive summary (conclusion + parameter table) + N numbered
// sections (intro text / bullets / table / callout) + sources.
// One shared schema + renderer means adding a new AI-generated service later
// is just a new registry entry, not new plumbing.

interface ReportTable {
  headers: string[];
  rows: string[][];
}

interface ReportSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: ReportTable;
  calloutTitle?: string;
  calloutText?: string;
  note?: string;
}

interface ServiceReportPayload {
  // Optional: Claude reliably omits these two from the tool call despite
  // being simple fields (observed repeatedly in testing) — the caller
  // supplies safe fallbacks (the user's own input + a per-service default
  // subtitle) rather than depending on the model to echo them back.
  title?: string;
  subtitle?: string;
  executiveSummaryConclusion: string;
  executiveSummaryTable: ReportTable;
  sections: ReportSection[];
  sourcesIntro: string;
  sources: string[];
  disclaimer: string;
}

const REPORT_TOOL_NAME = "present_report";

const reportTableSchema = {
  type: "object",
  properties: {
    headers: { type: "array", items: { type: "string" } },
    rows: {
      type: "array",
      items: { type: "array", items: { type: "string" } },
    },
  },
  required: ["headers", "rows"],
};

const reportSectionSchema = {
  type: "object",
  properties: {
    heading: { type: "string", description: "Заголовок раздела, например '2. Сегментация ниши по типам товаров'." },
    paragraphs: { type: "array", items: { type: "string" }, description: "Вводные абзацы текста перед таблицей/списком, если уместно." },
    bullets: { type: "array", items: { type: "string" }, description: "Маркированный список, если для раздела уместнее список, чем таблица." },
    table: reportTableSchema,
    calloutTitle: { type: "string", description: "Заголовок для выделенной врезки (например 'Точка роста', 'Свободная зона'), если уместно." },
    calloutText: { type: "string" },
    note: { type: "string", description: "Мелкая курсивная сноска-оговорка под таблицей (методология/ограничения оценки)." },
  },
  required: ["heading"],
};

function buildReportTool(sectionCount: string): Anthropic.Tool {
  return {
    name: REPORT_TOOL_NAME,
    description: "Показать структурированный отчёт по запрошенной услуге в виде разделов с таблицами и списками.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Название темы отчёта, например 'Товары для чая и чайных церемоний'." },
        subtitle: { type: "string", description: "Короткий подзаголовок, описывающий охват отчёта одной строкой." },
        executiveSummaryConclusion: {
          type: "string",
          description: "Главный вывод отчёта — 2-4 предложения, аналогично 'Главный вывод' в примерах Panda Bridge.",
        },
        executiveSummaryTable: {
          ...reportTableSchema,
          description: "Таблица 'Параметр / Оценка' с 4-6 ключевыми параметрами, headers должны быть ['Параметр', 'Оценка'].",
        },
        sections: {
          type: "array",
          items: reportSectionSchema,
          description: `Ровно ${sectionCount} пронумерованных разделов отчёта по порядку, каждый с заголовком вида 'N. Название'.`,
        },
        sourcesIntro: { type: "string", description: "Короткое вводное предложение к разделу источников." },
        sources: { type: "array", items: { type: "string" }, description: "Список источников/методологии, 3-6 пунктов." },
        disclaimer: {
          type: "string",
          description: "Финальная сноска о том, что это AI-сгенерированный ориентировочный отчёт, а не выгрузка из платных аналитических систем.",
        },
      },
      required: [
        "executiveSummaryConclusion",
        "executiveSummaryTable",
        "sections",
        "sourcesIntro",
        "sources",
        "disclaimer",
      ],
    },
  };
}

// Claude's structured output occasionally emits a number/boolean for a field
// the schema declared as a string (e.g. a seasonality index as 45 instead of
// "45") even though the JSON schema says string — a known tool-use quirk.
// Coerce scalars instead of hard-rejecting the whole report over one cell.
function coerceToString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  for (const item of value) {
    const coerced = coerceToString(item);
    if (coerced === null) return null;
    result.push(coerced);
  }
  return result;
}

function normalizeReportTable(value: unknown): ReportTable | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const headers = normalizeStringArray(v.headers);
  if (!headers || !Array.isArray(v.rows)) return null;
  const rows: string[][] = [];
  for (const row of v.rows) {
    const normalizedRow = normalizeStringArray(row);
    if (!normalizedRow) return null;
    rows.push(normalizedRow);
  }
  return { headers, rows };
}

function normalizeReportSection(value: unknown): ReportSection | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const heading = coerceToString(v.heading);
  if (!heading) return null;

  const section: ReportSection = { heading };

  if (v.paragraphs !== undefined) {
    const paragraphs = normalizeStringArray(v.paragraphs);
    if (!paragraphs) return null;
    section.paragraphs = paragraphs;
  }
  if (v.bullets !== undefined) {
    const bullets = normalizeStringArray(v.bullets);
    if (!bullets) return null;
    section.bullets = bullets;
  }
  if (v.table !== undefined) {
    const table = normalizeReportTable(v.table);
    if (!table) return null;
    section.table = table;
  }
  if (v.calloutTitle !== undefined) {
    const calloutTitle = coerceToString(v.calloutTitle);
    if (calloutTitle === null) return null;
    section.calloutTitle = calloutTitle;
  }
  if (v.calloutText !== undefined) {
    const calloutText = coerceToString(v.calloutText);
    if (calloutText === null) return null;
    section.calloutText = calloutText;
  }
  if (v.note !== undefined) {
    const note = coerceToString(v.note);
    if (note === null) return null;
    section.note = note;
  }
  return section;
}

function normalizeServiceReportPayload(value: unknown): ServiceReportPayload | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;

  const title = coerceToString(v.title) ?? undefined;
  const subtitle = coerceToString(v.subtitle) ?? undefined;
  const executiveSummaryConclusion = coerceToString(v.executiveSummaryConclusion);
  const executiveSummaryTable = normalizeReportTable(v.executiveSummaryTable);
  const sourcesIntro = coerceToString(v.sourcesIntro);
  const sources = normalizeStringArray(v.sources);
  const disclaimer = coerceToString(v.disclaimer);

  if (
    !executiveSummaryConclusion ||
    !executiveSummaryTable ||
    !Array.isArray(v.sections) ||
    !sourcesIntro ||
    !sources ||
    !disclaimer
  ) {
    return null;
  }

  const sections: ReportSection[] = [];
  for (const rawSection of v.sections) {
    const section = normalizeReportSection(rawSection);
    if (!section) return null;
    sections.push(section);
  }
  if (sections.length === 0) return null;

  return {
    title,
    subtitle,
    executiveSummaryConclusion,
    executiveSummaryTable,
    sections,
    sourcesIntro,
    sources,
    disclaimer,
  };
}

export { REPORT_TOOL_NAME, buildReportTool, normalizeServiceReportPayload, coerceToString, normalizeStringArray };
export type { ServiceReportPayload, ReportSection, ReportTable };
