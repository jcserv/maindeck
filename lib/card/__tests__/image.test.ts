import { describe, expect, it } from "vitest";
import { resolveCardImage } from "../image";

describe("resolveCardImage", () => {
  it("prefers the pinned printing's image", () => {
    const result = resolveCardImage({
      printing: { imageUri: "pinned.jpg" },
      card: { printings: [{ imageUri: "fallback.jpg" }] },
    });
    expect(result).toBe("pinned.jpg");
  });

  it("falls back to the card's first printing when no pin", () => {
    const result = resolveCardImage({
      printing: null,
      card: { printings: [{ imageUri: "first.jpg" }] },
    });
    expect(result).toBe("first.jpg");
  });

  it("falls back to first printing when pinned printing has no image", () => {
    const result = resolveCardImage({
      printing: { imageUri: null },
      card: { printings: [{ imageUri: "first.jpg" }] },
    });
    expect(result).toBe("first.jpg");
  });

  it("returns null when neither printing nor card image exists", () => {
    expect(
      resolveCardImage({ printing: null, card: { printings: [] } }),
    ).toBeNull();
    expect(
      resolveCardImage({
        printing: null,
        card: { printings: [{ imageUri: null }] },
      }),
    ).toBeNull();
  });

  it("treats undefined printing as no pin", () => {
    const result = resolveCardImage({
      printing: undefined,
      card: { printings: [{ imageUri: "first.jpg" }] },
    });
    expect(result).toBe("first.jpg");
  });
});
