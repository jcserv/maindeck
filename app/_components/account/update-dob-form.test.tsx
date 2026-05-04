import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/a11y";

const updateDateOfBirthMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/account",
}));

vi.mock("@/app/_actions/auth", () => ({
  updateDateOfBirth: (...args: unknown[]) => updateDateOfBirthMock(...args),
}));

import { UpdateDobForm } from "./update-dob-form";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UpdateDobForm", () => {
  it("renders a read-only date input with a max attribute", () => {
    render(<UpdateDobForm defaultDate={null} />);
    const input = screen.getByLabelText(/date of birth/i, { selector: "input" }) as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(input.max).toBeTruthy();
    expect(input.readOnly).toBe(true);
  });

  it("has no a11y violations", async () => {
    const { container } = render(<UpdateDobForm defaultDate="2000-01-15" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("pre-fills from defaultDate prop", () => {
    render(<UpdateDobForm defaultDate="2000-01-15" />);
    const input = screen.getByLabelText(/date of birth/i, { selector: "input" }) as HTMLInputElement;
    expect(input.value).toBe("2000-01-15");
  });

  it("calls updateDateOfBirth with FormData and shows success", async () => {
    const user = userEvent.setup();
    updateDateOfBirthMock.mockResolvedValue({ ok: true });
    render(<UpdateDobForm defaultDate="2000-06-15" />);

    await user.click(screen.getByRole("button", { name: /edit date of birth/i }));
    const input = screen.getByLabelText(/date of birth/i, { selector: "input" }) as HTMLInputElement;
    fireChange(input, "2001-07-20");
    await user.click(screen.getByRole("button", { name: /save date of birth/i }));

    await waitFor(() => expect(updateDateOfBirthMock).toHaveBeenCalledTimes(1));
    const fd = updateDateOfBirthMock.mock.calls[0]?.[0] as FormData;
    expect(fd.get("dateOfBirth")).toBe("2001-07-20");
    expect(await screen.findByRole("status")).toHaveTextContent(/updated/i);
  });

  it("shows error on failure", async () => {
    const user = userEvent.setup();
    updateDateOfBirthMock.mockResolvedValue({ error: "Invalid date" });
    render(<UpdateDobForm defaultDate="2000-06-15" />);

    await user.click(screen.getByRole("button", { name: /edit date of birth/i }));
    const input = screen.getByLabelText(/date of birth/i, { selector: "input" }) as HTMLInputElement;
    fireChange(input, "2001-07-20");
    await user.click(screen.getByRole("button", { name: /save date of birth/i }));

    await waitFor(() => expect(updateDateOfBirthMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid date");
  });
});

// Native date inputs don't play nicely with user.type; directly dispatch a
// change event to simulate picking a date.
function fireChange(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
