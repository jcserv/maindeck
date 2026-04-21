import "@testing-library/jest-dom/vitest";
import "vitest-axe/extend-expect";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom does not implement IntersectionObserver (used by app/_components/link.tsx)
if (typeof globalThis.IntersectionObserver === "undefined") {
  class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    root = null;
    rootMargin = "";
    thresholds: ReadonlyArray<number> = [];
    takeRecords(): IntersectionObserverEntry[] { return []; }
  }
  globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
}

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.CRON_SECRET ??= "test-token";
process.env.RESEND_API_KEY ??= "test-resend-key";
process.env.EMAIL_FROM ??= "test@test.com";

// Node 25 exposes a built-in `localStorage`/`sessionStorage` global that shadows
// jsdom's implementation and lacks the Web Storage API methods. Restore jsdom's
// versions so components that read from storage work in tests.
for (const name of ["localStorage", "sessionStorage"] as const) {
  const internal = (window as unknown as Record<string, Storage | undefined>)[
    `_${name}`
  ];
  if (internal) {
    Object.defineProperty(window, name, { configurable: true, value: internal });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: internal,
    });
  }
}

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  cleanup();
});
