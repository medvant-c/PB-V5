// Формат кода клиента фулфилмента для склада: 4 цифры + 2 заглавные
// латинские буквы (например "1234AB"). Только латиница — иначе визуально
// неотличимые кириллические омоглифы (А/В и т.п.) могли бы тихо давать
// "разные" коды. См. PB-V5 chat 2026-09-11.
const FULFILLMENT_CODE_RE = /^\d{4}[A-Z]{2}$/;

// Возвращает нормализованный (верхний регистр) код или null, если формат
// неверный/пусто — вызывающий код сам решает, что делать (пропустить
// необязательное поле или вернуть 400).
function normalizeFulfillmentCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toUpperCase();
  return FULFILLMENT_CODE_RE.test(trimmed) ? trimmed : null;
}

export { FULFILLMENT_CODE_RE, normalizeFulfillmentCode };
