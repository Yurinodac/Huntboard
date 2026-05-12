const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
]);

export type ApplicationRowForMatching = {
  id: string;
  company: string;
  title: string;
  posting_url?: string | null;
  contact_email?: string | null;
};

export type ThreadMeta = {
  threadId: string;
  fromDisplay: string;
  fromEmail: string;
  subject: string;
  snippet: string;
};

export type ScoreThreadResult = {
  score: number;
  reason_codes: string[];
  application_id: string;
};

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function senderDomain(fromEmail: string): string | null {
  const at = fromEmail.lastIndexOf("@");
  if (at < 0 || at === fromEmail.length - 1) return null;
  return fromEmail.slice(at + 1).toLowerCase().trim();
}

function hostnameFromPostingUrl(postingUrl: string): string | null {
  const trimmed = postingUrl.trim();
  if (!trimmed) return null;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

function domainFromContactEmail(contactEmail: string): string | null {
  const trimmed = contactEmail.trim();
  if (!trimmed || !trimmed.includes("@")) return null;
  const part = trimmed.split("@").pop();
  if (!part) return null;
  const d = part.toLowerCase().trim();
  return d.startsWith("www.") ? d.slice(4) : d;
}

function collectApplicationHosts(
  posting_url?: string | null,
  contact_email?: string | null,
): string[] {
  const hosts: string[] = [];
  const fromUrl = posting_url ? hostnameFromPostingUrl(String(posting_url)) : null;
  if (fromUrl) hosts.push(fromUrl);
  const fromMail = contact_email
    ? domainFromContactEmail(String(contact_email))
    : null;
  if (fromMail) hosts.push(fromMail);
  return [...new Set(hosts)];
}

function significantWords(normalized: string): Set<string> {
  const words = normalized.split(/\s+/).filter(Boolean);
  return new Set(words.filter((w) => w.length >= 4));
}

function companyMatches(
  normalizedCompany: string,
  fromDisplay: string,
  subject: string,
  snippet: string,
): boolean {
  if (!normalizedCompany) return false;
  const haystacks = [fromDisplay, subject, snippet].map(normalizeText);
  return haystacks.some((h) => h.includes(normalizedCompany));
}

function domainMatch(
  sender: string | null,
  appHosts: string[],
): boolean {
  if (!sender) return false;
  if (GENERIC_EMAIL_DOMAINS.has(sender)) return false;
  return appHosts.some(
    (h) => !GENERIC_EMAIL_DOMAINS.has(h) && h === sender,
  );
}

export function scoreThreadAgainstApplication(
  appRow: ApplicationRowForMatching,
  threadMeta: ThreadMeta,
): ScoreThreadResult {
  const reason_codes: string[] = [];
  let score = 0;

  const normalizedCompany = normalizeText(appRow.company);

  if (companyMatches(normalizedCompany, threadMeta.fromDisplay, threadMeta.subject, threadMeta.snippet)) {
    reason_codes.push("company_match");
    score += 40;
  }

  const snd = senderDomain(threadMeta.fromEmail);
  const appHosts = collectApplicationHosts(appRow.posting_url, appRow.contact_email);
  if (domainMatch(snd, appHosts)) {
    reason_codes.push("domain_match");
    score += 35;
  }

  const titleWords = significantWords(normalizeText(appRow.title));
  const threadText = normalizeText(`${threadMeta.subject} ${threadMeta.snippet}`);
  const threadWords = significantWords(threadText);
  let overlap = 0;
  for (const w of titleWords) {
    if (threadWords.has(w)) overlap += 1;
  }
  const titlePoints = Math.min(15, overlap * 5);
  if (titlePoints > 0) {
    reason_codes.push("title_keyword");
    score += titlePoints;
  }

  score = Math.min(100, score);

  return {
    score,
    reason_codes,
    application_id: appRow.id,
  };
}
