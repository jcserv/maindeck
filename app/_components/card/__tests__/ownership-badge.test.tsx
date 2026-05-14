import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/_actions/inventory", () => ({
  setHolding: vi.fn().mockResolvedValue(undefined),
  setWishlist: vi.fn().mockResolvedValue(undefined),
}));

import { setHolding, setWishlist } from "@/app/_actions/inventory";
import { OwnershipBadge } from "../ownership-badge";

const mockSetHolding = vi.mocked(setHolding);
const mockSetWishlist = vi.mocked(setWishlist);

const PRINTING_ID = 42;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OwnershipBadge trigger label", () => {
  it("renders NOT_OWNED aria label", () => {
    render(
      <OwnershipBadge
        state="NOT_OWNED"
        printingId={PRINTING_ID}
        isFoil={false}
      />,
    );
    expect(screen.getByLabelText(/not owned/i)).toBeInTheDocument();
  });

  it("renders OWNED aria label", () => {
    render(
      <OwnershipBadge state="OWNED" printingId={PRINTING_ID} isFoil={false} />,
    );
    expect(screen.getByLabelText(/^owned/i)).toBeInTheDocument();
  });

  it("renders WISHLIST aria label", () => {
    render(
      <OwnershipBadge
        state="WISHLIST"
        printingId={PRINTING_ID}
        isFoil={false}
      />,
    );
    expect(screen.getByLabelText(/on wishlist/i)).toBeInTheDocument();
  });

  it("renders PARTIAL aria label", () => {
    render(
      <OwnershipBadge
        state="PARTIAL"
        printingId={PRINTING_ID}
        isFoil={false}
        partialReason="foil-mismatch"
      />,
    );
    expect(screen.getByLabelText(/partially owned/i)).toBeInTheDocument();
  });
});

describe("OwnershipBadge toggle", () => {
  it("NOT_OWNED click fires setHolding(printingId, isFoil, 1)", async () => {
    const user = userEvent.setup();
    render(
      <OwnershipBadge
        state="NOT_OWNED"
        printingId={PRINTING_ID}
        isFoil={false}
      />,
    );

    await user.click(screen.getByLabelText(/not owned/i));

    expect(mockSetHolding).toHaveBeenCalledWith(PRINTING_ID, false, 1);
  });

  it("OWNED click fires setHolding(0) and setWishlist(off)", async () => {
    const user = userEvent.setup();
    render(
      <OwnershipBadge state="OWNED" printingId={PRINTING_ID} isFoil={false} />,
    );

    await user.click(screen.getByLabelText(/^owned/i));

    expect(mockSetHolding).toHaveBeenCalledWith(PRINTING_ID, false, 0);
    expect(mockSetWishlist).toHaveBeenCalledWith(PRINTING_ID, false, false);
  });

  it("WISHLIST click fires setHolding(printingId, isFoil, 1)", async () => {
    const user = userEvent.setup();
    render(
      <OwnershipBadge
        state="WISHLIST"
        printingId={PRINTING_ID}
        isFoil={true}
      />,
    );

    await user.click(screen.getByLabelText(/on wishlist/i));

    expect(mockSetHolding).toHaveBeenCalledWith(PRINTING_ID, true, 1);
  });

  it("PARTIAL click fires setHolding(printingId, isFoil, 1)", async () => {
    const user = userEvent.setup();
    render(
      <OwnershipBadge
        state="PARTIAL"
        printingId={PRINTING_ID}
        isFoil={false}
        partialReason="different-printing"
      />,
    );

    await user.click(screen.getByLabelText(/partially owned/i));

    expect(mockSetHolding).toHaveBeenCalledWith(PRINTING_ID, false, 1);
  });
});
