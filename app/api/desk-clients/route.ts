import { NextRequest } from "next/server";
import { hasDeskSession } from "@/lib/desk-auth";
import { prisma } from "@/lib/prisma";
import { createAccountToken } from "@/lib/account-tokens";
import { sendActivationEmail } from "@/lib/account-email";
import { nextClientDisplayId } from "@/lib/display-ids";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: NextRequest) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      displayId: true,
      email: true,
      name: true,
      phone: true,
      country: true,
      city: true,
      active: true,
      createdAt: true,
      passwordHash: true,
      orders: { where: { seenByManager: false }, select: { id: true } },
    },
  });

  return Response.json({
    clients: clients.map(({ passwordHash, orders, ...client }) => ({
      ...client,
      activated: passwordHash !== null,
      unseenOrderCount: orders.length,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const { name, email, phone, country, city } =
    (body as { name?: unknown; email?: unknown; phone?: unknown; country?: unknown; city?: unknown }) ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Укажите имя клиента." }, { status: 400 });
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return Response.json({ error: "Укажите корректный email." }, { status: 400 });
  }
  if (typeof phone !== "string" || !phone.trim()) {
    return Response.json({ error: "Укажите телефон." }, { status: 400 });
  }
  if (typeof country !== "string" || !country.trim()) {
    return Response.json({ error: "Укажите страну." }, { status: 400 });
  }
  if (typeof city !== "string" || !city.trim()) {
    return Response.json({ error: "Укажите город." }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await prisma.client.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return Response.json({ error: "Клиент с таким email уже существует." }, { status: 409 });
  }

  const client = await prisma.client.create({
    data: {
      displayId: await nextClientDisplayId(),
      name: name.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      country: country.trim(),
      city: city.trim(),
    },
  });

  const token = await createAccountToken(client.id, "activate");
  const origin = req.nextUrl.origin;
  await sendActivationEmail(client.email, client.name, `${origin}/account/activate?token=${token}`);

  return Response.json({ client: { ...client, passwordHash: undefined, activated: false } }, { status: 201 });
}
