import { afterEach, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.CRON_SECRET ??= "test-token";
process.env.RESEND_API_KEY ??= "test-resend-key";
process.env.EMAIL_FROM ??= "test@test.com";

afterEach(() => {
  vi.unstubAllEnvs();
});
