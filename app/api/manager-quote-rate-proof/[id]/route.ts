import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Serves the proof screenshot attached at cargo-rate/¥-rate confirmation
// time (see confirm-cargo-rate and confirm-cny-rate routes) — same
// audience as the confirmations queue/archive that link to it, so gated
// the same way (owner/senior only), and restricted to exactly these two
// DeskFileTab values so this route can't be used to fetch an arbitrary
// file by guessing/enumerating ids. Served inline (not as a download) so
// it opens straight in the browser. See PB-V5 chat 2026-07-31.
const ALLOWED_TABS = new Set([
  "quote_cargo_rate_proof",
  "quote_cny_rate_proof",
  "quote_usd_rate_proof",
  "quote_buyout_commission_proof",
]);

export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json({ error: "Доступно только старшему менеджеру и руководителю." }, { status: 403 });
  }

  const { id } = await params;
  const record = await prisma.deskFile.findUnique({ where: { id } });
  if (!record || !ALLOWED_TABS.has(record.tab)) {
    return Response.json({ error: "Файл не найден." }, { status: 404 });
  }

  const buffer = await storage.get(record.storageKey);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": record.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(record.originalName)}`,
      "Content-Length": String(record.size),
    },
  });
}
