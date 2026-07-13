import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoleBar } from "./role-bar";

type RoleBarCards = Parameters<typeof RoleBar>[0]["cards"];

function card(
  name: string,
  categories: string[],
  quantity = 1,
): RoleBarCards[number] {
  return {
    card: {
      name,
      mainType: "Creature",
      colors: [],
      cmc: 1,
    },
    printing: null,
    categories,
    quantity,
  };
}

describe("RoleBar — category grouping", () => {
  it("counts a multi-category card once, under its primary category", () => {
    render(
      <RoleBar
        cards={[card("Llanowar Elves", ["ramp", "removal"])]}
        group="category"
        categoryOrder={["ramp", "removal"]}
      />,
    );

    // Primary tallies the copy...
    expect(screen.getByText("Ramp")).toBeInTheDocument();
    expect(screen.getByTitle("Ramp: 1")).toBeInTheDocument();
    // ...the secondary section holds only the ghost, nets to zero, and is
    // dropped from the bar and legend entirely.
    expect(screen.queryByText("Removal")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("sums quantities for primary members alongside single-category cards", () => {
    render(
      <RoleBar
        cards={[
          card("Llanowar Elves", ["ramp", "removal"], 2),
          card("Doom Blade", ["removal"]),
        ]}
        group="category"
        categoryOrder={["ramp", "removal"]}
      />,
    );

    expect(screen.getByTitle("Ramp: 2")).toBeInTheDocument();
    // Doom Blade's primary is removal; the Elves ghost adds nothing.
    expect(screen.getByTitle("Removal: 1")).toBeInTheDocument();
  });

  it("shows the empty state when there are no cards", () => {
    render(<RoleBar cards={[]} group="category" categoryOrder={[]} />);
    expect(
      screen.getByText("Add cards to see distribution."),
    ).toBeInTheDocument();
  });
});
