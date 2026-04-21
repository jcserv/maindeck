import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/search",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/_actions/search-ai-stub", () => ({
  translateAndSearch: vi.fn().mockResolvedValue({ syntax: "t:creature", results: [] }),
}));

import { SearchForm } from "../search-form";

function renderForm(overrides: Partial<Parameters<typeof SearchForm>[0]> = {}) {
  const defaults = {
    initialQuery: "",
    initialMode: "simple" as const,
    initialColors: [],
    initialTypes: [],
    initialResults: [],
    initialCount: 0,
  };
  return render(<SearchForm {...defaults} {...overrides} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SearchForm", () => {
  it("mode tabs are rendered with the initial mode selected", () => {
    renderForm({ initialMode: "syntax" });

    expect(screen.getByRole("button", { name: /scryfall syntax/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /^simple$/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("switching mode syncs the mode parameter in the URL", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: /scryfall syntax/i }));

    expect(replaceMock).toHaveBeenCalled();
    const lastCall = replaceMock.mock.calls.at(-1)![0];
    expect(lastCall).toContain("mode=syntax");
  });

  it("toggling a color chip adds it to the URL `colors` param", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: /filter by u/i }));

    const href = replaceMock.mock.calls.at(-1)![0];
    expect(href).toContain("colors=U");
  });

  it("renders a color chip as pressed when it's in the initial props", () => {
    renderForm({ initialColors: ["U"] });

    expect(screen.getByRole("button", { name: /filter by u/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("toggling a type chip adds it to the URL `types` param", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: /^creature$/i }));

    const href = replaceMock.mock.calls.at(-1)![0];
    expect(href).toContain("types=Creature");
  });

  it("toggling a color chip off removes it from the URL", async () => {
    const user = userEvent.setup();
    renderForm({ initialColors: ["U"] });

    await user.click(screen.getByRole("button", { name: /filter by u/i }));

    const href = replaceMock.mock.calls.at(-1)![0];
    expect(href).not.toContain("colors=");
  });

  it("submitting the form syncs the current query to the URL", async () => {
    const user = userEvent.setup();
    renderForm();

    const input = screen.getByRole("textbox", { name: /search/i });
    await user.type(input, "bolt{Enter}");

    const href = replaceMock.mock.calls.at(-1)![0];
    expect(href).toContain("q=bolt");
  });
});
