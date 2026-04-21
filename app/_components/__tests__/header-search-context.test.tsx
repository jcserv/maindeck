import { useEffect, useRef } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/a11y";

import {
  HeaderSearchProvider,
  useHeaderSearch,
} from "../header-search-context";

function RegisteredInput({
  label,
  hidden = false,
  defaultValue,
}: {
  label: string;
  hidden?: boolean;
  defaultValue?: string;
}) {
  const { registerInput } = useHeaderSearch();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    return registerInput(ref.current) ?? undefined;
  }, [registerInput]);
  return (
    <div style={hidden ? { display: "none" } : undefined}>
      <input ref={ref} aria-label={label} defaultValue={defaultValue} />
    </div>
  );
}

function renderProvider(children: React.ReactNode) {
  return render(<HeaderSearchProvider>{children}</HeaderSearchProvider>);
}

describe("HeaderSearchProvider keybindings", () => {
  it("has no a11y violations", async () => {
    const { container } = renderProvider(
      <RegisteredInput label="search" defaultValue="hello" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("focuses the search input on Cmd+K (macOS)", async () => {
    const user = userEvent.setup();
    renderProvider(
      <RegisteredInput label="search" defaultValue="hello" />,
    );
    const input = screen.getByLabelText("search") as HTMLInputElement;
    expect(input).not.toHaveFocus();

    await user.keyboard("{Meta>}k{/Meta}");

    expect(input).toHaveFocus();
    // focus() also selects the current value
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("hello".length);
  });

  it("focuses the search input on Ctrl+K (Windows/Linux)", async () => {
    const user = userEvent.setup();
    renderProvider(<RegisteredInput label="search" />);
    const input = screen.getByLabelText("search");
    expect(input).not.toHaveFocus();

    await user.keyboard("{Control>}k{/Control}");

    expect(input).toHaveFocus();
  });

  it("focuses on '/' when not typing in a field", async () => {
    const user = userEvent.setup();
    renderProvider(
      <>
        <RegisteredInput label="search" />
        <textarea aria-label="notes" />
      </>,
    );
    const input = screen.getByLabelText("search");

    await user.keyboard("/");

    expect(input).toHaveFocus();
  });

  it("ignores '/' when the user is already typing in a textarea", async () => {
    const user = userEvent.setup();
    renderProvider(
      <>
        <RegisteredInput label="search" />
        <textarea aria-label="notes" />
      </>,
    );
    const textarea = screen.getByLabelText("notes");
    const input = screen.getByLabelText("search");

    textarea.focus();
    await user.keyboard("/");

    expect(textarea).toHaveFocus();
    expect(input).not.toHaveFocus();
  });

  it("picks the visible input when multiple HeaderSearchBars are mounted", async () => {
    const user = userEvent.setup();
    renderProvider(
      <>
        <RegisteredInput label="desktop-search" hidden />
        <RegisteredInput label="mobile-search" />
      </>,
    );
    const hiddenInput = screen.getByLabelText("desktop-search");
    const visibleInput = screen.getByLabelText("mobile-search");

    await user.keyboard("{Meta>}k{/Meta}");

    expect(visibleInput).toHaveFocus();
    expect(hiddenInput).not.toHaveFocus();
  });
});
