import "server-only";
import type { Paragraph, Table } from "docx";
import { body, buildDocxBuffer, bulletList, calloutBox, coverPage, dataTable, heading, note, spacer } from "@/lib/desk-services/docx-helpers";
import type { ServiceReportPayload } from "@/lib/desk-services/schema";

interface ResolvedServiceReportPayload extends ServiceReportPayload {
  title: string;
  subtitle: string;
}

async function renderServiceReport(serviceLabel: string, payload: ResolvedServiceReportPayload): Promise<Buffer> {
  const tocItems = [
    "Executive summary",
    ...payload.sections.map((s) => s.heading.replace(/^\d+\.\s*/, "")),
    "Источники и методология",
  ];

  const children: (Paragraph | Table)[] = [
    ...coverPage(serviceLabel, payload.title, payload.subtitle, tocItems),
    heading("Executive summary"),
    calloutBox("Главный вывод", payload.executiveSummaryConclusion),
    spacer(),
    dataTable(payload.executiveSummaryTable.headers, payload.executiveSummaryTable.rows),
  ];

  for (const section of payload.sections) {
    children.push(heading(section.heading));
    for (const paragraph of section.paragraphs ?? []) {
      children.push(body(paragraph));
    }
    if (section.bullets?.length) {
      children.push(...bulletList(section.bullets));
    }
    if (section.table) {
      children.push(dataTable(section.table.headers, section.table.rows));
    }
    if (section.calloutTitle && section.calloutText) {
      children.push(spacer());
      children.push(calloutBox(section.calloutTitle, section.calloutText));
    }
    if (section.note) {
      children.push(note(section.note));
    }
  }

  children.push(heading("Источники и методология"));
  children.push(body(payload.sourcesIntro));
  children.push(...bulletList(payload.sources));
  children.push(note(payload.disclaimer));

  return buildDocxBuffer(children);
}

export { renderServiceReport };
