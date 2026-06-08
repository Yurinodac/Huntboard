export type EmailExtract = {
  company: string;
  title: string;
  contact_email?: string;
  contact_name?: string;
  notes?: string;
};

function parseFromHeader(from: string): { display: string; email: string } {
  const trimmed = from.trim();
  const m = /^(.*?)(?:<([^>]+)>)?$/.exec(trimmed);
  const display = (m?.[1] ?? "").replace(/^"|"$/g, "").trim();
  const email = (m?.[2] ?? "").trim().toLowerCase();
  return { display: display || email, email };
}

function companyFromEmailDomain(email: string): string | undefined {
  const domain = email.split("@")[1];
  if (!domain) return undefined;
  const generic = new Set([
    "gmail.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
    "icloud.com",
    "googlemail.com",
  ]);
  if (generic.has(domain)) return undefined;
  const base = domain.replace(/^www\./, "").split(".")[0];
  if (!base) return undefined;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function companyFromDisplay(display: string): string | undefined {
  const cleaned = display
    .replace(/\b(recruiting|talent|careers|hr|hiring|noreply|no-reply)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 2) return undefined;
  const first = cleaned.split(/\s+/)[0];
  if (first && first.length > 1) return first;
  return cleaned;
}

function titleFromSubject(subject: string): string | undefined {
  let s = subject.trim();
  const noise = [
    /^re:\s*/i,
    /^fwd:\s*/i,
    /\b(application|applied|interview|opportunity|position|role)\b/gi,
    /\b(update on|regarding|thanks for applying)\b/gi,
  ];
  for (const re of noise) s = s.replace(re, " ").replace(/\s+/g, " ").trim();

  const patterns = [
    /^(.+?)\s+at\s+(.+)$/i,
    /^(.+?)\s*[-–]\s*(.+?)(?:\s*[-–].*)?$/,
    /^your\s+(.+?)\s+application/i,
    /^(.+?)\s+application\s+update/i,
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (m?.[1]) return m[1].trim();
  }

  if (s.length >= 4 && s.length <= 120) return s;
  return undefined;
}

export function extractApplicationFromEmail(input: {
  from: string;
  subject: string;
  snippet?: string;
}): EmailExtract {
  const { display, email } = parseFromHeader(input.from);
  const company =
    companyFromDisplay(display) ?? companyFromEmailDomain(email) ?? "Unknown company";
  const title = titleFromSubject(input.subject) ?? "Role (from email)";
  const contact_name = display && display !== email ? display : undefined;

  return {
    company,
    title,
    contact_email: email || undefined,
    contact_name,
    notes: input.snippet?.slice(0, 300) || undefined,
  };
}
