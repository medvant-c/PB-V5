import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Owner/senior-only sign-off on a manager's manual ¥→₽ rate
// (Quote.cnyRateRubOverride) — same "usable now, audited later" split as
// confirm-cargo-rate/route.ts, just without a separate cost input: unlike
// cargo (sell rate vs supplier cost), there's nothing else to enter here —
// this rate already IS what the client is charged, and its profit impact
// already flows through the existing fxProfitRub calc in
// app/api/manager-dashboard/route.ts. Confirming here is proof-only (the
// screenshot). Re-confirmable, same as confirm-cargo-rate.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json(
      { error: "Подтвердить ручной курс юаня может только старший менеджер или руководитель." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) {
    return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  }
  if (quote.cnyRateRubOverride === null) {
    return Response.json({ error: "У этого просчёта нет ручного курса юаня." }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  // Proof screenshot is a nice-to-have, not a hard gate — same reasoning
  // as confirm-cargo-rate/route.ts. See PB-V5 chat 2026-07-31.
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
        tab: "quote_cny_rate_proof",
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
      cnyRateOverrideConfirmed: true,
      cnyRateOverrideConfirmedByManagerId: session.managerId,
      cnyRateOverrideConfirmedAt: new Date(),
    },
    select: {
      id: true,
      cnyRateOverrideConfirmed: true,
      cnyRateOverrideConfirmedAt: true,
    },
  });

  return Response.json({ quote: updated });
}
