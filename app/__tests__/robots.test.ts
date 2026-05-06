import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import robots from "../robots";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots", () => {
  it("allows /deck/ and /decks/ for all crawlers, disallows internals", () => {
    const result = robots();
    expect(result).toEqual({
      rules: [
        {
          userAgent: "*",
          allow: ["/", "/deck/", "/decks/"],
          disallow: ["/api/", "/_next/"],
        },
      ],
      sitemap: "https://example.test/sitemap.xml",
      host: "https://example.test",
    });
  });
});
