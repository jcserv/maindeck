import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const deleteAccountMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/account",
}));

vi.mock("@/app/_actions/auth", () => ({
  deleteAccount: (...args: unknown[]) => deleteAccountMock(...args),
}));

vi.mock("@/lib/telemetry", () => ({
  isNextControlFlow: () => false,
}));

import { DeleteAccountButton } from "../delete-account-button";

beforeEach(() => {
  vi.clearAllMocks();
});

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /delete account/i }));
  // Wait for dialog to be visible
  await screen.findByRole("dialog");
}

describe("DeleteAccountButton", () => {
  it("renders the trigger button", () => {
    render(<DeleteAccountButton username="alice" />);
    expect(screen.getByRole("button", { name: /delete account/i })).toBeInTheDocument();
  });

  it("opens a dialog when trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountButton username="alice" />);
    await openDialog(user);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("confirm button is disabled until username matches exactly", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountButton username="alice" />);
    await openDialog(user);

    const confirmBtn = screen.getByRole("button", { name: /^delete account$/i });
    expect(confirmBtn).toBeDisabled();

    await user.type(screen.getByLabelText(/type.*alice/i), "ali");
    expect(confirmBtn).toBeDisabled();

    await user.type(screen.getByLabelText(/type.*alice/i), "ce");
    await waitFor(() => expect(confirmBtn).toBeEnabled());
  });

  it("calls deleteAccount with no arguments when confirmed", async () => {
    const user = userEvent.setup();
    // deleteAccount redirects so it never resolves in tests; use a no-op resolve
    deleteAccountMock.mockResolvedValue(undefined);
    render(<DeleteAccountButton username="alice" />);
    await openDialog(user);

    await user.type(screen.getByLabelText(/type.*alice/i), "alice");
    await user.click(screen.getByRole("button", { name: /^delete account$/i }));

    await waitFor(() => expect(deleteAccountMock).toHaveBeenCalledTimes(1));
    expect(deleteAccountMock.mock.calls[0]).toEqual([]);
  });

  it("shows an error when deleteAccount throws non-redirect", async () => {
    const user = userEvent.setup();
    deleteAccountMock.mockRejectedValue(new Error("Server error"));
    render(<DeleteAccountButton username="alice" />);
    await openDialog(user);

    await user.type(screen.getByLabelText(/type.*alice/i), "alice");
    await user.click(screen.getByRole("button", { name: /^delete account$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
  });
});
