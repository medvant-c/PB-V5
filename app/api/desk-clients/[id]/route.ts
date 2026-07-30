import { NextRequest } from "next/server";
import { hasDeskSession } from "@/lib/desk-auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Covers both actions from the desk client-detail panel: toggling
// active/deactivated (client can no longer log into /account while
// inactive — see app/api/account-login/route.ts) and editing the profile
// fields a manager might need to fix or fill in later (e.g. country/city on
// an older client created before those fields existed).
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const { active, name, phone, country, city } =
    (body as { active?: unknown; name?: unknown; phone?: unknown; country?: unknown; city?: unknown }) ?? {};

  const data: {
    active?: boolean;
    name?: string;
    phone?: string | null;
    country?: string | null;
    city?: string | null;
  } = {};

  if (active !== undefined) {
    if (typeof active !== "boolean") {
      return Response.json({ error: "Некорректное значение." }, { status: 400 });
    }
    data.active = active;
  }
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return Response.json({ error: "Укажите имя." }, { status: 400 });
    }
    data.name = name.trim();
  }
  if (phone !== undefined) {
    if (typeof phone === "string" && phone.trim()) {
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        return Response.json({ error: "Укажите номер телефона полностью: +7 (XXX) XXX-XX-XX." }, { status: 400 });
      }
      data.phone = normalizedPhone;
    } else {
      data.phone = null;
    }
  }
  if (country !== undefined) {
    data.country = typeof country === "string" && country.trim() ? country.trim() : null;
  }
  if (city !== undefined) {
    data.city = typeof city === "string" && city.trim() ? city.trim() : null;
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "Нечего обновлять." }, { status: 400 });
  }

  try {
    const client = await prisma.client.update({ where: { id }, data });
    return Response.json({ client: { ...client, passwordHash: undefined } });
  } catch {
    return Response.json({ error: "Клиент не найден." }, { status: 404 });
  }
}
