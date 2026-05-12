import type { gmail_v1 } from "googleapis";
import type { ThreadMeta } from "../matching/scoreThread.js";

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

export async function fetchRecentThreads(
  gmail: gmail_v1.Gmail,
  options: { newerThanDays: number; maxResults: number },
): Promise<ThreadMeta[]> {
  const list = await gmail.users.threads.list({
    userId: "me",
    q: `newer_than:${options.newerThanDays}d`,
    maxResults: options.maxResults,
  });

  const threadIds = (list.data.threads ?? [])
    .map((thread) => thread.id)
    .filter((id): id is string => Boolean(id));

  const threads = await Promise.all(
    threadIds.map(async (threadId) => {
      const detail = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "metadata",
        metadataHeaders: ["From", "Subject"],
      });

      const message = detail.data.messages?.[0];
      const headers = message?.payload?.headers;
      const fromHeader = readHeader(headers, "From");
      const subject = readHeader(headers, "Subject");
      const parsedFrom = parseFromHeader(fromHeader);

      return {
        threadId,
        fromDisplay: parsedFrom.fromDisplay,
        fromEmail: parsedFrom.fromEmail,
        subject,
        snippet: detail.data.snippet ?? "",
      };
    }),
  );

  return threads;
}
