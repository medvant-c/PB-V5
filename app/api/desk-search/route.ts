import { NextRequest } from "next/server";
import { hasDeskSession } from "@/lib/desk-auth";
import { prisma } from "@/lib/prisma";

// Returns every order with its client and service code embedded, for the
// Клиенты tab's search/filter bar. No server-side text filtering here —
// SQLite's LIKE is ASCII-only case-insensitive and would mishandle Cyrillic
// (Б wouldn't match б), so the client does its own case-insensitive
// filtering in JS instead. The dataset is small enough (an internal tool,
// not a mass-market storefront) that shipping it all down is simpler and
// correct rather than building a fragile server-side search.
export async function GET(req: NextRequest) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, displayId: true, name: true, email: true, phone: true, country: true, city: true } },
      serviceCatalogItem: { select: { code: true } },
    },
  });

  return Response.json({ orders });
}
