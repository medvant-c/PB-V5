// Вес и габариты упаковки товара Wildberries не приходят отдельным
// гарантированным полем API (bhapi.ru) — только внутри произвольного
// словаря характеристик product_props ("название → значение", как на
// странице товара, зависит от того, что заполнил продавец). Проверено на
// живом товаре (PB-V5 chat 2026-08-31): реальный пример —
// {"Вес с упаковкой (кг)": "0.034 кг", "Длина упаковки": "23 см", ...}.
// Best-effort: может не найти ничего (у продавца просто не указано) —
// вызывающий код обязан показать менеджеру, что именно распознано (или не
// распознано), не полагаться на это молча.

interface ExtractedDimensions {
  weightKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  // Из какой характеристики что взято — для показа менеджеру, чтобы можно
  // было сверить со страницей товара, а не слепо доверять regex-парсингу.
  matchedFrom: {
    weight: string | null;
    length: string | null;
    width: string | null;
    height: string | null;
  };
}

// `\b` не годится здесь — JS считает кириллические буквы "не словом", так
// что граница слова не срабатывает сразу после "кг"/"см" (обе стороны
// границы — "не слово"). Вместо этого — отрицательный lookahead на
// следующую букву, чтобы не зацепить середину более длинного слова.
const NOT_FOLLOWED_BY_LETTER = "(?![а-яёa-z])";

// Строка вида "0.034 кг", "34 г", "0,034кг" → килограммы.
function parseWeightValue(raw: string): number | null {
  const match = raw.match(new RegExp(`([\\d.,]+)\\s*(кг|г)${NOT_FOLLOWED_BY_LETTER}`, "i"));
  if (!match) return null;
  const num = Number(match[1].replace(",", "."));
  if (!Number.isFinite(num)) return null;
  return match[2].toLowerCase() === "г" ? num / 1000 : num;
}

// Строка вида "23 см", "23,5см" → сантиметры.
function parseLengthValue(raw: string): number | null {
  const match = raw.match(new RegExp(`([\\d.,]+)\\s*см${NOT_FOLLOWED_BY_LETTER}`, "i"));
  if (!match) return null;
  const num = Number(match[1].replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

// Предпочитает поле "с упаковкой"/"брутто" реальному весу товара (для
// карго важен вес именно в упаковке, не самого изделия) — сперва ищет
// среди ключей, где есть оба слова, и только если не нашлось, берёт любое
// поле с "вес" в названии.
function findBestKey(props: Record<string, string>, preferredPattern: RegExp, fallbackPattern: RegExp): string | null {
  const keys = Object.keys(props);
  const preferred = keys.find((k) => preferredPattern.test(k));
  if (preferred) return preferred;
  return keys.find((k) => fallbackPattern.test(k)) ?? null;
}

function extractWeightAndDimensions(productProps: Record<string, string>): ExtractedDimensions {
  const weightKey = findBestKey(productProps, /вес.*(упаковк|брутто)/i, /вес/i);
  const weightKg = weightKey ? parseWeightValue(productProps[weightKey]) : null;

  // Сначала пробуем три отдельных поля длина/ширина/высота (предпочитая
  // "упаковки" версию, если есть отдельная от "предмета").
  const lengthKey = findBestKey(productProps, /длина.*упаковк/i, /длина/i);
  const widthKey = findBestKey(productProps, /ширина.*упаковк/i, /ширина/i);
  const heightKey = findBestKey(productProps, /высота.*упаковк/i, /высота/i);

  return {
    weightKg: weightKg ?? null,
    lengthCm: lengthKey ? parseLengthValue(productProps[lengthKey]) : null,
    widthCm: widthKey ? parseLengthValue(productProps[widthKey]) : null,
    heightCm: heightKey ? parseLengthValue(productProps[heightKey]) : null,
    matchedFrom: {
      weight: weightKey ?? null,
      length: lengthKey ?? null,
      width: widthKey ?? null,
      height: heightKey ?? null,
    },
  };
}

export { extractWeightAndDimensions };
export type { ExtractedDimensions };
