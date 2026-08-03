import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerClient } from "@/lib/manager-scope";
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

async function loadVisibleClient(clientId: string, session: NonNullable<Awaited<ReturnType<typeof getManagerSessionFromRequest>>>) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return null;
  if (!(await canAccessManagerClient(session, client))) {
    return null;
  }
  return client;
}

// Per-client document store — contracts, invoice scans, client-supplied
// specs, etc. Same shape as /api/manager-files ("База данных"), but scoped
// to one client's relatedId and gated by the same client-visibility check
// every other manager-clients/[id] route already uses.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id: clientId } = await params;
  const client = await loadVisibleClient(clientId, session);
  if (!client) {
    return Response.json({ error: "Клиент не найден." }, { status: 404 });
  }

  const files = await prisma.deskFile.findMany({
    where: { tab: "manager_client_files", relatedId: clientId },
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

  const { id: clientId } = await params;
  const client = await loadVisibleClient(clientId, session);
  if (!client) {
    return Response.json({ error: "Клиент не найден." }, { status: 404 });
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
      tab: "manager_client_files",
      relatedId: clientId,
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
