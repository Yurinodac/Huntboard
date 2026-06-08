import { describe, expect, it } from "vitest";
import { inferStatusFromEmail } from "../src/gmail/suggestFieldUpdates.js";
import { isRejectionEmail } from "../src/gmail/detectRejection.js";

describe("isRejectionEmail", () => {
  it("detects we won't be proceeding with your application", () => {
    expect(
      isRejectionEmail(
        "Update regarding your application",
        "Thank you for your interest. We won't be proceeding with your application at this time.",
      ),
    ).toBe(true);
  });

  it("detects move forward with other candidates", () => {
    expect(
      isRejectionEmail(
        "Your application to Acme",
        "We have decided to move forward with other candidates at this time.",
      ),
    ).toBe(true);
  });

  it("detects regret to inform and not moving forward", () => {
    expect(
      isRejectionEmail(
        "Software Engineer application",
        "We regret to inform you that we are not moving forward with your application.",
      ),
    ).toBe(true);
  });

  it("does not treat interview scheduling as rejection", () => {
    expect(
      isRejectionEmail(
        "Interview invitation",
        "We would like to schedule your technical interview for next week.",
      ),
    ).toBe(false);
  });

  it("does not treat unfortunately when rescheduling an interview", () => {
    expect(
      isRejectionEmail(
        "Interview update",
        "Unfortunately we need to reschedule your interview to Thursday.",
      ),
    ).toBe(false);
  });

  it("treats unfortunately as rejection in application updates", () => {
    expect(
      isRejectionEmail(
        "Your application",
        "Unfortunately, we have decided not to move forward at this time.",
      ),
    ).toBe(true);
    expect(
      isRejectionEmail(
        "Update on your candidacy",
        "Unfortunately we will not be proceeding with your application.",
      ),
    ).toBe(true);
  });
});

describe("inferStatusFromEmail rejections", () => {
  it("returns rejected for user example phrases", () => {
    expect(
      inferStatusFromEmail(
        "Application update",
        "We won't be proceeding with your application.",
      ),
    ).toBe("rejected");
    expect(
      inferStatusFromEmail(
        "Role at Contoso",
        "We have decided to move forward with other candidates at this time.",
      ),
    ).toBe("rejected");
  });
});
