import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";

// changelog.json (repo root, committed alongside the code it describes —
// unlike deploy-status.json/.last-stable-commit, which are server-runtime
// state) is hand-curated: a short, owner-facing entry added whenever a
// user-visible change ships, not auto-generated from commit messages
// (those are written for a future engineer, not for Антон). See PB-V5
// chat 2026-08-01.
const CHANGELOG_FILE = path.join(process.cwd(), "changelog.json");

export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  try {
    const raw = await readFile(CHANGELOG_FILE, "utf-8");
    const entries = JSON.parse(raw) as { date: string; title: string; description: string }[];
    return Response.json({ entries });
  } catch {
    return Response.json({ entries: [] });
  }
}
