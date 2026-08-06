import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Owner/senior-only sign-off on a manager's manual "производство под
// заказ" fee override (Quote.customProductionFeeRubOverride) — same
// reasoning as confirm-search-fee/route.ts: 100% margin, feeds straight
// into the manager's own premium, no external cost to cross-check.
// Confirming here is proof-only. Re-confirmable.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json(
      { error: "Подтвердить ручную стоимость производства под заказ может только старший менеджер или руководитель." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote || quote.deletedAt) {
    return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  }
  if (quote.customProductionFeeRubOverride === null) {
    return Response.json({ error: "У этого просчёта нет ручной стоимости производства под заказ." }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const file = formData.get("file");
  if (file instanceof File) {
    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: "Файл слишком большой (максимум 8MB)." }, { status: 400 });
    }
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      return Response.json({ error: "Недопустимый тип файла. Разрешены: PNG, JPG, WEBP, GIF." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storage.upload(buffer, file.name);
    await prisma.deskFile.create({
      data: {
        tab: "quote_custom_production_fee_proof",
        relatedId: quote.id,
        storageKey: stored.key,
        originalName: file.name,
        mimeType: file.type,
        size: stored.size,
        uploadedByManagerId: session.managerId,
      },
    });
  }

  const updated = await prisma.quote.update({
    where: { id },
    data: {
      customProductionFeeOverrideConfirmed: true,
      customProductionFeeOverrideConfirmedByManagerId: session.managerId,
      customProductionFeeOverrideConfirmedAt: new Date(),
    },
    select: {
      id: true,
      customProductionFeeOverrideConfirmed: true,
      customProductionFeeOverrideConfirmedAt: true,
    },
  });

  return Response.json({ quote: updated });
}
