import { describe, expect, it } from "vitest";
import { parseConfirmFieldUpdates } from "../src/gmail/parseConfirmPatch.js";

describe("parseConfirmFieldUpdates", () => {
  it("keeps valid fields and drops invalid ones", () => {
    expect(
      parseConfirmFieldUpdates({
        status: "rejected",
        contact_email: "not-an-email",
        notes: "Rejection from Gmail",
      }),
    ).toEqual({
      status: "rejected",
      notes: "Rejection from Gmail",
    });
  });
});
