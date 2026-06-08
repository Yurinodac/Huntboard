import { describe, expect, it } from "vitest";
import type { gmail_v1 } from "googleapis";
import { fetchInboxThreads } from "../src/gmail/service.js";

function mockGmailWithInboxAndArchive(): gmail_v1.Gmail {
  return {
    users: {
      threads: {
        list: async () => ({
          data: { threads: [{ id: "in-inbox" }, { id: "archived-only" }] },
        }),
        get: async ({ id }: { id?: string | null }) => {
          if (id === "in-inbox") {
            return {
              data: {
                snippet: "Inbox snippet",
                messages: [
                  {
                    internalDate: "3000",
                    labelIds: ["INBOX"],
                    snippet: "Inbox snippet",
                    payload: {
                      headers: [
                        { name: "From", value: "Jobs <jobs@co.com>" },
                        { name: "Subject", value: "Interview next week" },
                      ],
                    },
                  },
                ],
              },
            };
          }
          return {
            data: {
              snippet: "Old archived",
              messages: [
                {
                  internalDate: "9000",
                  labelIds: ["CATEGORY_UPDATES"],
                  snippet: "Should not appear",
                  payload: {
                    headers: [
                      { name: "From", value: "Old <old@co.com>" },
                      { name: "Subject", value: "Archived thread" },
                    ],
                  },
                },
              ],
            },
          };
        },
      },
    },
  } as unknown as gmail_v1.Gmail;
}

describe("fetchInboxThreads", () => {
  it("drops threads whose messages lack INBOX label", async () => {
    const { threads, inboxEmpty } = await fetchInboxThreads(mockGmailWithInboxAndArchive(), {
      maxResults: 10,
    });
    expect(inboxEmpty).toBe(false);
    expect(threads).toHaveLength(1);
    expect(threads[0].threadId).toBe("in-inbox");
    expect(threads[0].subject).toBe("Interview next week");
  });
});
