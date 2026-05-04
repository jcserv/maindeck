import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/a11y";

const changeEmailMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/account",
}));

vi.mock("@/app/_actions/auth", () => ({
  changeEmail: (...args: unknown[]) => changeEmailMock(...args),
}));

import { ChangeEmailForm } from "./change-email-form";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChangeEmailForm", () => {
  it("renders the email as read-only with an edit button", () => {
    render(<ChangeEmailForm defaultEmail="alice@example.com" />);
    const input = screen.getByLabelText(/email address/i, { selector: "input" }) as HTMLInputElement;
    expect(input.value).toBe("alice@example.com");
    expect(input.readOnly).toBe(true);
  });

  it("has no a11y violations", async () => {
    const { container } = render(
      <ChangeEmailForm defaultEmail="alice@example.com" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("calls changeEmail and shows success with the submitted email", async () => {
    const user = userEvent.setup();
    changeEmailMock.mockResolvedValue({ ok: true });
    render(<ChangeEmailForm defaultEmail="alice@example.com" />);

    await user.click(screen.getByRole("button", { name: /edit email address/i }));
    const input = screen.getByLabelText(/email address/i, { selector: "input" }) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "new@example.com");
    await user.click(screen.getByRole("button", { name: /save email address/i }));

    await waitFor(() => expect(changeEmailMock).toHaveBeenCalledTimes(1));
    const fd = changeEmailMock.mock.calls[0]?.[0] as FormData;
    expect(fd.get("newEmail")).toBe("new@example.com");
    const success = await screen.findByRole("status");
    expect(success).toHaveTextContent("new@example.com");
  });

  it("reverts the displayed email after success (pending verification)", async () => {
    const user = userEvent.setup();
    changeEmailMock.mockResolvedValue({ ok: true });
    render(<ChangeEmailForm defaultEmail="alice@example.com" />);

    await user.click(screen.getByRole("button", { name: /edit email address/i }));
    const input = screen.getByLabelText(/email address/i, { selector: "input" }) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "new@example.com");
    await user.click(screen.getByRole("button", { name: /save email address/i }));

    await screen.findByRole("status");
    expect(input.value).toBe("alice@example.com");
    expect(input.readOnly).toBe(true);
  });

  it("shows error on failure", async () => {
    const user = userEvent.setup();
    changeEmailMock.mockResolvedValue({ error: "Email already in use" });
    render(<ChangeEmailForm defaultEmail="alice@example.com" />);

    await user.click(screen.getByRole("button", { name: /edit email address/i }));
    const input = screen.getByLabelText(/email address/i, { selector: "input" });
    await user.clear(input);
    await user.type(input, "new@example.com");
    await user.click(screen.getByRole("button", { name: /save email address/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email already in use");
  });
});
