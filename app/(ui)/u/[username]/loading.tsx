export default function ProfileLoading() {
  return (
    <div className="px-4 py-14 max-w-5xl mx-auto">
      <div className="mb-10">
        <div className="mb-3 h-[12px] w-[64px] rounded bg-muted animate-pulse" />
        <div className="h-[48px] w-[280px] rounded-md bg-muted animate-pulse" />
      </div>

      <div className="mb-4 h-[24px] w-[140px] rounded bg-muted animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[120px] rounded-xl bg-muted animate-pulse"
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
