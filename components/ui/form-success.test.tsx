import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormSuccess } from "@/components/ui/form-success";

describe("FormSuccess", () => {
  it("renders nothing when children is falsy", () => {
    const { container } = render(<FormSuccess />);
    expect(container.firstChild).toBeNull();
  });

  it("renders children with role=status", () => {
    render(<FormSuccess>Operation succeeded</FormSuccess>);
    const el = screen.getByRole("status");
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent("Operation succeeded");
  });

  it("applies emerald color classes", () => {
    render(<FormSuccess>Done</FormSuccess>);
    const el = screen.getByRole("status");
    expect(el.className).toContain("emerald");
  });

  it("merges a custom className", () => {
    render(<FormSuccess className="mt-4">Done</FormSuccess>);
    const el = screen.getByRole("status");
    expect(el.className).toContain("mt-4");
  });
});
