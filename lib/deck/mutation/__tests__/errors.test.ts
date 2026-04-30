import { describe, expect, it } from "vitest";
import { InvariantViolation } from "../errors";

describe("InvariantViolation", () => {
  it("carries the issue list and joins messages", () => {
    const issues = [
      { code: "singleton_violation", message: "Sol Ring: 2 copies" },
      { code: "category_zone_mismatch", message: "Subcategory rule" },
    ];
    const err = new InvariantViolation(issues);
    expect(err.issues).toEqual(issues);
    expect(err.name).toBe("InvariantViolation");
    expect(err.message).toContain("Sol Ring");
    expect(err.message).toContain("Subcategory");
  });

  it("survives instanceof check", () => {
    const err = new InvariantViolation([]);
    expect(err instanceof InvariantViolation).toBe(true);
    expect(err instanceof Error).toBe(true);
  });
});
