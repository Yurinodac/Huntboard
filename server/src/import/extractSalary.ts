/** Full-time US hours/year (40 × 52) for hourly → annual estimates */
export const HOURS_PER_YEAR = 2080;

export type SalaryExtract = {
  salary_min: number;
  salary_max: number;
  /** Set when annual figures were computed from an hourly posting */
  salary_disclosure?: string;
};

export type SalaryRange = SalaryExtract;

/** Parse one money token: $50,000 | $100,000.00 | 80k | 45.50 */
export function parseMoneyAmount(raw: string): number | null {
  const cleaned = raw.replace(/\u00a0/g, " ").trim();
  if (!cleaned) return null;

  const kMatch = /\$?\s*([\d,]+(?:\.\d+)?)\s*([kK])\b/.exec(cleaned);
  if (kMatch?.[1]) {
    const base = Number.parseFloat(kMatch[1].replace(/,/g, ""));
    if (Number.isFinite(base)) return Math.round(base * 1000);
  }

  const plain = /\$?\s*([\d,]+(?:\.\d{1,2})?)/.exec(cleaned);
  if (!plain?.[1]) return null;
  const value = Number.parseFloat(plain[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function isLikelyAnnualSalary(n: number): boolean {
  return n >= 15_000 && n <= 2_000_000;
}

function isLikelyHourlyRate(n: number): boolean {
  return n >= 10 && n <= 750;
}

function isHourlyContext(snippet: string): boolean {
  return /\b(?:\/\s*hr|\/\s*hour|per\s+hour|hourly|hr\.)\b/i.test(snippet);
}

function formatMoney(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function hourlyToAnnual(hourly: number): number {
  return Math.round(hourly * HOURS_PER_YEAR);
}

export function buildHourlyDisclosure(
  hourlyMin: number,
  hourlyMax: number,
  annualMin: number,
  annualMax: number,
): string {
  const hMin = formatMoney(hourlyMin, hourlyMin % 1 === 0 ? 0 : 2);
  const hMax = formatMoney(hourlyMax, hourlyMax % 1 === 0 ? 0 : 2);
  const aMin = formatMoney(annualMin);
  const aMax = formatMoney(annualMax);
  return (
    `Compensation was posted as ${hMin}–${hMax}/hr. ` +
    `Salary min/max below are estimated annual equivalents (${aMin}–${aMax}) ` +
    `using ${HOURS_PER_YEAR.toLocaleString()} hours/year (full-time).`
  );
}

function normalizeAnnualRange(min: number, max: number): SalaryExtract | null {
  if (!isLikelyAnnualSalary(min) || !isLikelyAnnualSalary(max)) return null;
  if (min > max) [min, max] = [max, min];
  if (max - min < 1_000 && max < 500_000) return null;
  return { salary_min: min, salary_max: max };
}

function normalizeHourlyRange(min: number, max: number, context: string): SalaryExtract | null {
  if (!isLikelyHourlyRate(min) || !isLikelyHourlyRate(max)) return null;
  if (isLikelyAnnualSalary(min) || isLikelyAnnualSalary(max)) return null;
  if (!isHourlyContext(context) && (min > 80 || max > 80)) return null;
  if (min > max) [min, max] = [max, min];

  const annualMin = hourlyToAnnual(min);
  const annualMax = hourlyToAnnual(max);
  return {
    salary_min: annualMin,
    salary_max: annualMax,
    salary_disclosure: buildHourlyDisclosure(min, max, annualMin, annualMax),
  };
}

function tryAnnualRange(minRaw: string, maxRaw: string, context: string): SalaryExtract | null {
  if (isHourlyContext(context)) return null;
  const min = parseMoneyAmount(minRaw);
  const max = parseMoneyAmount(maxRaw);
  if (min == null || max == null) return null;
  return normalizeAnnualRange(min, max);
}

function tryHourlyRange(minRaw: string, maxRaw: string, context: string): SalaryExtract | null {
  const min = parseMoneyAmount(minRaw);
  const max = parseMoneyAmount(maxRaw);
  if (min == null || max == null) return null;
  return normalizeHourlyRange(min, max, context);
}

const ANNUAL_RANGE_PATTERNS: RegExp[] = [
  /\$?\s*([\d,]+(?:\.\d+)?)\s*([kK])?\s*(?:[-–—]|to)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*([kK])?(?:\s*(?:\/|per)\s*(?:year|yr|annum|annually))?/gi,
  /between\s+(?:[\w\s]{0,40}\s+)?\$?\s*([\d,]+(?:\.\d+)?)\s*([kK])?\s+and\s+\$?\s*([\d,]+(?:\.\d+)?)\s*([kK])?/gi,
  /(?:salary|compensation|pay|base\s+rate|expected\s+base)[^.\n]{0,160}?\$?\s*([\d,]+(?:\.\d+)?)\s*([kK])?\s*(?:[-–—]|to)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*([kK])?(?:\s*(?:\/|per)\s*(?:year|yr|annum|annually))?/gi,
  /(?:salary|compensation|pay|range)[^.\n]{0,80}?\b([\d,]+(?:\.\d+)?)\s*([kK])?\s*(?:[-–—]|to)\s*\b([\d,]+(?:\.\d+)?)\s*([kK])?\s*(?:usd|us\s+dollars?)?(?:\s*(?:\/|per)\s*(?:year|yr))?/gi,
];

const HOURLY_RANGE_PATTERNS: RegExp[] = [
  /\$?\s*([\d,]+(?:\.\d+)?)\s*([kK])?\s*(?:[-–—]|to)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*([kK])?\s*(?:\/\s*hr|\/\s*hour|per\s+hour|hourly)\b/gi,
  /(?:hourly|per\s+hour|\/\s*hr)[^.\n]{0,80}?\$?\s*([\d,]+(?:\.\d+)?)\s*([kK])?\s*(?:[-–—]|to)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*([kK])?/gi,
  /(?:pay|rate|compensation|wage)[^.\n]{0,60}?\$?\s*([\d,]+(?:\.\d+)?)\s*([kK])?\s*(?:[-–—]|to)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*([kK])?\s*(?:\/\s*hr|\/\s*hour|per\s+hour)/gi,
];

const HOURLY_SINGLE_PATTERN =
  /\$?\s*([\d,]+(?:\.\d+)?)\s*([kK])?\s*(?:\/\s*hr|\/\s*hour|per\s+hour)\b/gi;

function scanPatterns(text: string, patterns: RegExp[], tryFn: typeof tryAnnualRange): SalaryExtract | null {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const ctx = text.slice(Math.max(0, match.index - 50), match.index + match[0].length + 50);
      const minStr = `${match[1]}${match[2] ?? ""}`;
      const maxStr = `${match[3]}${match[4] ?? ""}`;
      const range = tryFn(minStr, maxStr, ctx);
      if (range) return range;
    }
  }
  return null;
}

function scanHourlySingle(text: string): SalaryExtract | null {
  HOURLY_SINGLE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HOURLY_SINGLE_PATTERN.exec(text)) !== null) {
    const ctx = text.slice(Math.max(0, match.index - 40), match.index + match[0].length + 40);
    const amount = parseMoneyAmount(`${match[1]}${match[2] ?? ""}`);
    if (amount == null) continue;
    const range = normalizeHourlyRange(amount, amount, ctx);
    if (range) return range;
  }
  return null;
}

/** Extract annual salary min/max from free text; converts hourly postings with a disclosure note. */
export function extractSalaryRange(text: string): SalaryExtract | null {
  if (!text?.trim()) return null;

  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ");

  const annual = scanPatterns(normalized, ANNUAL_RANGE_PATTERNS, tryAnnualRange);
  if (annual) return annual;

  const hourly =
    scanPatterns(normalized, HOURLY_RANGE_PATTERNS, tryHourlyRange) ??
    scanHourlySingle(normalized);
  if (hourly) return hourly;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const block = [lines[i], lines[i + 1], lines[i + 2]].filter(Boolean).join(" ");
    const blockAnnual = scanPatterns(block, ANNUAL_RANGE_PATTERNS, tryAnnualRange);
    if (blockAnnual) return blockAnnual;
    const blockHourly =
      scanPatterns(block, HOURLY_RANGE_PATTERNS, tryHourlyRange) ?? scanHourlySingle(block);
    if (blockHourly) return blockHourly;
  }

  return null;
}

export function extractSalaryFromJsonLdValue(
  value: unknown,
  unitText?: string,
): SalaryExtract | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const unit = (unitText ?? String(v.unitText ?? "")).toLowerCase();
  const isHourly = unit.includes("hour");

  const minValue = v.minValue ?? v.value;
  const maxValue = v.maxValue ?? v.value;

  const min =
    typeof minValue === "number"
      ? minValue
      : typeof minValue === "string"
        ? parseMoneyAmount(minValue)
        : null;
  const max =
    typeof maxValue === "number"
      ? maxValue
      : typeof maxValue === "string"
        ? parseMoneyAmount(maxValue)
        : null;

  if (min == null || max == null) return null;

  if (isHourly) {
    return normalizeHourlyRange(min, max, "per hour");
  }
  return normalizeAnnualRange(min, max);
}

export function extractSalaryFromJobPostingJson(obj: Record<string, unknown>): SalaryExtract | null {
  const base = obj.baseSalary;
  if (!base) return null;

  if (typeof base === "number") {
    return isLikelyAnnualSalary(base)
      ? { salary_min: base, salary_max: base }
      : isLikelyHourlyRate(base)
        ? normalizeHourlyRange(base, base, "hourly")
        : null;
  }

  if (typeof base === "string") {
    return extractSalaryRange(base);
  }

  if (typeof base === "object" && base !== null) {
    const b = base as Record<string, unknown>;
    const inner = b.value;
    if (inner && typeof inner === "object") {
      const innerObj = inner as Record<string, unknown>;
      const unit = String(innerObj.unitText ?? b.unitText ?? b.unit ?? "");
      return extractSalaryFromJsonLdValue(inner, unit);
    }
    const unit = String(b.unitText ?? b.unit ?? "");
    if (typeof b.minValue === "number" || typeof b.maxValue === "number") {
      return extractSalaryFromJsonLdValue(b, unit);
    }
  }

  return null;
}

type WithSalary = {
  salary_min?: number;
  salary_max?: number;
  notes?: string;
  sources: string[];
};

/** Fill salary_min/max from job text; appends hourly disclosure to notes when applicable. */
export function applySalaryFromText<T extends WithSalary>(target: T, texts: string[]): T {
  if (target.salary_min != null && target.salary_max != null) return target;

  for (const text of texts) {
    const range = extractSalaryRange(text);
    if (!range) continue;

    const sourceTag = range.salary_disclosure ? "salary-parse-hourly" : "salary-parse";
    const sources = target.sources.includes(sourceTag)
      ? target.sources
      : [...target.sources, sourceTag];

    let notes = target.notes;
    if (range.salary_disclosure) {
      const disclosure = range.salary_disclosure;
      notes = notes?.includes(disclosure) ? notes : notes ? `${notes}\n\n${disclosure}` : disclosure;
    }

    return {
      ...target,
      salary_min: target.salary_min ?? range.salary_min,
      salary_max: target.salary_max ?? range.salary_max,
      notes,
      sources,
    };
  }
  return target;
}
