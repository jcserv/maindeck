import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
