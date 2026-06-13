import { describe, expect, it } from "vitest";
import {
  buildFieldUpdateSuggestions,
  inferStatusFromEmail,
  patchFromFieldUpdates,
} from "../src/gmail/suggestFieldUpdates.js";

describe("inferStatusFromEmail", () => {
  it("detects preliminary assessment emails", () => {
    expect(
      inferStatusFromEmail(
        "Complete your skills assessment",
        "Please finish the HackerRank test within 5 days",
      ),
    ).toBe("pre_assessment");
  });

  it("detects interview invites", () => {
    expect(
      inferStatusFromEmail("Next step: technical interview", "Please pick a time for your interview"),
    ).toBe("interview");
  });

  it("detects rejections", () => {
    expect(
      inferStatusFromEmail("Update on your application", "Unfortunately we are not moving forward"),
    ).toBe("rejected");
  });
});

describe("buildFieldUpdateSuggestions", () => {
  it("suggests notes append and contact from recruiting email", () => {
    const rows = buildFieldUpdateSuggestions(
      {
        id: "a1",
        company: "Stripe",
        title: "Software Engineer",
        status: "applied",
        notes: null,
        contact_email: null,
        contact_name: null,
      },
      {
        from: "Stripe Recruiting <jobs@stripe.com>",
        subject: "Software engineer application update",
        snippet: "Thanks for applying — we will review shortly",
      },
      "2026-05-11T12:00:00.000Z",
    );
    expect(rows.some((r) => r.field === "notes")).toBe(true);
    expect(rows.some((r) => r.field === "contact_email")).toBe(true);
  });

  it("suggests rejected status from body text when snippet is short", () => {
    const rows = buildFieldUpdateSuggestions(
      {
        id: "a1",
        company: "Acme",
        title: "Engineer",
        status: "interview",
        notes: null,
        contact_email: null,
        contact_name: null,
      },
      {
        from: "Recruiting <jobs@acme.com>",
        subject: "Your application",
        snippet: "Thank you for your interest",
        bodyText:
          "Thank you for your interest. Unfortunately we have decided to move forward with other candidates.",
      },
    );
    expect(rows.some((r) => r.field === "status" && r.proposed.toLowerCase() === "rejected")).toBe(
      true,
    );
  });
});

describe("patchFromFieldUpdates", () => {
  it("builds patch from selected rows", () => {
    const rows = [
      {
        field: "status",
        label: "Status",
        current: "applied",
        proposed: "interview",
        reason: "test",
      },
    ];
    expect(patchFromFieldUpdates(rows, new Set(["status"]))).toEqual({ status: "interview" });
  });
});
