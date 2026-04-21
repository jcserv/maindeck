import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "../page";

describe("Home page", () => {
  it("renders a suspense fallback shell", () => {
    const html = renderToString(<Home />);
    expect(html).toContain("aria-hidden");
  });
});
