import { beforeEach, describe, expect, it, vi } from "vitest";
import { scryfallIngestWorkflow } from "@/workflows/scryfall/ingest";
import { GET, POST } from "../route";

vi.mock("workflow/api", () => ({
  start: vi.fn().mockResolvedValue({ runId: "abc" }),
}));

vi.mock("@/workflows/scryfall/ingest", () => ({
  scryfallIngestWorkflow: { __marker: "scryfall-workflow" },
}));

const SECRET = "test-token";

function req(
  method: "GET" | "POST",
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/ingest", { method, headers });
}

beforeEach(async () => {
  vi.stubEnv("CRON_SECRET", SECRET);
  const { start } = await import("workflow/api");
  vi.mocked(start).mockClear();
});

describe.each(["POST", "GET"] as const)("%s /api/ingest", (method) => {
  const handler = method === "POST" ? POST : GET;

  it("returns 401 when the authorization header is missing", async () => {
    const { start } = await import("workflow/api");
    const res = await handler(req(method));
    expect(res.status).toBe(401);
    expect(start).not.toHaveBeenCalled();
  });

  it("returns 401 when the bearer token is wrong", async () => {
    const { start } = await import("workflow/api");
    const res = await handler(req(method, { authorization: "Bearer nope" }));
    expect(res.status).toBe(401);
    expect(start).not.toHaveBeenCalled();
  });

  it("returns 401 when the token is the right length but wrong value", async () => {
    const { start } = await import("workflow/api");
    const wrongSameLength = "x".repeat(SECRET.length);
    const res = await handler(
      req(method, { authorization: `Bearer ${wrongSameLength}` }),
    );
    expect(res.status).toBe(401);
    expect(start).not.toHaveBeenCalled();
  });

  it("returns 401 when the authorization header lacks the Bearer prefix", async () => {
    const { start } = await import("workflow/api");
    const res = await handler(req(method, { authorization: SECRET }));
    expect(res.status).toBe(401);
    expect(start).not.toHaveBeenCalled();
  });

  it("starts the workflow and returns runId when the token matches", async () => {
    const { start } = await import("workflow/api");
    const res = await handler(
      req(method, { authorization: `Bearer ${SECRET}` }),
    );
    const body = await res.json();
    expect(body).toEqual({ runId: "abc" });
    expect(start).toHaveBeenCalledWith(scryfallIngestWorkflow);
  });
});
