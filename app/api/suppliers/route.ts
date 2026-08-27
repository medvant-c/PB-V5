import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { nextSupplierDisplayId } from "@/lib/display-ids";

const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function optionalString(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// «База поставщиков» — общий справочник, доступен всем менеджерам без
// ролевых ограничений (тот же принцип, что POST /api/manager-clients).
// См. план mellow-forging-kay.md, PB-V5 chat 2026-08-23.
//
// ?categoryId= — поставщики одной категории (обычный просмотр).
// ?q= — сквозной поиск по всем категориям сразу (название, описание,
// реквизиты, контакты) — менеджер не обязан помнить, в какой из ~45
// категорий лежит нужный поставщик. Фильтрация в JS, а не через Prisma
// `contains` — SQLite LIKE регистронезависим только для ASCII, а
// названия/контакты по-русски. Данных мало (внутренний справочник), так
// что full scan в памяти не проблема. См. PB-V5 chat 2026-08-27.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const categoryId = req.nextUrl.searchParams.get("categoryId");
  const q = req.nextUrl.searchParams.get("q")?.trim() || null;
  if (!categoryId && !q) {
    return Response.json({ error: "Не указана категория или поисковый запрос." }, { status: 400 });
  }

  let suppliers = await prisma.supplier.findMany({
    where: categoryId ? { categoryId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      createdByManager: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, emoji: true } },
    },
  });

  if (q) {
    const needle = q.toLowerCase();
    suppliers = suppliers.filter((s) =>
      [s.name, s.description, s.paymentInfo, s.location, s.contactPerson, s.wechat, s.whatsapp, s.email, s.phone].some((value) =>
        value?.toLowerCase().includes(needle),
      ),
    );
  }

  // DeskFile — общий tab+relatedId дискриминатор, не прямая Prisma-связь
  // (тот же паттерн, что фото просчёта в app/api/manager-quotes/[id]/route.ts) —
  // один батч-запрос на все фото сразу, не один на поставщика.
  const photos = await prisma.deskFile.findMany({
    where: { tab: "supplier_showcase", relatedId: { in: suppliers.map((s) => s.id) } },
    select: { id: true, relatedId: true },
  });
  const firstPhotoIdBySupplier = new Map<string, string>();
  for (const photo of photos) {
    if (photo.relatedId && !firstPhotoIdBySupplier.has(photo.relatedId)) firstPhotoIdBySupplier.set(photo.relatedId, photo.id);
  }

  return Response.json({
    suppliers: suppliers.map((s) => ({
      id: s.id,
      displayId: s.displayId,
      name: s.name,
      description: s.description,
      paymentInfo: s.paymentInfo,
      location: s.location,
      contactPerson: s.contactPerson,
      wechat: s.wechat,
      whatsapp: s.whatsapp,
      email: s.email,
      phone: s.phone,
      createdAt: s.createdAt,
      createdByManager: s.createdByManager,
      category: s.category,
      previewPhotoId: firstPhotoIdBySupplier.get(s.id) ?? null,
    })),
  });
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

  const categoryId = optionalString(formData.get("categoryId"));
  const name = optionalString(formData.get("name"));
  if (!categoryId) return Response.json({ error: "Не указана категория." }, { status: 400 });
  if (!name) return Response.json({ error: "Укажите название поставщика." }, { status: 400 });

  const category = await prisma.supplierCategory.findUnique({ where: { id: categoryId } });
  if (!category) return Response.json({ error: "Категория не найдена." }, { status: 404 });

  const supplier = await prisma.supplier.create({
    data: {
      displayId: await nextSupplierDisplayId(),
      categoryId,
      name,
      description: optionalString(formData.get("description")),
      paymentInfo: optionalString(formData.get("paymentInfo")),
      location: optionalString(formData.get("location")),
      contactPerson: optionalString(formData.get("contactPerson")),
      wechat: optionalString(formData.get("wechat")),
      whatsapp: optionalString(formData.get("whatsapp")),
      email: optionalString(formData.get("email")),
      phone: optionalString(formData.get("phone")),
      createdByManagerId: session.managerId,
    },
  });

  // Фото — best-effort, как и у фото просчёта (app/api/manager-quotes/route.ts):
  // ошибка загрузки одной картинки не должна терять уже созданную запись.
  for (let i = 0; i < MAX_PHOTOS; i++) {
    const photo = formData.get(`photo${i}`);
    if (!(photo instanceof File)) continue;
    if (!SUPPORTED_IMAGE_TYPES.has(photo.type) || photo.size > MAX_PHOTO_BYTES) continue;
    try {
      const buffer = Buffer.from(await photo.arrayBuffer());
      const stored = await storage.upload(buffer, photo.name);
      await prisma.deskFile.create({
        data: {
          tab: "supplier_showcase",
          relatedId: supplier.id,
          storageKey: stored.key,
          originalName: photo.name,
          mimeType: photo.type,
          size: stored.size,
          uploadedByManagerId: session.managerId,
        },
      });
    } catch (error) {
      console.error("Supplier: photo upload failed", error);
    }
  }

  return Response.json({ supplier }, { status: 201 });
}
