import type { LegalityIssue } from "./types";

export class InvariantViolation extends Error {
  readonly issues: LegalityIssue[];

  constructor(issues: LegalityIssue[], name = "InvariantViolation") {
    super(
      issues.length === 0
        ? "Deck invariant violation"
        : issues.map((i) => i.message).join("; "),
    );
    this.name = name;
    this.issues = issues;
  }
}

export class StructuralViolation extends InvariantViolation {
  constructor(issues: LegalityIssue[]) {
    super(issues, "StructuralViolation");
  }
}

export class LegalityViolation extends InvariantViolation {
  constructor(issues: LegalityIssue[]) {
    super(issues, "LegalityViolation");
  }
}
