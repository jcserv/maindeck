import { describe, expect, it } from "vitest";
import { InvariantViolation } from "../errors";

describe("InvariantViolation", () => {
  it("carries the issue list and joins messages", () => {
    const issues = [
      { kind: "singleton_violation" as const, cardName: "Sol Ring", quantity: 2 },
      { kind: "category_zone_mismatch" as const },
    ];
    const err = new InvariantViolation(issues);
    expect(err.issues).toEqual(issues);
    expect(err.name).toBe("InvariantViolation");
    expect(err.message).toContain("Sol Ring");
    expect(err.message).toContain("Subcategor");
  });

  it("survives instanceof check", () => {
    const err = new InvariantViolation([]);
    expect(err instanceof InvariantViolation).toBe(true);
    expect(err instanceof Error).toBe(true);
  });
});
