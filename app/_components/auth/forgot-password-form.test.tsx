import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/a11y";

const requestPasswordResetMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/forgot-password",
}));

vi.mock("@/app/_actions/auth", () => ({
  requestPasswordReset: (...args: unknown[]) => requestPasswordResetMock(...args),
}));

import { ForgotPasswordForm } from "./forgot-password-form";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ForgotPasswordForm", () => {
  it("renders the email field and submit button", () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send reset link/i })).toBeInTheDocument();
  });

  it("has no a11y violations", async () => {
    const { container } = render(<ForgotPasswordForm />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("calls requestPasswordReset with FormData on submit and redirects on success", async () => {
    const user = userEvent.setup();
    requestPasswordResetMock.mockResolvedValue({ ok: true });
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => expect(requestPasswordResetMock).toHaveBeenCalledTimes(1));
    const fd = requestPasswordResetMock.mock.calls[0]?.[0];
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get("email")).toBe("alice@example.com");
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/forgot-password/sent?email=alice%40example.com",
      ),
    );
  });

  it("shows an error when the action returns an error", async () => {
    const user = userEvent.setup();
    requestPasswordResetMock.mockResolvedValue({ error: "Too many requests" });
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests");
    expect(pushMock).not.toHaveBeenCalled();
  });
});
