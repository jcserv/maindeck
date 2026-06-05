import { Eyebrow } from "@/components/ui/eyebrow";

export default function WishlistLoading() {
  return (
    <div className="px-4 py-14 max-w-5xl mx-auto">
      <div className="mb-10">
        <Eyebrow className="mb-3">Bookmarks</Eyebrow>
        <h1 className="text-5xl font-medium leading-none tracking-tight">
          Wishlist
        </h1>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[244/340] rounded-md bg-muted animate-pulse"
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
