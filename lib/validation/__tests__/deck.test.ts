import { describe, expect, it } from "vitest";
import { Format, Visibility } from "@/lib/generated/prisma/enums";
import {
  CATEGORY_NAME_MAX,
  DECK_DESCRIPTION_MAX,
  DECK_NAME_MAX,
  IMPORT_TEXT_MAX,
  categoryDeleteModeSchema,
  categoryNameSchema,
  createDeckSchema,
  createDeckWithImportSchema,
  deckDescriptionSchema,
  parseDeckForm,
  reorderCategoriesSchema,
  updateDeckSchema,
} from "../deck";

describe("createDeckSchema", () => {
  it("trims names and falls back to 'Untitled Deck' when empty/whitespace", () => {
    expect(
      createDeckSchema.parse({
        name: "  My Deck  ",
        format: Format.COMMANDER,
        visibility: Visibility.PRIVATE,
        description: "",
      }).name,
    ).toBe("My Deck");

    expect(
      createDeckSchema.parse({
        name: "   ",
        format: Format.COMMANDER,
        visibility: Visibility.PRIVATE,
      }).name,
    ).toBe("Untitled Deck");

    expect(
      createDeckSchema.parse({
        name: "",
        format: Format.COMMANDER,
        visibility: Visibility.PRIVATE,
      }).name,
    ).toBe("Untitled Deck");
  });

  it("rejects names longer than DECK_NAME_MAX", () => {
    expect(() =>
      createDeckSchema.parse({
        name: "x".repeat(DECK_NAME_MAX + 1),
        format: Format.COMMANDER,
        visibility: Visibility.PRIVATE,
      }),
    ).toThrow();
  });

  it("falls back to COMMANDER for an unknown format", () => {
    const result = createDeckSchema.parse({
      name: "Deck",
      format: "GARBAGE",
      visibility: Visibility.PRIVATE,
    });
    expect(result.format).toBe(Format.COMMANDER);
  });

  it("falls back to PRIVATE for an unknown visibility", () => {
    const result = createDeckSchema.parse({
      name: "Deck",
      format: Format.COMMANDER,
      visibility: "LIGHT-BLUE",
    });
    expect(result.visibility).toBe(Visibility.PRIVATE);
  });

  it("normalizes whitespace-only description to null", () => {
    expect(
      createDeckSchema.parse({
        name: "Deck",
        format: Format.COMMANDER,
        visibility: Visibility.PRIVATE,
        description: "   ",
      }).description,
    ).toBeNull();
  });

  it("keeps a real description (trimmed)", () => {
    expect(
      createDeckSchema.parse({
        name: "Deck",
        format: Format.COMMANDER,
        visibility: Visibility.PRIVATE,
        description: "  notes ",
      }).description,
    ).toBe("notes");
  });
});

describe("updateDeckSchema", () => {
  it("makes name optional", () => {
    const result = updateDeckSchema.parse({
      format: Format.STANDARD,
      visibility: Visibility.PUBLIC,
    });
    expect(result.name).toBeUndefined();
  });

  it("rejects an empty name when one is supplied", () => {
    expect(() =>
      updateDeckSchema.parse({
        name: "   ",
        format: Format.STANDARD,
        visibility: Visibility.PUBLIC,
      }),
    ).toThrow();
  });

  it("applies enum fallbacks like createDeckSchema", () => {
    const result = updateDeckSchema.parse({
      name: "Deck",
      format: "NOT_A_FORMAT",
      visibility: "NOT_A_VISIBILITY",
    });
    expect(result.format).toBe(Format.COMMANDER);
    expect(result.visibility).toBe(Visibility.PRIVATE);
  });
});

describe("deckDescriptionSchema", () => {
  it("trims the description", () => {
    expect(deckDescriptionSchema.parse("  hello  ")).toBe("hello");
  });

  it("rejects strings over DECK_DESCRIPTION_MAX", () => {
    expect(() =>
      deckDescriptionSchema.parse("x".repeat(DECK_DESCRIPTION_MAX + 1)),
    ).toThrow();
  });
});

describe("categoryNameSchema", () => {
  it("rejects empty and whitespace-only names", () => {
    expect(() => categoryNameSchema.parse("")).toThrow();
    expect(() => categoryNameSchema.parse("   ")).toThrow();
  });

  it("trims valid names", () => {
    expect(categoryNameSchema.parse("  Ramp  ")).toBe("Ramp");
  });

  it("rejects names over CATEGORY_NAME_MAX", () => {
    expect(() =>
      categoryNameSchema.parse("x".repeat(CATEGORY_NAME_MAX + 1)),
    ).toThrow();
  });
});

describe("reorderCategoriesSchema", () => {
  it("accepts up to 200 trimmed, non-empty entries", () => {
    const result = reorderCategoriesSchema.parse(
      Array.from({ length: 200 }, (_, i) => `cat-${i}`),
    );
    expect(result).toHaveLength(200);
  });

  it("rejects more than 200 entries", () => {
    expect(() =>
      reorderCategoriesSchema.parse(
        Array.from({ length: 201 }, (_, i) => `cat-${i}`),
      ),
    ).toThrow();
  });

  it("rejects empty strings in the array", () => {
    expect(() => reorderCategoriesSchema.parse(["Ramp", ""])).toThrow();
    expect(() => reorderCategoriesSchema.parse(["Ramp", "   "])).toThrow();
  });
});

describe("categoryDeleteModeSchema", () => {
  it("accepts the two valid modes", () => {
    expect(categoryDeleteModeSchema.parse("uncategorize")).toBe("uncategorize");
    expect(categoryDeleteModeSchema.parse("deleteCards")).toBe("deleteCards");
  });

  it("rejects unknown modes", () => {
    expect(() => categoryDeleteModeSchema.parse("nuke")).toThrow();
    expect(() => categoryDeleteModeSchema.parse("")).toThrow();
  });
});

describe("createDeckWithImportSchema", () => {
  it("requires a non-empty name", () => {
    expect(() =>
      createDeckWithImportSchema.parse({
        name: "   ",
        importText: "",
      }),
    ).toThrow();
  });

  it("rejects importText over IMPORT_TEXT_MAX (DoS guard)", () => {
    expect(() =>
      createDeckWithImportSchema.parse({
        name: "Deck",
        importText: "x".repeat(IMPORT_TEXT_MAX + 1),
      }),
    ).toThrow();
  });

  it("accepts a minimal valid payload", () => {
    const result = createDeckWithImportSchema.parse({
      name: "Deck",
      importText: "1 Lightning Bolt",
    });
    expect(result.name).toBe("Deck");
    expect(result.importText).toBe("1 Lightning Bolt");
    expect(result.format).toBeUndefined();
    expect(result.visibility).toBeUndefined();
  });
});

describe("parseDeckForm", () => {
  function formData(entries: Record<string, string>): FormData {
    const fd = new FormData();
    for (const [k, v] of Object.entries(entries)) fd.set(k, v);
    return fd;
  }

  it("pulls only the listed fields", () => {
    const fd = formData({
      name: "Deck",
      format: Format.COMMANDER,
      visibility: Visibility.PRIVATE,
      description: "extra",
      unrelated: "ignored",
    });

    const result = parseDeckForm(createDeckSchema, fd, [
      "name",
      "format",
      "visibility",
    ]);

    expect(result.name).toBe("Deck");
    expect(result.format).toBe(Format.COMMANDER);
    expect(result.visibility).toBe(Visibility.PRIVATE);
    expect(result.description).toBeNull();
  });

  it("omits missing FormData keys cleanly", () => {
    const fd = formData({ name: "Deck" });

    const result = parseDeckForm(createDeckSchema, fd, [
      "name",
      "format",
      "visibility",
    ]);

    expect(result.name).toBe("Deck");
    expect(result.format).toBe(Format.COMMANDER);
    expect(result.visibility).toBe(Visibility.PRIVATE);
  });

  it("throws on schema failure", () => {
    const fd = formData({ name: "x".repeat(DECK_NAME_MAX + 1) });
    expect(() =>
      parseDeckForm(createDeckSchema, fd, ["name"]),
    ).toThrow();
  });
});
