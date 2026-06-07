import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../status/route";

const SECRET = "test-token";

// Mock getWorld().runs.list to return a minimal valid response
vi.mock("workflow/runtime", () => ({
  getWorld: vi.fn(() => ({
    runs: {
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
  })),
}));

vi.mock("workflow/observability", () => ({
  parseWorkflowName: vi.fn(() => null),
}));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
});

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/ingest/status", {
    method: "GET",
    headers,
  });
}

describe("GET /api/ingest/status", () => {
  it("returns 401 when the authorization header is missing", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns 401 when the bearer token is garbage", async () => {
    const res = await GET(req({ authorization: "Bearer garbage" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the authorization header lacks the Bearer prefix", async () => {
    const res = await GET(req({ authorization: SECRET }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the token is the right length but wrong value", async () => {
    const wrongSameLength = "x".repeat(SECRET.length);
    const res = await GET(req({ authorization: `Bearer ${wrongSameLength}` }));
    expect(res.status).toBe(401);
  });

  it("returns 200 with workflows shape when the bearer token matches", async () => {
    const res = await GET(req({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("workflows");
    expect(body.workflows).toHaveProperty("scryfallIngestWorkflow");
    expect(body.workflows).toHaveProperty("preconIngestWorkflow");
  });
});
