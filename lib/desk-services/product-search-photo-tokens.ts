import "server-only";
import { randomBytes } from "crypto";

// Короткоживущие непредсказуемые токены для отдачи фото товара по
// НЕавторизованному URL — сторонний сервис bhapi.ru должен сам скачать
// картинку для поиска по изображению на 1688 (cross-border/search-by-image),
// а все остальные файлы в приложении отдаются только через сессионные
// роуты. Тот же принцип, что у app/api/telegram-cny-rate-webhook (секрет
// вместо сессии) — только здесь "секрет" это сам токен в URL, не заголовок.
// Живут в памяти процесса (pm2 — один fork, не нужна таблица в БД ради
// временного артефакта) — переживают в течение сессии подбора товара,
// сгорают через TTL. См. план «Автопоиск товаров», PB-V5 chat 2026-08-31.

const TTL_MS = 30 * 60 * 1000;

interface TokenEntry {
  storageKey: string;
  mimeType: string;
  expiresAt: number;
}

const tokens = new Map<string, TokenEntry>();

function cleanupExpired() {
  const now = Date.now();
  for (const [token, entry] of tokens) {
    if (entry.expiresAt < now) tokens.delete(token);
  }
}

function mintPublicPhotoToken(storageKey: string, mimeType: string): string {
  cleanupExpired();
  const token = randomBytes(24).toString("hex");
  tokens.set(token, { storageKey, mimeType, expiresAt: Date.now() + TTL_MS });
  return token;
}

function resolvePublicPhotoToken(token: string): { storageKey: string; mimeType: string } | null {
  cleanupExpired();
  return tokens.get(token) ?? null;
}

export { mintPublicPhotoToken, resolvePublicPhotoToken };
