import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/a11y";

const signUpMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/sign-up",
}));

vi.mock("@/lib/auth/actions", () => ({
  signUp: (...args: unknown[]) => signUpMock(...args),
}));

import { SignUpForm } from "../sign-up-form";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SignUpForm", () => {
  it("renders username, email, date of birth, and password fields", () => {
    render(<SignUpForm />);
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date of birth/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("does not render a Name field", () => {
    render(<SignUpForm />);
    expect(screen.queryByLabelText(/^name/i)).toBeNull();
  });

  it("has no a11y violations", async () => {
    const { container } = render(<SignUpForm />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("calls signUp action and redirects on success", async () => {
    const user = userEvent.setup();
    signUpMock.mockResolvedValue({ ok: true });
    render(<SignUpForm />);

    await user.type(screen.getByLabelText(/username/i), "alice");
    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    // date input must be set via type since userEvent doesn't support date pickers natively
    const dobInput = screen.getByLabelText(/date of birth/i);
    await user.type(dobInput, "2000-01-15");
    await user.type(screen.getByLabelText(/password/i), "password1");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(signUpMock).toHaveBeenCalledTimes(1));
    const fd = signUpMock.mock.calls[0]?.[0];
    expect(fd).toBeInstanceOf(FormData);
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/verify-email/sent?email=alice%40example.com",
      ),
    );
  });

  it("shows error on failure", async () => {
    const user = userEvent.setup();
    signUpMock.mockResolvedValue({ error: "Username already taken" });
    render(<SignUpForm />);

    await user.type(screen.getByLabelText(/username/i), "alice");
    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    const dobInput = screen.getByLabelText(/date of birth/i);
    await user.type(dobInput, "2000-01-15");
    await user.type(screen.getByLabelText(/password/i), "password1");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Username already taken");
  });
});
