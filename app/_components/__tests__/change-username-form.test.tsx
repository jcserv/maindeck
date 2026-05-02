import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/a11y";

const changeUsernameMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/account",
}));

vi.mock("@/app/_actions/auth", () => ({
  changeUsername: (...args: unknown[]) => changeUsernameMock(...args),
}));

import { ChangeUsernameForm } from "../change-username-form";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChangeUsernameForm", () => {
  it("renders the username as read-only with an edit button", () => {
    render(<ChangeUsernameForm defaultUsername="alice" />);
    const input = screen.getByLabelText(/username/i, { selector: "input" }) as HTMLInputElement;
    expect(input.value).toBe("alice");
    expect(input.readOnly).toBe(true);
    expect(screen.getByRole("button", { name: /edit username/i })).toBeInTheDocument();
  });

  it("has no a11y violations", async () => {
    const { container } = render(<ChangeUsernameForm defaultUsername="alice" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("unlocks for editing when the pencil is clicked", async () => {
    const user = userEvent.setup();
    render(<ChangeUsernameForm defaultUsername="alice" />);

    await user.click(screen.getByRole("button", { name: /edit username/i }));

    const input = screen.getByLabelText(/username/i, { selector: "input" }) as HTMLInputElement;
    expect(input.readOnly).toBe(false);
    expect(
      screen.getByRole("button", { name: /cancel editing username/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save username/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the save button only after the value changes", async () => {
    const user = userEvent.setup();
    render(<ChangeUsernameForm defaultUsername="alice" />);

    await user.click(screen.getByRole("button", { name: /edit username/i }));
    const input = screen.getByLabelText(/username/i, { selector: "input" });
    await user.type(input, "2");

    expect(
      screen.getByRole("button", { name: /save username/i }),
    ).toBeInTheDocument();
  });

  it("calls changeUsername with FormData and shows success", async () => {
    const user = userEvent.setup();
    changeUsernameMock.mockResolvedValue({ ok: true });
    render(<ChangeUsernameForm defaultUsername="alice" />);

    await user.click(screen.getByRole("button", { name: /edit username/i }));
    const input = screen.getByLabelText(/username/i, { selector: "input" });
    await user.clear(input);
    await user.type(input, "bob");
    await user.click(screen.getByRole("button", { name: /save username/i }));

    await waitFor(() => expect(changeUsernameMock).toHaveBeenCalledTimes(1));
    const fd = changeUsernameMock.mock.calls[0]?.[0] as FormData;
    expect(fd.get("username")).toBe("bob");
    expect(await screen.findByRole("status")).toHaveTextContent(/updated/i);
  });

  it("shows error on failure and stays in edit mode", async () => {
    const user = userEvent.setup();
    changeUsernameMock.mockResolvedValue({ error: "Username taken" });
    render(<ChangeUsernameForm defaultUsername="alice" />);

    await user.click(screen.getByRole("button", { name: /edit username/i }));
    const input = screen.getByLabelText(/username/i, { selector: "input" });
    await user.clear(input);
    await user.type(input, "bob");
    await user.click(screen.getByRole("button", { name: /save username/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Username taken");
    expect((screen.getByLabelText(/username/i, { selector: "input" }) as HTMLInputElement).readOnly).toBe(
      false,
    );
  });

  it("cancel reverts the typed value and returns to read-only", async () => {
    const user = userEvent.setup();
    render(<ChangeUsernameForm defaultUsername="alice" />);

    await user.click(screen.getByRole("button", { name: /edit username/i }));
    const input = screen.getByLabelText(/username/i, { selector: "input" }) as HTMLInputElement;
    await user.type(input, "_new");
    await user.click(
      screen.getByRole("button", { name: /cancel editing username/i }),
    );

    expect(input.value).toBe("alice");
    expect(input.readOnly).toBe(true);
  });
});
