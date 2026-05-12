import { describe, expect, it } from "vitest";
import { scoreThreadAgainstApplication } from "../src/matching/scoreThread.js";

const baseApp = {
  id: "a1",
  company: "Stripe",
  title: "Software Engineer",
  posting_url: "https://stripe.com/jobs/123",
  contact_email: "jobs@stripe.com",
};

describe("scoreThreadAgainstApplication", () => {
  it("scores domain + company", () => {
    const r = scoreThreadAgainstApplication(baseApp, {
      threadId: "t1",
      fromDisplay: "Stripe Recruiting",
      fromEmail: "no-reply@stripe.com",
      subject: "Update on your application",
      snippet: "Thank you for applying",
    });
    expect(r.score).toBeGreaterThanOrEqual(40);
    expect(r.reason_codes).toContain("company_match");
    expect(r.reason_codes).toContain("domain_match");
  });

  it("ignores generic email domain", () => {
    const r = scoreThreadAgainstApplication(
      { ...baseApp, posting_url: "", contact_email: "me@gmail.com" },
      {
        threadId: "t2",
        fromDisplay: "Bob",
        fromEmail: "bob@gmail.com",
        subject: "Hello",
        snippet: "Hi",
      },
    );
    expect(r.reason_codes).not.toContain("domain_match");
  });
});
