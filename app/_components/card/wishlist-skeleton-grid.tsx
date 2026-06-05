export function WishlistSkeletonGrid() {
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
