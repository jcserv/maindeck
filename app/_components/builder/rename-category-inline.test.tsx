import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/_actions/deck/categories", () => ({
  renameCategory: vi.fn().mockResolvedValue(undefined),
}));

import { renameCategory } from "@/app/_actions/deck/categories";
import { RenameCategoryInline } from "./rename-category-inline";

const mockRenameCategory = vi.mocked(renameCategory);

function setup() {
  const onRename = vi.fn();
  const onDone = vi.fn();
  const onCancel = vi.fn();
  render(
    <RenameCategoryInline
      deckId="deck-1"
      dbName="ramp"
      initialName="Ramp"
      onRename={onRename}
      onDone={onDone}
      onCancel={onCancel}
    />,
  );
  return { onRename, onDone, onCancel };
}

describe("RenameCategoryInline", () => {
  it("renders a confirm button", () => {
    setup();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
  });

  it("submits the rename when the confirm button is clicked", async () => {
    const user = userEvent.setup();
    const { onRename, onDone } = setup();

    const input = screen.getByRole("textbox", { name: /rename ramp/i });
    await user.clear(input);
    await user.type(input, "Acceleration");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(onRename).toHaveBeenCalledWith("ramp", "Acceleration");
    expect(mockRenameCategory).toHaveBeenCalledWith("deck-1", "ramp", "Acceleration");
    expect(onDone).toHaveBeenCalled();
  });
});
