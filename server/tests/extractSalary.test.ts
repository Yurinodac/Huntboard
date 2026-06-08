import { describe, expect, it } from "vitest";
import {
  extractSalaryFromJobPostingJson,
  extractSalaryRange,
  hourlyToAnnual,
  HOURS_PER_YEAR,
  parseMoneyAmount,
} from "../src/import/extractSalary.js";

describe("parseMoneyAmount", () => {
  it("parses comma and decimal dollars", () => {
    expect(parseMoneyAmount("$100,000.00")).toBe(100_000);
    expect(parseMoneyAmount("$50,000")).toBe(50_000);
  });

  it("parses k suffix", () => {
    expect(parseMoneyAmount("80k")).toBe(80_000);
  });
});

describe("extractSalaryRange", () => {
  it("parses dash range with dollars", () => {
    expect(extractSalaryRange("$50,000 - $80,000")).toEqual({
      salary_min: 50_000,
      salary_max: 80_000,
    });
  });

  it("parses salary range label with per year", () => {
    expect(extractSalaryRange("Salary Range: $65,000 - $85,000 per year")).toEqual({
      salary_min: 65_000,
      salary_max: 85_000,
    });
  });

  it("parses decimal range with slash year", () => {
    expect(extractSalaryRange("$100,000.00 - $115,000.00 / year")).toEqual({
      salary_min: 100_000,
      salary_max: 115_000,
    });
  });

  it("parses between phrasing across lines", () => {
    const text = `The expected base rate for this role is between

$50,000 - $80,000`;
    expect(extractSalaryRange(text)).toEqual({
      salary_min: 50_000,
      salary_max: 80_000,
    });
  });

  it("parses between X and Y", () => {
    expect(extractSalaryRange("Compensation is between $90,000 and $110,000 annually")).toEqual({
      salary_min: 90_000,
      salary_max: 110_000,
    });
  });

  it("converts hourly range to annual with disclosure", () => {
    const result = extractSalaryRange("$25 - $35 / hour");
    expect(result).toEqual({
      salary_min: hourlyToAnnual(25),
      salary_max: hourlyToAnnual(35),
      salary_disclosure: expect.stringContaining("posted as"),
    });
    expect(result?.salary_disclosure).toMatch(/\$25.*\$35\/hr/i);
    expect(result?.salary_disclosure).toMatch(/2,080|2080/);
  });

  it("converts single hourly rate", () => {
    const result = extractSalaryRange("Pay is $48.50/hour for this contract role");
    expect(result?.salary_min).toBe(hourlyToAnnual(48.5));
    expect(result?.salary_max).toBe(hourlyToAnnual(48.5));
    expect(result?.salary_disclosure).toBeDefined();
  });
});

describe("extractSalaryFromJobPostingJson", () => {
  it("reads schema.org baseSalary value object", () => {
    const range = extractSalaryFromJobPostingJson({
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "USD",
        value: {
          "@type": "QuantitativeValue",
          minValue: 65_000,
          maxValue: 85_000,
          unitText: "YEAR",
        },
      },
    });
    expect(range).toEqual({ salary_min: 65_000, salary_max: 85_000 });
  });

  it("converts schema.org hourly baseSalary", () => {
    const range = extractSalaryFromJobPostingJson({
      baseSalary: {
        value: {
          minValue: 30,
          maxValue: 42,
          unitText: "HOUR",
        },
      },
    });
    expect(range?.salary_min).toBe(hourlyToAnnual(30));
    expect(range?.salary_max).toBe(hourlyToAnnual(42));
    expect(range?.salary_disclosure).toBeDefined();
  });
});
