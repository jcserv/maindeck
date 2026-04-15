import { beforeEach, describe, expect, it, vi } from "vitest";
import { scryfallIngestWorkflow } from "@/workflows/scryfall/ingest";
import { POST } from "../route";

vi.mock("workflow/api", () => ({
  start: vi.fn().mockResolvedValue({ runId: "abc" }),
}));

vi.mock("@/workflows/scryfall/ingest", () => ({
  scryfallIngestWorkflow: { __marker: "scryfall-workflow" },
}));

const TOKEN = "test-token";

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/ingest", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  vi.stubEnv("INGEST_TOKEN", TOKEN);
});

describe("POST /api/ingest", () => {
  it("returns 401 when the token header is missing", async () => {
    const { start } = await import("workflow/api");
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(start).not.toHaveBeenCalled();
  });

  it("returns 401 when the token header is wrong", async () => {
    const { start } = await import("workflow/api");
    const res = await POST(req({ "x-maindeck-ingest-token": "nope" }));
    expect(res.status).toBe(401);
    expect(start).not.toHaveBeenCalled();
  });

  it("returns 401 when the token is the right length but wrong value", async () => {
    const { start } = await import("workflow/api");
    const wrongSameLength = "x".repeat(TOKEN.length);
    const res = await POST(
      req({ "x-maindeck-ingest-token": wrongSameLength }),
    );
    expect(res.status).toBe(401);
    expect(start).not.toHaveBeenCalled();
  });

  it("starts the workflow and returns runId when the token matches", async () => {
    const { start } = await import("workflow/api");
    const res = await POST(req({ "x-maindeck-ingest-token": TOKEN }));
    const body = await res.json();
    expect(body).toEqual({ runId: "abc" });
    expect(start).toHaveBeenCalledWith(scryfallIngestWorkflow);
  });
});
