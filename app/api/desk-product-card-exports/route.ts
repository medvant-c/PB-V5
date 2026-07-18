import { NextRequest } from "next/server";
import { hasDeskSession } from "@/lib/desk-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const exports = await prisma.productCardExport.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, productTitle: true, fileName: true, size: true, createdAt: true },
  });

  return Response.json({ exports });
}
