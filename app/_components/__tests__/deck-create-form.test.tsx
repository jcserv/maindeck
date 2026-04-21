import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/a11y";

// Mocks — the form hits server actions and a next/navigation router.
const createDeckMock = vi.fn();
const createDeckWithImportMock = vi.fn();
const pushMock = vi.fn();
const backMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: backMock, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/deck/new",
}));
vi.mock("@/lib/deck/actions", () => ({
  createDeck: (...args: unknown[]) => createDeckMock(...args),
}));
vi.mock("@/lib/deck/import-action", () => ({
  createDeckWithImport: (...args: unknown[]) => createDeckWithImportMock(...args),
}));

import { DeckCreateForm } from "../deck-create-form";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DeckCreateForm", () => {
  it("has no a11y violations", async () => {
    const { container } = render(<DeckCreateForm />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("disables the create button until a name is entered (UI-level guard)", async () => {
    const user = userEvent.setup();
    render(<DeckCreateForm />);

    const createBtn = screen.getByRole("button", { name: /create deck/i });
    expect(createBtn).toBeDisabled();

    const nameInput = screen.getByLabelText(/deck name/i);
    await user.type(nameInput, "My Deck");

    expect(createBtn).toBeEnabled();
  });

  it("blank source: submitting calls createDeck with FormData and navigates to the new deck", async () => {
    const user = userEvent.setup();
    createDeckMock.mockResolvedValue("deck-123");
    render(<DeckCreateForm />);

    await user.type(screen.getByLabelText(/deck name/i), "My Deck");
    await user.click(screen.getByRole("button", { name: /create deck/i }));

    await waitFor(() => expect(createDeckMock).toHaveBeenCalledTimes(1));
    const fd = createDeckMock.mock.calls[0]?.[0];
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).get("name")).toBe("My Deck");
    expect(createDeckWithImportMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/deck/deck-123");
  });

  it("paste source: switches to paste tab and shows a parse preview of the typed decklist", async () => {
    const user = userEvent.setup();
    render(<DeckCreateForm />);

    await user.click(screen.getByRole("tab", { name: /paste list/i }));
    const textarea = screen.getByLabelText(/paste decklist/i);
    await user.type(textarea, "4 Lightning Bolt");

    // The CTA label updates to include the imported card count.
    expect(
      await screen.findByRole("button", { name: /create & import 4 cards/i }),
    ).toBeInTheDocument();
  });

  it("paste source: submitting with import text calls createDeckWithImport", async () => {
    const user = userEvent.setup();
    createDeckWithImportMock.mockResolvedValue("deck-xyz");
    render(<DeckCreateForm />);

    await user.type(screen.getByLabelText(/deck name/i), "Burn");
    await user.click(screen.getByRole("tab", { name: /paste list/i }));
    await user.type(
      screen.getByLabelText(/paste decklist/i),
      "4 Lightning Bolt",
    );

    await user.click(
      screen.getByRole("button", { name: /create & import/i }),
    );

    await waitFor(() =>
      expect(createDeckWithImportMock).toHaveBeenCalledTimes(1),
    );
    const [call] = createDeckWithImportMock.mock.calls[0]!;
    expect(call).toMatchObject({
      name: "Burn",
      importText: "4 Lightning Bolt",
    });
    expect(createDeckMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/deck/deck-xyz");
  });

  it("surfaces a server-action error message inline", async () => {
    const user = userEvent.setup();
    createDeckMock.mockRejectedValue(new Error("boom"));
    render(<DeckCreateForm />);

    await user.type(screen.getByLabelText(/deck name/i), "Deck");
    await user.click(screen.getByRole("button", { name: /create deck/i }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
