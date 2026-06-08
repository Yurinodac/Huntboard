import { describe, expect, it } from "vitest";
import { extractApplicationFromEmail } from "../src/import/extractFromEmail.js";
import {
  fetchJobPage,
  JobPageFetchError,
  parseJobPageHtml,
  parsePastedJobText,
} from "../src/import/parseJobPage.js";

describe("parseJobPageHtml", () => {
  it("reads JSON-LD JobPosting with description", () => {
    const html = `
      <script type="application/ld+json">
      {"@type":"JobPosting","title":"Platform Engineer","description":"<p>Build APIs</p><p>5+ years exp</p>","hiringOrganization":{"name":"Acme Corp"}}
      </script>
    `;
    const r = parseJobPageHtml(html, "https://jobs.acme.com/123");
    expect(r.company).toBe("Acme Corp");
    expect(r.title).toBe("Platform Engineer");
    expect(r.job_summary).toContain("Build APIs");
    expect(r.sources).toContain("json-ld");
  });

  it("parses og:title with at-pattern on company site", () => {
    const html = `
      <meta property="og:title" content="Data Analyst at Contoso" />
      <meta property="og:site_name" content="Contoso Careers" />
      <meta property="og:description" content="Analyze data across teams. Remote OK." />
    `;
    const r = parseJobPageHtml(html, "https://careers.contoso.com/job/1");
    expect(r.title).toBe("Data Analyst");
    expect(r.company).toBe("Contoso Careers");
    expect(r.job_summary).toContain("Analyze data");
  });

  it("parses LinkedIn-style title and embedded JSON", () => {
    const html = `
      <title>Software Engineer - Stripe | LinkedIn</title>
      <meta property="og:description" content="Join our payments team." />
      "companyName":"Stripe",
      "title":"Software Engineer",
      "description":"We are looking for a backend engineer with 3+ years experience in distributed systems."
    `;
    const r = parseJobPageHtml(html, "https://www.linkedin.com/jobs/view/12345");
    expect(r.company).toBe("Stripe");
    expect(r.title).toBe("Software Engineer");
    expect(r.sources).toContain("linkedin");
    expect(r.job_summary?.length).toBeGreaterThan(40);
  });

  it("warns on LinkedIn auth wall", () => {
    const html = `<title>Sign In | LinkedIn</title><body>Join LinkedIn</body>`;
    const r = parseJobPageHtml(html, "https://www.linkedin.com/jobs/view/99");
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("fetchJobPage", () => {
  it("rejects LinkedIn URLs without calling the network", async () => {
    await expect(
      fetchJobPage("https://www.linkedin.com/jobs/view/12345"),
    ).rejects.toBeInstanceOf(JobPageFetchError);
    await expect(
      fetchJobPage("https://www.linkedin.com/jobs/view/12345"),
    ).rejects.toMatchObject({ code: "LINKEDIN_BLOCKED" });
  });
});

describe("parsePastedJobText salary", () => {
  it("extracts salary range from pasted description", () => {
    const text = `Product Manager
Acme Corp

Salary Range: $65,000 - $85,000 per year

Lead cross-functional teams.`;
    const r = parsePastedJobText(text);
    expect(r.salary_min).toBe(65_000);
    expect(r.salary_max).toBe(85_000);
    expect(r.sources).toContain("salary-parse");
  });
});

describe("parsePastedJobText", () => {
  it("parses title and company from first lines", () => {
    const text = `Software Engineer
Stripe

We are looking for a backend engineer with distributed systems experience.`;
    const r = parsePastedJobText(
      text,
      "https://www.linkedin.com/jobs/view/99",
    );
    expect(r.title).toBe("Software Engineer");
    expect(r.company).toBe("Stripe");
    expect(r.job_summary).toContain("distributed systems");
    expect(r.sources).toContain("paste");
  });
});

describe("extractApplicationFromEmail", () => {
  it("extracts from recruiting sender", () => {
    const r = extractApplicationFromEmail({
      from: "Stripe Recruiting <no-reply@stripe.com>",
      subject: "Update on your Software Engineer application",
      snippet: "Thanks for applying",
    });
    expect(r.company).toBe("Stripe");
    expect(r.title.toLowerCase()).toContain("software engineer");
    expect(r.contact_email).toBe("no-reply@stripe.com");
  });
});
