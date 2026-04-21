import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/a11y";

const changePasswordMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/account",
}));

vi.mock("@/lib/auth/actions", () => ({
  changePassword: (...args: unknown[]) => changePasswordMock(...args),
}));

import { ChangePasswordForm } from "../change-password-form";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChangePasswordForm", () => {
  it("renders all three password fields", () => {
    render(<ChangePasswordForm />);
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
  });

  it("has no a11y violations", async () => {
    const { container } = render(<ChangePasswordForm />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows a match error when new and confirm passwords differ", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await user.type(screen.getByLabelText(/current password/i), "oldpass1");
    await user.type(screen.getByLabelText(/^new password/i), "newpass1");
    await user.type(screen.getByLabelText(/confirm new password/i), "different1");
    await user.click(screen.getByRole("button", { name: /change password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/i);
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("calls changePassword when passwords match and shows success", async () => {
    const user = userEvent.setup();
    changePasswordMock.mockResolvedValue({ ok: true });
    render(<ChangePasswordForm />);

    await user.type(screen.getByLabelText(/current password/i), "oldpass1");
    await user.type(screen.getByLabelText(/^new password/i), "newpass1");
    await user.type(screen.getByLabelText(/confirm new password/i), "newpass1");
    await user.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => expect(changePasswordMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent(/changed/i);
  });

  it("shows server error inline", async () => {
    const user = userEvent.setup();
    changePasswordMock.mockResolvedValue({ error: "Incorrect current password" });
    render(<ChangePasswordForm />);

    await user.type(screen.getByLabelText(/current password/i), "wrong");
    await user.type(screen.getByLabelText(/^new password/i), "newpass1");
    await user.type(screen.getByLabelText(/confirm new password/i), "newpass1");
    await user.click(screen.getByRole("button", { name: /change password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect current password");
  });
});
