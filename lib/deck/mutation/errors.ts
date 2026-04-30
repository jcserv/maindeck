import type { LegalityIssue } from "./types";

export class InvariantViolation extends Error {
  readonly issues: LegalityIssue[];

  constructor(issues: LegalityIssue[]) {
    super(
      issues.length === 0
        ? "Deck invariant violation"
        : issues.map((i) => i.message).join("; "),
    );
    this.name = "InvariantViolation";
    this.issues = issues;
  }
}
