import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { parseSyntax } from "@/lib/search/syntax-parser";
import { FilterBuilder, activeFilterCount } from "./filter-builder";

/**
 * Models the real round-trip: the parent re-parses each emitted `raw` back
 * into `parsed`, so the name input's render-time resync sees its own edits.
 */
function Harness({
  initial,
  spy,
}: {
  initial: string;
  spy: (raw: string) => void;
}) {
  const [raw, setRaw] = useState(initial);
  return (
    <FilterBuilder
      parsed={parseSyntax(raw)}
      showName
      onChange={(r) => {
        setRaw(r);
        spy(r);
      }}
    />
  );
}

function setup(raw: string) {
  const onChange = vi.fn();
  render(<Harness initial={raw} spy={onChange} />);
  return onChange;
}

describe("FilterBuilder chip → syntax mapping", () => {
  it("maps a color pip to c:<color>", async () => {
    const onChange = setup("");
    await userEvent.click(screen.getByLabelText("Color U"));
    expect(onChange).toHaveBeenCalledWith("c:U");
  });

  it("maps a card-type chip to t:<type> (lowercased)", async () => {
    const onChange = setup("");
    await userEvent.click(screen.getByRole("button", { name: "Creature" }));
    expect(onChange).toHaveBeenCalledWith("t:creature");
  });

  it("maps a keyword chip to o:<word> (lowercased)", async () => {
    const onChange = setup("");
    await userEvent.click(screen.getByRole("button", { name: "Flying" }));
    expect(onChange).toHaveBeenCalledWith("o:flying");
  });

  it("toggles an active color pip off, clearing the clause", async () => {
    const onChange = setup("c:U");
    await userEvent.click(screen.getByLabelText("Color U"));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("emits cmc>= when the min slider moves off zero", () => {
    const onChange = setup("");
    fireEvent.change(screen.getByLabelText("Mana value min"), {
      target: { value: "3" },
    });
    expect(onChange).toHaveBeenCalledWith("cmc>=3");
  });

  it("emits cmc<= when the max slider drops below the cap", () => {
    const onChange = setup("");
    fireEvent.change(screen.getByLabelText("Mana value max"), {
      target: { value: "5" },
    });
    expect(onChange).toHaveBeenCalledWith("cmc<=5");
  });

  it("preserves an existing name fragment when toggling a color", async () => {
    const onChange = setup("bolt");
    await userEvent.click(screen.getByLabelText("Color R"));
    expect(onChange).toHaveBeenCalledWith("bolt c:R");
  });
});

describe("FilterBuilder card-name input → syntax mapping", () => {
  it("maps a single-word name to a bare fragment", async () => {
    const onChange = setup("");
    await userEvent.type(screen.getByLabelText("Card name"), "bolt");
    expect(onChange).toHaveBeenLastCalledWith("bolt");
  });

  it("quotes a multi-word name into one fragment", async () => {
    const onChange = setup("");
    await userEvent.type(screen.getByLabelText("Card name"), "lightning bolt");
    expect(onChange).toHaveBeenLastCalledWith('"lightning bolt"');
  });

  it("keeps the name first alongside other facets", async () => {
    const onChange = setup("c:R");
    await userEvent.type(screen.getByLabelText("Card name"), "bolt");
    expect(onChange).toHaveBeenLastCalledWith("bolt c:R");
  });

  it("drops the fragment when the box is cleared", async () => {
    const onChange = setup("bolt");
    await userEvent.clear(screen.getByLabelText("Card name"));
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});

describe("activeFilterCount", () => {
  it("counts each active facet", () => {
    expect(activeFilterCount(parseSyntax(""))).toBe(0);
    expect(activeFilterCount(parseSyntax("c:U t:instant o:flying"))).toBe(3);
    expect(activeFilterCount(parseSyntax("cmc>=2 cmc<=5"))).toBe(2);
    expect(activeFilterCount(parseSyntax("bolt"))).toBe(1);
  });
});
