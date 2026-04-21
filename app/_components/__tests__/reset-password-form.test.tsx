import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/a11y";

const resetPasswordMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/reset-password",
}));

vi.mock("@/lib/auth/actions", () => ({
  resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
}));

import { ResetPasswordForm } from "../reset-password-form";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResetPasswordForm", () => {
  it("renders the password fields", () => {
    render(<ResetPasswordForm token="tok123" />);
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
  });

  it("has no a11y violations", async () => {
    const { container } = render(<ResetPasswordForm token="tok123" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("includes the token as a hidden input", () => {
    const { container } = render(<ResetPasswordForm token="tok123" />);
    const hidden = container.querySelector('input[name="token"]') as HTMLInputElement;
    expect(hidden).not.toBeNull();
    expect(hidden.value).toBe("tok123");
  });

  it("shows a match error when passwords differ", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="tok123" />);

    await user.type(screen.getByLabelText(/^new password/i), "password1");
    await user.type(screen.getByLabelText(/confirm new password/i), "password2");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/passwords do not match/i);
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it("calls resetPassword and redirects on success when passwords match", async () => {
    const user = userEvent.setup();
    resetPasswordMock.mockResolvedValue({ ok: true });
    render(<ResetPasswordForm token="tok123" />);

    await user.type(screen.getByLabelText(/^new password/i), "newpass123");
    await user.type(screen.getByLabelText(/confirm new password/i), "newpass123");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => expect(resetPasswordMock).toHaveBeenCalledTimes(1));
    const fd = resetPasswordMock.mock.calls[0]?.[0];
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get("token")).toBe("tok123");
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/sign-in?reset=1"));
  });

  it("shows server error inline", async () => {
    const user = userEvent.setup();
    resetPasswordMock.mockResolvedValue({ error: "Token expired" });
    render(<ResetPasswordForm token="tok123" />);

    await user.type(screen.getByLabelText(/^new password/i), "newpass123");
    await user.type(screen.getByLabelText(/confirm new password/i), "newpass123");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Token expired");
    expect(pushMock).not.toHaveBeenCalled();
  });
});
