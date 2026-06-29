import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/a11y";

// The dialog calls a server action + telemetry helper. Mock both so the
// component renders in jsdom without server-only imports.
const bulkReselectMock = vi.fn();
vi.mock("@/app/_actions/deck/bulk-printings", () => ({
  bulkReselectPrintings: (...args: unknown[]) => bulkReselectMock(...args),
}));
vi.mock("@/lib/telemetry", () => ({
  getActionErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

import { BulkPrintingsDialog } from "./bulk-printings-dialog";

function renderDialog() {
  return render(
    <BulkPrintingsDialog
      deckId="deck-1"
      trigger={<button type="button">Printings</button>}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BulkPrintingsDialog", () => {
  it("offers all three heuristics with descriptions once opened", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Printings" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Bulk edit printings")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Cards with no\s+matching alternative are left as-is/i),
    ).toBeInTheDocument();

    expect(within(dialog).getByText("Cheapest printings")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Pin the lowest-priced printing of each card."),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Most expensive printings")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Pin the highest-priced printing of each card."),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("No Universes Beyond")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Swap Universes Beyond printings for in-universe ones."),
    ).toBeInTheDocument();
  });

  it("has no a11y violations while open", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Printings" }));
    const dialog = await screen.findByRole("dialog");
    // Scope to the dialog content; base-ui injects framework focus-guard
    // sentinels as portal siblings that aren't part of this component.
    expect(await axe(dialog)).toHaveNoViolations();
  });

  it("applies cheapest and reports how many cards changed, noting skips", async () => {
    bulkReselectMock.mockResolvedValue({ changed: 7, total: 12 });
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Printings" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByText("Cheapest printings"));

    expect(bulkReselectMock).toHaveBeenCalledWith("deck-1", "cheapest");
    await waitFor(() =>
      expect(within(dialog).getByText("Updated 7 of 12 cards")).toBeInTheDocument(),
    );
    expect(
      within(dialog).getByText(
        /The rest were already optimal, unpinned, or had no matching alternative — left unchanged\./i,
      ),
    ).toBeInTheDocument();
  });

  it("explains a no-op run accurately (already optimal / unpinned / no alternative)", async () => {
    bulkReselectMock.mockResolvedValue({ changed: 0, total: 5 });
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Printings" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByText("No Universes Beyond"));

    expect(bulkReselectMock).toHaveBeenCalledWith("deck-1", "no-universes-beyond");
    await waitFor(() =>
      expect(within(dialog).getByText("No printings changed")).toBeInTheDocument(),
    );
    expect(
      within(dialog).getByText(
        /Every card was already optimal, unpinned, or had no matching alternative — nothing changed\./i,
      ),
    ).toBeInTheDocument();
  });

  it("surfaces an error when the action fails", async () => {
    bulkReselectMock.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Printings" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByText("Most expensive printings"));

    await waitFor(() =>
      expect(within(dialog).getByText("Update failed")).toBeInTheDocument(),
    );
    expect(
      within(dialog).getByText("Couldn't update printings. Please try again."),
    ).toBeInTheDocument();
  });
});
