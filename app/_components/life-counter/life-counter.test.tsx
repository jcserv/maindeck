import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LifeCounter } from "./life-counter";

function stubFullscreenApi() {
  let element: Element | null = null;
  const requestFullscreen = vi.fn(async () => {
    element = document.documentElement;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  const exitFullscreen = vi.fn(async () => {
    element = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => element });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exitFullscreen });
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    configurable: true,
    value: requestFullscreen,
  });
  return {
    requestFullscreen,
    exitFullscreen,
    nativeExit() {
      element = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    },
  };
}

function board() {
  return screen.getByRole("heading", { name: "Life counter" }).closest("[data-fullscreen]");
}

afterEach(() => {
  delete (document as { fullscreenElement?: unknown }).fullscreenElement;
  delete (document as { exitFullscreen?: unknown }).exitFullscreen;
  delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen;
});

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

  describe("fullscreen", () => {
    it("enters and exits browser fullscreen from the toolbar", async () => {
      const api = stubFullscreenApi();
      const user = userEvent.setup();
      render(<LifeCounter />);

      await user.click(screen.getByRole("button", { name: "Fullscreen" }));
      expect(api.requestFullscreen).toHaveBeenCalledOnce();
      expect(board()).toHaveAttribute("data-fullscreen", "true");

      await user.click(screen.getByRole("button", { name: "Exit fullscreen" }));
      expect(api.exitFullscreen).toHaveBeenCalledOnce();
      expect(board()).toHaveAttribute("data-fullscreen", "false");
    });

    it("returns to the normal layout when the browser leaves fullscreen", async () => {
      const api = stubFullscreenApi();
      const user = userEvent.setup();
      render(<LifeCounter />);

      await user.click(screen.getByRole("button", { name: "Fullscreen" }));
      act(() => api.nativeExit());

      expect(board()).toHaveAttribute("data-fullscreen", "false");
      expect(screen.getByRole("button", { name: "Fullscreen" })).toBeInTheDocument();
    });

    it("goes fullscreen in-page when the Fullscreen API is unavailable", async () => {
      const user = userEvent.setup();
      render(<LifeCounter />);

      await user.click(screen.getByRole("button", { name: "Fullscreen" }));
      expect(board()).toHaveAttribute("data-fullscreen", "true");

      fireEvent.keyDown(document, { key: "Escape" });
      expect(board()).toHaveAttribute("data-fullscreen", "false");
    });

    it("keeps life totals across entering and exiting fullscreen", async () => {
      stubFullscreenApi();
      const user = userEvent.setup();
      render(<LifeCounter />);

      const life = () => screen.getByLabelText("Player 1 life", { exact: true });
      await user.click(screen.getByRole("button", { name: "Decrease Player 1 life" }));
      const before = life().textContent!;

      await user.click(screen.getByRole("button", { name: "Fullscreen" }));
      await user.click(screen.getByRole("button", { name: "Exit fullscreen" }));

      expect(life()).toHaveTextContent(before);
    });
  });
});
