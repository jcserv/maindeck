import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LifeCounter } from "./life-counter";

describe("LifeCounter", () => {
  it("lowers life when commander damage is marked", async () => {
    const user = userEvent.setup();
    render(<LifeCounter />);

    const panel = screen.getByRole("region", { name: "Player 1" });
    await user.click(within(panel).getByRole("tab", { name: "Commander dmg" }));
    await user.click(within(panel).getByRole("button", { name: "Increase Player 2" }));
    await user.click(within(panel).getByRole("button", { name: "Increase Player 2" }));
    await user.click(within(panel).getByRole("tab", { name: "Life" }));

    expect(within(panel).getByLabelText("Player 1 life")).toHaveTextContent("38");
  });

  it("spells out Commander in every label", async () => {
    const user = userEvent.setup();
    const { container } = render(<LifeCounter />);

    const panel = screen.getByRole("region", { name: "Player 1" });
    await user.click(within(panel).getByRole("tab", { name: "Counters" }));

    expect(within(panel).getByText("Commander tax")).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/Cmdr/);
  });
});
