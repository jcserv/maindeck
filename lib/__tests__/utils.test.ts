import { describe, expect, it } from "vitest";
import { assertNever, toNameSlug, toTitleCase } from "../utils";

describe("toNameSlug", () => {
  it("kebab-cases a normal card name", () => {
    expect(toNameSlug("Cruel Deceiver")).toBe("cruel-deceiver");
  });

  it("collapses runs of non-alphanumerics into a single dash", () => {
    expect(toNameSlug("Lim-Dûl's  Vault")).toBe("lim-d-l-s-vault");
  });

  it("trims leading and trailing dashes", () => {
    expect(toNameSlug(",Foo,")).toBe("foo");
    expect(toNameSlug("  Bar  ")).toBe("bar");
  });

  it("returns empty string when input has no alphanumerics", () => {
    expect(toNameSlug("____")).toBe("");
    expect(toNameSlug("---")).toBe("");
    expect(toNameSlug("   ")).toBe("");
    expect(toNameSlug("")).toBe("");
  });

  it("treats commas and spaces as equivalent (lossy by design)", () => {
    expect(toNameSlug("Lava Axe")).toBe("lava-axe");
    expect(toNameSlug("Lava, Axe")).toBe("lava-axe");
  });
});

describe("toTitleCase", () => {
  it("capitalizes the first letter of each word", () => {
    expect(toTitleCase("hello world")).toBe("Hello World");
  });

  it("lowercases the rest of the word", () => {
    expect(toTitleCase("HELLO WORLD")).toBe("Hello World");
  });

  it("preserves non-letter separators", () => {
    expect(toTitleCase("foo-bar_baz")).toBe("Foo-Bar_Baz");
  });

  it("handles unicode letters", () => {
    expect(toTitleCase("café déjà")).toBe("Café Déjà");
  });

  it("returns empty string for empty input", () => {
    expect(toTitleCase("")).toBe("");
  });
});

describe("assertNever", () => {
  it("throws with the serialized value when called at runtime", () => {
    // Cast to never to simulate calling from a switch default branch that
    // TypeScript considers unreachable in a fully exhaustive switch.
    expect(() => assertNever("unexpected" as never)).toThrow(
      "Unhandled variant",
    );
  });

  it("includes the value in the error message", () => {
    expect(() => assertNever({ type: "unknown" } as never)).toThrow(
      '{"type":"unknown"}',
    );
  });
});
