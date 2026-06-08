import {
  applySalaryFromText,
  extractSalaryFromJobPostingJson,
} from "./extractSalary.js";

export type JobPageExtract = {
  company: string;
  title: string;
  location?: string;
  work_arrangement?: "remote" | "hybrid" | "onsite" | "unknown";
  posting_url: string;
  job_summary?: string;
  notes?: string;
  salary_min?: number;
  salary_max?: number;
  sources: string[];
  warnings: string[];
};

function finalizeExtract(extract: JobPageExtract, html: string): JobPageExtract {
  const plain = stripHtml(html);
  return applySalaryFromText(extract, [extract.job_summary ?? "", plain]);
}

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function metaContent(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return decodeHtmlEntities(m[1].trim());
  }
  return undefined;
}

function titleTag(html: string): string | undefined {
  const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return m?.[1] ? decodeHtmlEntities(m[1].trim()) : undefined;
}

export function isLinkedInUrl(url: string): boolean {
  try {
    return /linkedin\.com/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export const LINKEDIN_IMPORT_MESSAGE =
  "LinkedIn blocks automated downloads of job pages (HTTP 999). Open the job in your browser, copy the description, and use Import pasted text below.";

export class JobPageFetchError extends Error {
  readonly code: string;

  constructor(message: string, code = "FETCH_FAILED") {
    super(message);
    this.name = "JobPageFetchError";
    this.code = code;
  }
}

function workArrangementFromText(text: string): JobPageExtract["work_arrangement"] {
  if (/hybrid/i.test(text)) return "hybrid";
  if (/remote|wfh|work from home/i.test(text)) return "remote";
  if (/on[- ]?site|in[- ]?office/i.test(text)) return "onsite";
  return "unknown";
}

/** Plain-text or HTML copied from the browser (e.g. LinkedIn when fetch is blocked). */
export function parsePastedJobText(text: string, pageUrl?: string): JobPageExtract {
  const trimmed = text.trim();
  const url = pageUrl?.trim() ?? "";

  if (/<(?:html|meta|title|div|p)\b/i.test(trimmed) && trimmed.length > 200) {
    return parseJobPageHtml(trimmed, url || "https://paste.local/job");
  }

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const warnings: string[] = [];
  const sources = ["paste"];

  let title = "";
  let company = "";

  if (lines[0]) {
    const split = splitTitleLine(lines[0]);
    if (split) {
      title = split.title;
      company = split.company;
    } else if (url && isLinkedInUrl(url) && lines.length >= 2 && lines[1].length < 120) {
      title = lines[0];
      company = lines[1];
    } else {
      title = lines[0];
    }
  }

  if (!company && lines[1] && lines[1].length < 120) {
    const split = splitTitleLine(lines[1]);
    if (split) {
      if (!title) title = split.title;
      company = split.company;
    } else if (!company) {
      company = lines[1];
    }
  }

  let job_summary = trimmed;
  if (title && company && lines.length > 2) {
    const body = lines.slice(2).join("\n").trim();
    if (body.length >= 40) job_summary = body;
  }

  if (!company) {
    warnings.push("Could not detect company — edit after import.");
  }
  if (job_summary.length < 80) {
    warnings.push("Job description looks short — paste more of the posting if you can.");
  }

  return applySalaryFromText(
    {
      company: company || "Unknown company",
      title: title || "Role (edit title)",
      posting_url: url,
      job_summary: job_summary.slice(0, 8000),
      work_arrangement: workArrangementFromText(job_summary),
      sources,
      warnings,
    },
    [trimmed, job_summary],
  );
}

function isBlockedPage(html: string, title?: string): boolean {
  const sample = `${title ?? ""} ${html.slice(0, 15_000)}`.toLowerCase();
  return (
    (sample.includes("sign in") && sample.includes("linkedin")) ||
    sample.includes("authwall") ||
    sample.includes("join linkedin") ||
    (sample.includes("captcha") && html.length < 50_000)
  );
}

function unescapeJsonString(s: string): string {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

/** Pull fields from JSON blobs embedded in HTML (LinkedIn, some ATS pages). */
function extractJsonField(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const patterns = [
      new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "i"),
      new RegExp(`'${key}'\\s*:\\s*'((?:\\\\.|[^'\\\\])*)'`, "i"),
    ];
    for (const re of patterns) {
      const m = re.exec(html);
      if (m?.[1]) {
        const raw = unescapeJsonString(m[1]);
        if (raw.trim().length > 1) return raw.trim();
      }
    }
  }
  return undefined;
}

function extractLongDescription(html: string): string | undefined {
  const keys = [
    "description",
    "jobDescription",
    "job_description",
    "localizedDescription",
    "content",
  ];
  for (const key of keys) {
    const block = extractJsonField(html, [key]);
    if (block && block.length >= 80) return block.slice(0, 8000);
  }

  const textBlock = html.match(
    /"description"\s*:\s*\{\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"/i,
  );
  if (textBlock?.[1]) {
    const decoded = unescapeJsonString(textBlock[1]);
    if (decoded.length >= 80) return decoded.slice(0, 8000);
  }
  return undefined;
}

function parseLinkedInTitle(docTitle: string): { company?: string; title?: string; location?: string } {
  const t = docTitle.replace(/\s*\|\s*LinkedIn\s*$/i, "").trim();
  // "Acme hiring Software Engineer in San Francisco, CA"
  const hiring = /^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+(.+))?$/i.exec(t);
  if (hiring) {
    return { company: hiring[1].trim(), title: hiring[2].trim(), location: hiring[3]?.trim() };
  }
  // "Software Engineer - Acme"
  const dash = /^(.+?)\s*[-–]\s*(.+)$/.exec(t);
  if (dash) {
    return { title: dash[1].trim(), company: dash[2].trim() };
  }
  return {};
}

function parseJsonLdJobPosting(html: string): Partial<JobPageExtract> | undefined {
  const blocks = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  if (!blocks) return undefined;

  for (const block of blocks) {
    const inner = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(block)?.[1];
    if (!inner) continue;
    try {
      const data = JSON.parse(inner) as unknown;
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const obj = node as Record<string, unknown>;
        const type = String(obj["@type"] ?? "");
        if (!type.toLowerCase().includes("jobposting")) continue;

        const title = typeof obj.title === "string" ? obj.title : undefined;
        const org = obj.hiringOrganization as Record<string, unknown> | undefined;
        const company =
          typeof org?.name === "string"
            ? org.name
            : typeof obj.hiringOrganization === "string"
              ? obj.hiringOrganization
              : undefined;

        let job_summary: string | undefined;
        if (typeof obj.description === "string") {
          job_summary = stripHtml(obj.description).slice(0, 8000);
        }

        const location = obj.jobLocation as Record<string, unknown> | undefined;
        const address = location?.address as Record<string, unknown> | undefined;
        const locality =
          typeof address?.addressLocality === "string" ? address.addressLocality : undefined;

        const arrangement =
          typeof obj.jobLocationType === "string" &&
          obj.jobLocationType.toLowerCase().includes("telecommute")
            ? ("remote" as const)
            : undefined;

        const salary = extractSalaryFromJobPostingJson(obj);
        const sources = ["json-ld"];
        if (salary) sources.push("json-ld-salary");

        return {
          company: company ?? "",
          title: title ?? "",
          location: locality,
          work_arrangement: arrangement,
          job_summary,
          salary_min: salary?.salary_min,
          salary_max: salary?.salary_max,
          sources,
          warnings: [],
        };
      }
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

function companyFromHostname(hostname: string): string {
  const host = hostname.replace(/^www\./i, "");
  const parts = host.split(".");
  if (parts.length >= 2 && parts[parts.length - 1] === "com") {
    const base = parts[parts.length - 2];
    if (!["jobs", "careers", "boards"].includes(base)) {
      return base.charAt(0).toUpperCase() + base.slice(1);
    }
    if (parts.length >= 3) {
      const sub = parts[parts.length - 3];
      return sub.charAt(0).toUpperCase() + sub.slice(1);
    }
  }
  const base = parts[0] ?? host;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function splitTitleLine(line: string): { title: string; company: string } | null {
  const cleaned = line.replace(/\s+/g, " ").trim();
  const patterns = [
    /^(.+?)\s+at\s+(.+?)(?:\s*[-|•].*)?$/i,
    /^(.+?)\s*[-–|]\s*(.+?)(?:\s*[-|•].*)?$/,
    /^(.+?)\s*@\s*(.+)$/i,
  ];
  for (const re of patterns) {
    const m = re.exec(cleaned);
    if (m?.[1] && m[2]) {
      return { title: m[1].trim(), company: m[2].trim() };
    }
  }
  return null;
}

function mergeDescription(...parts: (string | undefined)[]): string | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const t = p?.trim();
    if (!t || t.length < 20) continue;
    const key = t.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  if (!out.length) return undefined;
  return out.join("\n\n").slice(0, 8000);
}

function parseLinkedInHtml(html: string, pageUrl: string): Partial<JobPageExtract> {
  const sources: string[] = ["linkedin"];
  const warnings: string[] = [];
  const docTitle = titleTag(html);

  if (isBlockedPage(html, docTitle)) {
    warnings.push(
      "LinkedIn showed a sign-in page. We filled basics from the page title — paste the job description manually if needed.",
    );
  }

  const fromTitle = docTitle ? parseLinkedInTitle(docTitle) : {};
  if (fromTitle.company || fromTitle.title) sources.push("linkedin-title");

  const jsonTitle = extractJsonField(html, [
    "jobPostingTitle",
    "title",
    "localizedTitle",
    "jobTitle",
  ]);
  const jsonCompany = extractJsonField(html, [
    "companyName",
    "company_name",
    "localizedCompanyName",
  ]);
  const jsonLocation = extractJsonField(html, ["location", "formattedLocation", "jobLocation"]);

  if (jsonTitle) sources.push("linkedin-json-title");
  if (jsonCompany) sources.push("linkedin-json-company");

  const ogTitle = metaContent(html, "og:title");
  const ogDesc = metaContent(html, "og:description");

  let title =
    jsonTitle ?? fromTitle.title ?? ogTitle ?? docTitle?.replace(/\s*\|\s*LinkedIn.*$/i, "") ?? "";
  let company = jsonCompany ?? fromTitle.company ?? "";

  const split = splitTitleLine(title);
  if (split) {
    title = split.title;
    if (!company) company = split.company;
    sources.push("title-pattern");
  }

  if (!company && ogTitle) {
    const s = splitTitleLine(ogTitle);
    if (s && !company) company = s.company;
  }

  const job_summary = mergeDescription(
    extractLongDescription(html),
    ogDesc,
    metaContent(html, "description"),
  );

  return {
    company: company || "Unknown company",
    title: title || "Role (edit title)",
    location: jsonLocation ?? fromTitle.location,
    posting_url: pageUrl,
    job_summary,
    sources,
    warnings,
  };
}

export function parseJobPageHtml(html: string, pageUrl: string): JobPageExtract {
  const warnings: string[] = [];
  const sources: string[] = [];

  if (isLinkedInUrl(pageUrl)) {
    const li = parseLinkedInHtml(html, pageUrl);
    const remoteHint = /remote|hybrid|onsite|work from home/i.test(
      `${li.job_summary ?? ""} ${html.slice(0, 12_000)}`,
    );
    return finalizeExtract(
      {
        company: li.company ?? "Unknown company",
        title: li.title ?? "Role (edit title)",
        location: li.location,
        work_arrangement: remoteHint
          ? /hybrid/i.test(li.job_summary ?? "")
            ? "hybrid"
            : /remote|wfh|work from home/i.test(li.job_summary ?? "")
              ? "remote"
              : "unknown"
          : "unknown",
        posting_url: pageUrl,
        job_summary: li.job_summary,
        notes: li.job_summary ? undefined : "Imported from LinkedIn — add description if missing.",
        sources: li.sources ?? ["linkedin"],
        warnings: li.warnings ?? [],
      },
      html,
    );
  }

  const ld = parseJsonLdJobPosting(html);
  if (ld?.company && ld?.title) {
    const ogDesc = metaContent(html, "og:description");
    return finalizeExtract(
      {
        company: ld.company,
        title: ld.title,
        location: ld.location,
        work_arrangement: ld.work_arrangement ?? "unknown",
        posting_url: pageUrl,
        job_summary: mergeDescription(ld.job_summary, ogDesc, extractLongDescription(html)),
        salary_min: ld.salary_min,
        salary_max: ld.salary_max,
        sources: ld.sources ?? ["json-ld"],
        warnings: [],
      },
      html,
    );
  }

  const ogTitle = metaContent(html, "og:title");
  const ogSite = metaContent(html, "og:site_name");
  const twTitle = metaContent(html, "twitter:title");
  const docTitle = titleTag(html);

  let title = ld?.title ?? ogTitle ?? twTitle ?? docTitle ?? "";
  let company = ld?.company ?? ogSite ?? extractJsonField(html, ["companyName", "company"]) ?? "";

  if (title) sources.push(ogTitle ? "og:title" : twTitle ? "twitter:title" : "title");
  if (company) sources.push(ogSite ? "og:site_name" : "embedded-json");

  const split = splitTitleLine(title);
  if (split) {
    title = split.title;
    if (!company) company = split.company;
    sources.push("title-pattern");
  }

  if (!company) {
    try {
      company = companyFromHostname(new URL(pageUrl).hostname);
      sources.push("hostname");
    } catch {
      company = "Unknown company";
    }
  }

  if (!title) title = "Role (edit title)";

  const job_summary = mergeDescription(
    extractLongDescription(html),
    metaContent(html, "og:description"),
    metaContent(html, "description"),
    ld?.job_summary,
  );

  const remoteHint = /remote|work from home|wfh|hybrid/i.test(
    `${job_summary ?? ""} ${html.slice(0, 10_000)}`,
  );

  if (!job_summary) {
    warnings.push(
      "Could not extract a full job description from this page. Paste the summary manually below.",
    );
  }

  return finalizeExtract(
    {
      company,
      title,
      location: ld?.location ?? extractJsonField(html, ["location", "jobLocation"]),
      work_arrangement: remoteHint
        ? /hybrid/i.test(job_summary ?? "")
          ? "hybrid"
          : /remote|wfh/i.test(job_summary ?? "")
            ? "remote"
            : "unknown"
        : "unknown",
      posting_url: pageUrl,
      job_summary,
      sources: sources.length ? sources : ["fallback"],
      warnings,
    },
    html,
  );
}

export async function fetchJobPage(url: string): Promise<string> {
  const normalized = url.trim();

  if (isLinkedInUrl(normalized)) {
    throw new JobPageFetchError(LINKEDIN_IMPORT_MESSAGE, "LINKEDIN_BLOCKED");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const parsed = new URL(normalized);
    const headers: Record<string, string> = {
      "User-Agent": CHROME_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
    };

    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers,
      redirect: "follow",
    });
    if (!res.ok) {
      if (res.status === 999) {
        throw new JobPageFetchError(LINKEDIN_IMPORT_MESSAGE, "LINKEDIN_BLOCKED");
      }
      throw new JobPageFetchError(
        `Could not fetch page (HTTP ${res.status}). Try a company careers page, or paste the job description instead.`,
      );
    }
    const text = await res.text();
    if (text.length > 800_000) {
      return text.slice(0, 800_000);
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}
