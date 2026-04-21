export default function DecksLoading() {
  return (
    <div className="px-4 py-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="h-[32px] w-[120px] rounded-md bg-muted animate-pulse" />
        <div className="h-[32px] w-[96px] rounded-md bg-muted animate-pulse" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[120px] rounded-xl bg-muted animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
