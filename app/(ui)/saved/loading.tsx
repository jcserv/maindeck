import { Eyebrow } from "@/components/ui/eyebrow";

export default function SavedLoading() {
  return (
    <div className="px-4 py-14 max-w-5xl mx-auto">
      <div className="mb-10">
        <Eyebrow className="mb-3">Bookmarks</Eyebrow>
        <h1 className="text-5xl font-medium leading-none tracking-tight">
          Saved decks
        </h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[120px] rounded-xl bg-muted animate-pulse"
            aria-hidden
          />
        ))}
      </div>
      <div className="mt-10 h-[40px]" aria-hidden />
    </div>
  );
}
