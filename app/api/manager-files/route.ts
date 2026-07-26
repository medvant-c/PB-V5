import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
]);

// "База данных" tab — a shared team file store, not scoped to a manager's
// own clients, so every manager (of any role) sees the same list. Mirrors
// app/api/desk-files but gated by the manager-cabinet session instead of
// the old shared /desk password, since that session type has no bearing
// here.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const files = await prisma.deskFile.findMany({
    where: { tab: "manager_database" },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      uploadedAt: true,
      uploadedByManagerId: true,
      uploadedByManager: { select: { name: true } },
    },
  });

  return Response.json({ files, viewerManagerId: session.managerId, viewerRole: session.role });
}

export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Файл не найден в запросе." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: "Файл слишком большой (максимум 100MB)." }, { status: 400 });
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
      tab: "manager_database",
      storageKey: stored.key,
      originalName: file.name,
      mimeType: file.type,
      size: stored.size,
      uploadedByManagerId: session.managerId,
    },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      uploadedAt: true,
      uploadedByManagerId: true,
      uploadedByManager: { select: { name: true } },
    },
  });

  return Response.json({ file: record }, { status: 201 });
}
