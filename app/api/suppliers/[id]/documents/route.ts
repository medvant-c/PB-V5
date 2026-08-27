import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

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

// Документы поставщика (прайс-листы, договоры и т.п.) — отдельно от фото
// витрины (app/api/suppliers/route.ts). Без scoping кроме сессии — «База
// поставщиков» общая для всех менеджеров, тот же принцип, что и сами
// поставщики/фото. См. PB-V5 chat 2026-08-27.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id: supplierId } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) return Response.json({ error: "Поставщик не найден." }, { status: 404 });

  const files = await prisma.deskFile.findMany({
    where: { tab: "supplier_document", relatedId: supplierId },
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

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id: supplierId } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) return Response.json({ error: "Поставщик не найден." }, { status: 404 });

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
      tab: "supplier_document",
      relatedId: supplierId,
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
