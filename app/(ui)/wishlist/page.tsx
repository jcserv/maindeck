import { Suspense } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { requireSession } from "@/lib/auth/session";
import { getViewerWishlist } from "@/lib/inventory/queries";
import { WishlistGrid } from "@/app/_components/card/wishlist-grid";

async function WishlistContent() {
  const { userId } = await requireSession();
  const entries = await getViewerWishlist(userId);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center h-[200px]">
        <p className="text-muted-foreground">
          No wishlisted cards yet — bookmark cards from a deck or card page.
        </p>
      </div>
    );
  }

  return <WishlistGrid entries={entries} />;
}

function WishlistSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[244/340] rounded-md bg-muted animate-pulse"
          aria-hidden
        />
      ))}
    </div>
  );
}

export default function WishlistPage() {
  return (
    <div className="px-4 py-14 max-w-5xl mx-auto">
      <div className="mb-10">
        <Eyebrow className="mb-3">Bookmarks</Eyebrow>
        <h1 className="text-5xl font-medium leading-none tracking-tight">
          Wishlist
        </h1>
      </div>

      <Suspense fallback={<WishlistSkeleton />}>
        <WishlistContent />
      </Suspense>
    </div>
  );
}
