import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewTrash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

const RETENTION_DAYS = 14;

// Owner always; anyone else needs Manager.canViewTrash explicitly granted —
// same as restore (see [id]/restore/route.ts). By default a manager who
// deleted a quote by mistake still asks the руководитель to restore it
// rather than browsing the trash themselves; the owner can individually opt
// a trusted person in. Sorted newest-deleted-first so the most recent (most
// likely to need restoring) is on top.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (!(await canViewTrash(session))) {
    return Response.json({ error: "Нет доступа к корзине." }, { status: 403 });
  }

  const quotes = await prisma.quote.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    select: {
      id: true,
      displayId: true,
      productName: true,
      totalRub: true,
      deletedAt: true,
      deletedByManager: { select: { name: true } },
      manager: { select: { name: true } },
      client: { select: { name: true, company: true } },
    },
  });

  // Purely informational — the actual purge runs on its own schedule (see
  // scripts/purge-deleted-quotes.ts), this just tells the owner how much
  // longer each row has before it's gone for good.
  const withExpiry = quotes.map((q) => ({
    ...q,
    purgeAt: new Date(new Date(q.deletedAt!).getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000),
  }));

  return Response.json({ quotes: withExpiry, retentionDays: RETENTION_DAYS });
}
