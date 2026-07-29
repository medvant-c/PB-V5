import { NextRequest } from "next/server";
import { getClientIdFromRequest } from "@/lib/client-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { nextQuoteDraftRequestDisplayId } from "@/lib/display-ids";

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_FILES = 5;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

// The client-facing counterpart to the manager-authored QuoteDraftRequest
// ("Черновики") — a client submits "ТЗ на просчёт" themselves from
// /account (description + optional quantity + reference photo/spec
// files), landing in the same manager-side queue with managerId left null
// (see schema comment) so managers see it flagged "создано клиентом"
// instead of guessing. See PB-V5 chat 2026-07-29.
export async function GET(req: NextRequest) {
  const clientId = await getClientIdFromRequest(req);
  if (!clientId) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const drafts = await prisma.quoteDraftRequest.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
  const files = await prisma.deskFile.findMany({
    where: { tab: "quote_draft_request", relatedId: { in: drafts.map((d) => d.id) } },
    select: { id: true, relatedId: true, originalName: true, mimeType: true, size: true },
  });
  const filesByDraftId = new Map<string, typeof files>();
  for (const file of files) {
    const list = filesByDraftId.get(file.relatedId!) ?? [];
    list.push(file);
    filesByDraftId.set(file.relatedId!, list);
  }

  return Response.json({
    drafts: drafts.map((d) => ({ ...d, files: filesByDraftId.get(d.id) ?? [] })),
  });
}

export async function POST(req: NextRequest) {
  const clientId = await getClientIdFromRequest(req);
  if (!clientId) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const note = formData.get("note");
  if (typeof note !== "string" || !note.trim()) {
    return Response.json({ error: "Опишите, что нужно посчитать." }, { status: 400 });
  }

  const quantityRaw = formData.get("quantity");
  let quantity: number | null = null;
  if (typeof quantityRaw === "string" && quantityRaw.trim()) {
    const parsed = Number(quantityRaw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return Response.json({ error: "Количество должно быть положительным числом." }, { status: 400 });
    }
    quantity = Math.round(parsed);
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length > MAX_FILES) {
    return Response.json({ error: `Можно приложить не больше ${MAX_FILES} файлов.` }, { status: 400 });
  }
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: `Файл «${file.name}» слишком большой (максимум 100MB).` }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return Response.json(
        { error: `Файл «${file.name}»: недопустимый тип. Разрешены PDF, DOC(X), XLS(X), PNG, JPG, WEBP.` },
        { status: 400 },
      );
    }
  }

  const draft = await prisma.quoteDraftRequest.create({
    data: {
      displayId: await nextQuoteDraftRequestDisplayId(),
      clientId,
      managerId: null,
      note: note.trim(),
      quantity,
    },
  });

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storage.upload(buffer, file.name);
    await prisma.deskFile.create({
      data: {
        tab: "quote_draft_request",
        relatedId: draft.id,
        storageKey: stored.key,
        originalName: file.name,
        mimeType: file.type,
        size: stored.size,
      },
    });
  }

  return Response.json({ draft }, { status: 201 });
}
