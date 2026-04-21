import { describe, expect, it } from "vitest";
import { MTG_FORMATS, normalizeLegalities } from "../formats";

describe("normalizeLegalities", () => {
  it("defaults every format to not_legal when raw is undefined", () => {
    const out = normalizeLegalities(undefined);
    for (const fmt of MTG_FORMATS) {
      expect(out[fmt]).toBe("not_legal");
    }
  });

  it("round-trips every known format + status", () => {
    const raw: Record<string, string> = {};
    for (const fmt of MTG_FORMATS) raw[fmt] = "legal";
    const out = normalizeLegalities(raw);
    for (const fmt of MTG_FORMATS) expect(out[fmt]).toBe("legal");

    for (const status of ["legal", "not_legal", "banned", "restricted"] as const) {
      const out2 = normalizeLegalities({ standard: status });
      expect(out2.standard).toBe(status);
    }
  });

  it("drops unknown format keys", () => {
    const out = normalizeLegalities({
      standard: "legal",
      bogus_format: "legal",
    });
    expect(out.standard).toBe("legal");
    expect("bogus_format" in out).toBe(false);
  });

  it("drops unknown status values (falls through to not_legal default)", () => {
    const out = normalizeLegalities({ standard: "kinda_legal" });
    expect(out.standard).toBe("not_legal");
  });

  it("returns exactly the MTG_FORMATS keys with no extras", () => {
    const out = normalizeLegalities({ standard: "legal" });
    expect(Object.keys(out).sort()).toEqual([...MTG_FORMATS].sort());
  });
});
