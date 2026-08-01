import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";

// scripts/deploy.sh writes deploy-status.json (project root, outside
// .next so a fresh build never wipes it) at the start and end of every
// deploy — this route just reads it back so an open manager tab
// (DeploymentWatcher, polling this) can show "идёт обновление" instead of
// managers just hitting occasional failed requests when pm2 restarts
// mid-session. See PB-V5 chat 2026-08-01.
const STATUS_FILE = path.join(process.cwd(), "deploy-status.json");

export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  try {
    const raw = await readFile(STATUS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as { status?: unknown; version?: unknown };
    return Response.json({
      status: parsed.status === "deploying" ? "deploying" : "idle",
      version: typeof parsed.version === "string" ? parsed.version : "",
    });
  } catch {
    // No status file yet — first deploy since this shipped, or local dev.
    // Nothing wrong, just nothing to report.
    return Response.json({ status: "idle", version: "" });
  }
}
