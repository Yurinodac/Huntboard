/**
 * Heuristic rejection detection for recruiting email subject + body.
 */

const REJECTION_PATTERNS: RegExp[] = [
  // User-reported & close variants
  /won['']?t be proceeding(?: with your application)?/i,
  /will not be proceeding(?: with your application)?/i,
  /not be proceeding(?: with your application)?/i,
  /(?:have |has )?decided to move forward with other candidates/i,
  /moving forward with other candidates/i,
  /move forward with other candidates/i,
  /other candidates at this time/i,
  /pursuing other candidates/i,
  /selected other candidates/i,
  /chosen other candidates/i,

  // Common ATS / recruiter wording
  /not moving forward(?: with your application| with you| at this time)?/i,
  /decided not to move forward/i,
  /will not be moving forward/i,
  /unable to move forward with your application/i,
  /not able to move forward with your application/i,
  /regret to inform(?: you)?/i,
  /we regret that we/i,
  /not selected(?: for| to move forward)?/i,
  /were not selected/i,
  /you were not selected/i,
  /passed on your application/i,
  /decided to pass(?: on your application)?/i,
  /will not be advancing/i,
  /not advancing(?: your application)?/i,
  /not be continuing(?: with| your application)/i,
  /no longer (?:be )?considering(?: you| your application)?/i,
  /not under consideration/i,
  /removed from consideration/i,
  /position has been filled/i,
  /role has been filled/i,
  /filled the (?:role|position)/i,
  /unable to offer you (?:a |the )?position/i,
  /cannot offer you (?:a |the )?position/i,
  /not able to offer you/i,
  /close your (?:file|application)/i,
  /closing your application/i,
  /unsuccessful (?:on this occasion|with your application|application)/i,
  /application was unsuccessful/i,
  /not successful(?: this time)?/i,
  /will not be taking your application further/i,
  /not taking your application further/i,
  /end of the process for your application/i,
  /concluded our search/i,
  /completed our hiring process/i,

  /unfortunately.{0,120}(?:not moving forward|other candidates|not proceed|not selected|not advance|won['']?t be proceeding|move forward with other)/i,
  /unfortunately we (?:won['']?t|will not|cannot|are unable to)/i,

  /update on your (?:application|candidacy).{0,200}(?:not moving forward|other candidates|not proceed|regret)/i,
];

/** "Unfortunately" used for rescheduling / logistics — not a rejection */
const UNFORTUNATELY_NON_REJECTION = new RegExp(
  [
    String.raw`\bunfortunately\b.{0,100}(?:reschedule|re-schedule|postpone|delay|conflict|change (?:the |your )?(?:time|date|interview))`,
    String.raw`\bunfortunately\b.{0,60}(?:unable to (?:make|attend)|cannot (?:make|attend))`,
  ].join("|"),
  "i",
);

export function isRejectionEmail(subject: string, snippet: string): boolean {
  const text = `${subject} ${snippet}`.replace(/\s+/g, " ").trim();
  if (!text) return false;

  if (/\bunfortunately\b/i.test(text) && !UNFORTUNATELY_NON_REJECTION.test(text)) {
    return true;
  }

  return REJECTION_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}
