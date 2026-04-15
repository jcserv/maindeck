import { describe, expect, it, vi } from "vitest";
import { scryfallIngestWorkflow } from "@/workflows/scryfall/ingest";
import { POST } from "../route";

vi.mock("workflow/api", () => ({
  start: vi.fn().mockResolvedValue({ runId: "abc" }),
}));

vi.mock("@/workflows/scryfall/ingest", () => ({
  scryfallIngestWorkflow: { __marker: "scryfall-workflow" },
}));

describe("POST /api/ingest", () => {
  it("starts the workflow and returns its runId", async () => {
    const { start } = await import("workflow/api");
    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({ runId: "abc" });
    expect(start).toHaveBeenCalledWith(scryfallIngestWorkflow);
  });
});
