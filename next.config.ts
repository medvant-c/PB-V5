import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Self-hosted behind nginx (not Vercel) — without this, Next.js builds
    // request.url/nextUrl.origin from the server's own bind hostname instead
    // of the proxied Host header, producing "localhost:3000" links in emails.
    // Real, functioning flag (Vercel enables it automatically for itself) —
    // just missing from this Next version's public NextConfig type.
    // @ts-expect-error -- undocumented but real experimental flag
    trustHostHeader: true,
  },
};

export default nextConfig;
