import { NextRequest } from "next/server";
import { hasDeskSession } from "@/lib/desk-auth";
import { prisma } from "@/lib/prisma";

// Powers the badge on the "Клиенты" nav item in desk-workspace.tsx — that
// component isn't the Клиенты tab itself, so it can't rely on ClientsTab's
// own state (only the active tab is mounted); it polls this tiny endpoint
// instead so the count stays visible from any tab.
export async function GET(req: NextRequest) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const count = await prisma.order.count({ where: { seenByManager: false } });
  return Response.json({ count });
}
