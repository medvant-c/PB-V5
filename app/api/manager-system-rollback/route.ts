import { NextRequest } from "next/server";
import { spawn } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";

const STATUS_FILE = path.join(process.cwd(), "deploy-status.json");
const ROLLBACK_SCRIPT = path.join(process.cwd(), "scripts", "rollback.sh");

// Owner-only — kicks off scripts/rollback.sh in the background and
// returns immediately. It has to be detached: the script itself restarts
// this very pm2 process partway through (via `pm2 restart pb-v5`), so the
// request that triggered it would never get to finish otherwise. All the
// "are you sure, 30 seconds to think it over" confirmation lives entirely
// in the UI (see components/manager/tabs/settings/updates-section.tsx) —
// this route trusts that whoever calls it already went through that. See
// PB-V5 chat 2026-08-01.
export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  try {
    const raw = await readFile(STATUS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as { status?: unknown };
    if (parsed.status === "deploying") {
      return Response.json({ error: "Сейчас уже идёт обновление — дождитесь его завершения." }, { status: 409 });
    }
  } catch {
    // No status file yet — nothing in progress, safe to proceed.
  }

  const child = spawn(ROLLBACK_SCRIPT, [], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return Response.json({ ok: true });
}
