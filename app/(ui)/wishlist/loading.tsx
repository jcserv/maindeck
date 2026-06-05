import { Eyebrow } from "@/components/ui/eyebrow";
import { WishlistSkeletonGrid } from "@/app/_components/card/wishlist-skeleton-grid";

export default function WishlistLoading() {
  return (
    <div className="px-4 py-14 max-w-5xl mx-auto">
      <div className="mb-10">
        <Eyebrow className="mb-3">Bookmarks</Eyebrow>
        <h1 className="text-5xl font-medium leading-none tracking-tight">
          Wishlist
        </h1>
      </div>

      <WishlistSkeletonGrid />
    </div>
  );
}
