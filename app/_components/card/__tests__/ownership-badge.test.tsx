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
  it("renders OWNED with the Owned label", () => {
    render(
      <OwnershipBadge state="OWNED" printingId={PRINTING_ID} isFoil={false} />,
    );
    expect(screen.getByLabelText(/ownership: owned/i)).toBeInTheDocument();
  });

  it("renders WISHLIST with the Wishlist label", () => {
    render(
      <OwnershipBadge
        state="WISHLIST"
        printingId={PRINTING_ID}
        isFoil={false}
      />,
    );
    expect(screen.getByLabelText(/ownership: wishlist/i)).toBeInTheDocument();
  });

  it("renders PARTIAL with the Partial label", () => {
    render(
      <OwnershipBadge
        state="PARTIAL"
        printingId={PRINTING_ID}
        isFoil={false}
        partialReason="foil-mismatch"
      />,
    );
    expect(screen.getByLabelText(/ownership: partial/i)).toBeInTheDocument();
  });
});

describe("OwnershipBadge popover actions", () => {
  it("OWNED → 'Move to wishlist' fires setWishlist(printingId, isFoil, true)", async () => {
    const user = userEvent.setup();
    render(
      <OwnershipBadge state="OWNED" printingId={PRINTING_ID} isFoil={false} />,
    );

    await user.click(screen.getByLabelText(/ownership: owned/i));
    await user.click(await screen.findByRole("button", { name: /move to wishlist/i }));

    expect(mockSetWishlist).toHaveBeenCalledWith(PRINTING_ID, false, true);
  });

  it("WISHLIST → 'Mark as owned' fires setHolding(printingId, isFoil, 1)", async () => {
    const user = userEvent.setup();
    render(
      <OwnershipBadge
        state="WISHLIST"
        printingId={PRINTING_ID}
        isFoil={true}
      />,
    );

    await user.click(screen.getByLabelText(/ownership: wishlist/i));
    await user.click(await screen.findByRole("button", { name: /mark as owned/i }));

    expect(mockSetHolding).toHaveBeenCalledWith(PRINTING_ID, true, 1);
  });

  it("Clear fires setHolding(0) and setWishlist(off)", async () => {
    const user = userEvent.setup();
    render(
      <OwnershipBadge state="OWNED" printingId={PRINTING_ID} isFoil={false} />,
    );

    await user.click(screen.getByLabelText(/ownership: owned/i));
    await user.click(await screen.findByRole("button", { name: /^clear$/i }));

    expect(mockSetHolding).toHaveBeenCalledWith(PRINTING_ID, false, 0);
    expect(mockSetWishlist).toHaveBeenCalledWith(PRINTING_ID, false, false);
  });
});

describe("OwnershipBadge popover content", () => {
  it("surfaces the foil-mismatch reason in the popover when partialReason='foil-mismatch'", async () => {
    const user = userEvent.setup();
    render(
      <OwnershipBadge
        state="PARTIAL"
        printingId={PRINTING_ID}
        isFoil={true}
        partialReason="foil-mismatch"
      />,
    );

    await user.click(screen.getByLabelText(/ownership: partial/i));
    expect(await screen.findByText(/non-foil version/i)).toBeInTheDocument();
  });

  it("surfaces the different-printing reason when partialReason='different-printing'", async () => {
    const user = userEvent.setup();
    render(
      <OwnershipBadge
        state="PARTIAL"
        printingId={PRINTING_ID}
        isFoil={false}
        partialReason="different-printing"
      />,
    );

    await user.click(screen.getByLabelText(/ownership: partial/i));
    expect(await screen.findByText(/different printing/i)).toBeInTheDocument();
  });
});
