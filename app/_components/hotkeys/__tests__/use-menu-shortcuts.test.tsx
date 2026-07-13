import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMenuShortcuts } from "../use-menu-shortcuts";

function Harness({ shortcuts }: { shortcuts: Parameters<typeof useMenuShortcuts>[0] }) {
  const onKeyDown = useMenuShortcuts(shortcuts);
  return (
    <div data-testid="popup" tabIndex={-1} onKeyDown={onKeyDown}>
      popup
    </div>
  );
}

describe("useMenuShortcuts", () => {
  it("fires the matching action and prevents default", () => {
    const action = vi.fn();
    const { getByTestId } = render(
      <Harness shortcuts={[{ key: "e", action }]} />,
    );
    const popup = getByTestId("popup");
    const event = fireEvent.keyDown(popup, { key: "E" });
    expect(action).toHaveBeenCalledTimes(1);
    expect(event).toBe(false); // preventDefault → fireEvent returns false
  });

  it("matches keys case-insensitively", () => {
    const action = vi.fn();
    const { getByTestId } = render(
      <Harness shortcuts={[{ key: "E", action }]} />,
    );
    fireEvent.keyDown(getByTestId("popup"), { key: "e" });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no shortcut matches", () => {
    const action = vi.fn();
    const { getByTestId } = render(
      <Harness shortcuts={[{ key: "e", action }]} />,
    );
    const event = fireEvent.keyDown(getByTestId("popup"), { key: "x" });
    expect(action).not.toHaveBeenCalled();
    expect(event).toBe(true); // not prevented
  });

  it("skips disabled shortcuts", () => {
    const enabled = vi.fn();
    const disabled = vi.fn();
    const { getByTestId } = render(
      <Harness
        shortcuts={[
          { key: "e", action: disabled, disabled: true },
          { key: "e", action: enabled },
        ]}
      />,
    );
    fireEvent.keyDown(getByTestId("popup"), { key: "e" });
    expect(disabled).not.toHaveBeenCalled();
    expect(enabled).toHaveBeenCalledTimes(1);
  });

  it("matches a shift shortcut via event.code", () => {
    const action = vi.fn();
    const { getByTestId } = render(
      <Harness shortcuts={[{ key: "1", shift: true, action }]} />,
    );
    fireEvent.keyDown(getByTestId("popup"), {
      key: "!",
      code: "Digit1",
      shiftKey: true,
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("does not match a shift shortcut when shift is not held", () => {
    const action = vi.fn();
    const { getByTestId } = render(
      <Harness shortcuts={[{ key: "1", shift: true, action }]} />,
    );
    fireEvent.keyDown(getByTestId("popup"), {
      key: "1",
      code: "Digit1",
      shiftKey: false,
    });
    expect(action).not.toHaveBeenCalled();
  });

  it("does not match a shift shortcut when the code differs", () => {
    const action = vi.fn();
    const { getByTestId } = render(
      <Harness shortcuts={[{ key: "1", shift: true, action }]} />,
    );
    fireEvent.keyDown(getByTestId("popup"), {
      key: "!",
      code: "Digit2",
      shiftKey: true,
    });
    expect(action).not.toHaveBeenCalled();
  });

  it("ignores events whose default has already been prevented", () => {
    const action = vi.fn();
    function PrePrevented() {
      const onKeyDown = useMenuShortcuts([{ key: "e", action }]);
      return (
        <div
          data-testid="popup"
          tabIndex={-1}
          onKeyDownCapture={(e) => e.preventDefault()}
          onKeyDown={onKeyDown}
        />
      );
    }
    const { getByTestId } = render(<PrePrevented />);
    fireEvent.keyDown(getByTestId("popup"), { key: "e" });
    expect(action).not.toHaveBeenCalled();
  });
});
