import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/a11y";

const setThemeMock = vi.fn();
let currentTheme = "system";
let resolvedTheme = "light";

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: currentTheme,
    setTheme: setThemeMock,
    resolvedTheme,
  }),
}));

import { ThemeToggle } from "../theme-toggle";

beforeEach(() => {
  setThemeMock.mockClear();
  currentTheme = "system";
  resolvedTheme = "light";
});

describe("ThemeToggle", () => {
  it("has no a11y violations", async () => {
    const { container } = render(<ThemeToggle />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("opens the menu and sets the theme on selection", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: /toggle theme/i }));
    await user.click(await screen.findByRole("menuitem", { name: /dark/i }));

    expect(setThemeMock).toHaveBeenCalledWith("dark");
  });

  it("renders Light / Dark / System options", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: /toggle theme/i }));

    expect(
      await screen.findByRole("menuitem", { name: /light/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: /dark/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: /system/i }),
    ).toBeInTheDocument();
  });

  it("sets the theme via keyboard shortcut while the menu is open", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: /toggle theme/i }));
    await screen.findByRole("menuitem", { name: /dark/i });
    // Dispatch directly on document — Base UI's menu typeahead consumes
    // userEvent.keyboard at the menu element level.
    fireEvent.keyDown(document.documentElement, { key: "d", code: "KeyD" });

    expect(setThemeMock).toHaveBeenCalledWith("dark");
  });

  it("does not fire shortcuts when the menu is closed (scope isolation)", () => {
    render(<ThemeToggle />);

    fireEvent.keyDown(document.documentElement, { key: "d", code: "KeyD" });

    expect(setThemeMock).not.toHaveBeenCalled();
  });

  it("does not fire shortcuts when typing in an input", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ThemeToggle />
        <input aria-label="search" />
      </>,
    );

    await user.click(screen.getByRole("button", { name: /toggle theme/i }));
    await screen.findByRole("menuitem", { name: /dark/i });

    const input = screen.getByLabelText("search");
    input.focus();
    fireEvent.keyDown(input, { key: "d", code: "KeyD" });

    expect(setThemeMock).not.toHaveBeenCalled();
  });
});
