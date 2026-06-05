export default function WishlistLoading() {
  return (
    <div className="px-4 md:px-8 py-6 max-w-[1800px] mx-auto">
      <div className="flex flex-col gap-4">
        <div className="h-12 w-60 rounded-md bg-muted animate-pulse" />
        <div className="h-[40px]" aria-hidden />
      </div>
    </div>
  );
}
