import { describe, expect, it } from "vitest";
import { detectSourceFromPostingUrl } from "../src/import/detectSource.js";

describe("detectSourceFromPostingUrl", () => {
  it("detects linkedin", () => {
    expect(detectSourceFromPostingUrl("https://www.linkedin.com/jobs/view/123")).toBe("linkedin");
  });

  it("detects job boards", () => {
    expect(detectSourceFromPostingUrl("https://boards.greenhouse.io/acme/jobs/1")).toBe(
      "job_board",
    );
    expect(detectSourceFromPostingUrl("https://www.indeed.com/viewjob?jk=abc")).toBe("job_board");
  });

  it("detects company site", () => {
    expect(detectSourceFromPostingUrl("https://careers.stripe.com/job/123")).toBe("company_site");
  });

  it("detects paste and manual", () => {
    expect(detectSourceFromPostingUrl("pasted://job-description")).toBe("paste");
    expect(detectSourceFromPostingUrl("")).toBe("manual");
  });
});
