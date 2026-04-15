import { afterEach, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INGEST_TOKEN ??= "test-token";

afterEach(() => {
  vi.unstubAllEnvs();
});
