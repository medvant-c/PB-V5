import { NextRequest } from "next/server";

// req.nextUrl.origin can't be trusted for building links in emails: Next.js's
// build step hardcodes experimental.trustHostHeader to Vercel's own CI
// detection (see next/dist/build/index.js), so self-hosted deployments
// behind nginx always get the server's own bind hostname ("localhost:3000")
// instead of the real domain, regardless of next.config.ts. APP_BASE_URL is
// the explicit, environment-driven replacement — set in .env.local per
// environment (production: https://panda-bridges.com).
export function getAppOrigin(req: NextRequest): string {
  return process.env.APP_BASE_URL ?? req.nextUrl.origin;
}
