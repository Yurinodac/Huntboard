import type { gmail_v1 } from "googleapis";
import type { ThreadMeta } from "../matching/scoreThread.js";

const INBOX_QUERY = "in:inbox -in:spam -in:trash";

function readHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  const found = headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return found?.value?.trim() ?? "";
}

function parseFromHeader(fromHeader: string): { fromDisplay: string; fromEmail: string } {
  const trimmed = fromHeader.trim();
  const match = /^(.*?)(?:<([^>]+)>)?$/.exec(trimmed);
  if (!match) {
    return { fromDisplay: "", fromEmail: trimmed.toLowerCase() };
  }

  const display = (match[1] ?? "").replace(/^"|"$/g, "").trim();
  const email = (match[2] ?? match[1] ?? "").trim().toLowerCase();

  if (email.includes("@")) {
    return {
      fromDisplay: display || email,
      fromEmail: email,
    };
  }

  return {
    fromDisplay: display || trimmed,
    fromEmail: "",
  };
}

function messageInInbox(message: gmail_v1.Schema$Message): boolean {
  return message.labelIds?.includes("INBOX") ?? false;
}

/** Prefer the newest message that still has the INBOX label */
function pickInboxMessage(
  messages: gmail_v1.Schema$Message[],
): gmail_v1.Schema$Message | undefined {
  const inboxMessages = messages.filter(messageInInbox);
  if (inboxMessages.length === 0) return undefined;

  return [...inboxMessages].sort(
    (a, b) => Number(b.internalDate ?? 0) - Number(a.internalDate ?? 0),
  )[0];
}

function threadToMeta(threadId: string, detail: gmail_v1.Schema$Thread): ThreadMeta | null {
  const messages = detail.messages ?? [];
  const message = pickInboxMessage(messages);
  if (!message) return null;

  const headers = message.payload?.headers;
  const fromHeader = readHeader(headers, "From");
  const subject = readHeader(headers, "Subject");
  const parsedFrom = parseFromHeader(fromHeader);

  return {
    threadId,
    fromDisplay: parsedFrom.fromDisplay,
    fromEmail: parsedFrom.fromEmail,
    subject,
    snippet: message.snippet ?? detail.snippet ?? "",
  };
}

/** Threads with at least one INBOX-labeled message (verified after fetch). */
export async function fetchInboxThreads(
  gmail: gmail_v1.Gmail,
  options: { maxResults: number },
): Promise<{ threads: ThreadMeta[]; inboxEmpty: boolean }> {
  const list = await gmail.users.threads.list({
    userId: "me",
    q: INBOX_QUERY,
    maxResults: options.maxResults,
  });

  const threadIds = (list.data.threads ?? [])
    .map((thread) => thread.id)
    .filter((id): id is string => Boolean(id));

  if (threadIds.length === 0) {
    return { threads: [], inboxEmpty: true };
  }

  const threads: ThreadMeta[] = [];

  for (const threadId of threadIds) {
    const detail = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "metadata",
      metadataHeaders: ["From", "Subject"],
    });

    const meta = threadToMeta(threadId, detail.data);
    if (meta) threads.push(meta);
  }

  return { threads, inboxEmpty: threads.length === 0 };
}

/** @deprecated Use fetchInboxThreads */
export async function fetchRecentThreads(
  gmail: gmail_v1.Gmail,
  options: { newerThanDays: number; maxResults: number },
): Promise<ThreadMeta[]> {
  const { threads } = await fetchInboxThreads(gmail, { maxResults: options.maxResults });
  return threads;
}
