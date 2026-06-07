import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../[runId]/progress/route";

const SECRET = "test-token";

const mockReadable = new ReadableStream({
  start(controller) {
    controller.close();
  },
});

const mockRun = {
  exists: Promise.resolve(true),
  getReadable: vi.fn(() => mockReadable),
};

const mockMissingRun = {
  exists: Promise.resolve(false),
  getReadable: vi.fn(),
};

vi.mock("workflow/api", () => ({
  getRun: vi.fn((runId: string) =>
    runId === "missing-run" ? mockMissingRun : mockRun,
  ),
}));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  mockRun.getReadable.mockClear();
});

function req(
  runId: string,
  headers: Record<string, string> = {},
): [Request, { params: Promise<{ runId: string }> }] {
  return [
    new Request(`http://localhost/api/ingest/${runId}/progress`, {
      method: "GET",
      headers,
    }),
    { params: Promise.resolve({ runId }) },
  ];
}

describe("GET /api/ingest/[runId]/progress", () => {
  it("returns 401 when the authorization header is missing", async () => {
    const res = await GET(...req("run-1"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the bearer token is garbage", async () => {
    const res = await GET(...req("run-1", { authorization: "Bearer garbage" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the authorization header lacks the Bearer prefix", async () => {
    const res = await GET(...req("run-1", { authorization: SECRET }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the token is the right length but wrong value", async () => {
    const wrongSameLength = "x".repeat(SECRET.length);
    const res = await GET(
      ...req("run-1", { authorization: `Bearer ${wrongSameLength}` }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when the run does not exist", async () => {
    const res = await GET(
      ...req("missing-run", { authorization: `Bearer ${SECRET}` }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with text/event-stream when the bearer token matches", async () => {
    const res = await GET(...req("run-1", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(mockRun.getReadable).toHaveBeenCalledWith({
      namespace: "progress",
    });
  });
});
