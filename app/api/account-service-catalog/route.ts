import { NextRequest } from "next/server";
import { getClientIdFromRequest } from "@/lib/client-auth";
import { prisma } from "@/lib/prisma";

// Read-only — the same service list already shown publicly on /pricing, just
// gated behind login since it's surfaced inside the client's own cabinet.
export async function GET(req: NextRequest) {
  const clientId = await getClientIdFromRequest(req);
  if (!clientId) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const items = await prisma.serviceCatalogItem.findMany({ orderBy: [{ direction: "asc" }, { name: "asc" }] });
  return Response.json({ items });
}
