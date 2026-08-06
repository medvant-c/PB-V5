import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";

// Small "who am I" endpoint — client components in the manager cabinet
// (settings-tab.tsx, clients-tab.tsx, all-quotes-tab.tsx…) are rendered
// without a `role` prop (see manager-workspace.tsx's ALL_SECTIONS — every
// tab is self-contained and infers what it needs from its own API calls),
// so anything that needs to know the CURRENT role (not just "is this an
// owner-only endpoint returning 200 or 403") calls this instead of probing
// an unrelated owner-only route. See PB-V5 chat 2026-08-06.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  return Response.json({ managerId: session.managerId, role: session.role });
}
