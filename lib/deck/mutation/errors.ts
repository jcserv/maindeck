import { formatLegalityIssue } from "@/lib/deck/legality/shared";
import type { LegalityIssue } from "./types";

export class InvariantViolation extends Error {
  readonly issues: LegalityIssue[];

  constructor(issues: LegalityIssue[], name = "InvariantViolation") {
    super(
      issues.length === 0
        ? "Deck invariant violation"
        : issues.map(formatLegalityIssue).join("; "),
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
