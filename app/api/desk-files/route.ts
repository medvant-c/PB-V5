import { NextRequest } from "next/server";
import { DeskFileTab } from "@/generated/prisma/enums";
import { hasDeskSession } from "@/lib/desk-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
]);
const VALID_TABS = new Set<string>(Object.values(DeskFileTab));

export async function GET(req: NextRequest) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const tab = searchParams.get("tab");
  const relatedId = searchParams.get("relatedId");

  if (!tab || !VALID_TABS.has(tab)) {
    return Response.json({ error: "Некорректная вкладка." }, { status: 400 });
  }

  const files = await prisma.deskFile.findMany({
    where: { tab: tab as DeskFileTab, relatedId: relatedId ?? undefined },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      uploadedAt: true,
      tab: true,
      relatedId: true,
    },
  });

  return Response.json({ files });
}

export async function POST(req: NextRequest) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const file = formData.get("file");
  const tab = formData.get("tab");
  const relatedIdRaw = formData.get("relatedId");
  const relatedId = typeof relatedIdRaw === "string" && relatedIdRaw ? relatedIdRaw : null;

  if (!(file instanceof File)) {
    return Response.json({ error: "Файл не найден в запросе." }, { status: 400 });
  }
  if (typeof tab !== "string" || !VALID_TABS.has(tab)) {
    return Response.json({ error: "Некорректная вкладка." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: "Файл слишком большой (максимум 20MB)." }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return Response.json(
      { error: "Недопустимый тип файла. Разрешены: PDF, DOC(X), XLS(X), PNG, JPG." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await storage.upload(buffer, file.name);

  const record = await prisma.deskFile.create({
    data: {
      tab: tab as DeskFileTab,
      relatedId,
      storageKey: stored.key,
      originalName: file.name,
      mimeType: file.type,
      size: stored.size,
    },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      uploadedAt: true,
      tab: true,
      relatedId: true,
    },
  });

  return Response.json({ file: record }, { status: 201 });
}
