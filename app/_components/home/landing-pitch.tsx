const PITCH_COLS = [
  {
    kicker: "01",
    title: "Keyboard-driven.",
    body: 'Quick-add with "4 sol ring", focus search with /, open anywhere with ⌘K.',
  },
  {
    kicker: "02",
    title: "Categories, sharpened.",
    body: "Ramp / Draw / Removal are first-class. Drag to reorder roles. No flat mainboards.",
  },
  {
    kicker: "03",
    title: "Snappy navigation.",
    body: "Every deck prefetched on hover, so the editor opens the moment you click.",
  },
] as const;

export function LandingPitch() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 mb-24">
      {PITCH_COLS.map((col) => (
        <div key={col.kicker}>
          <div className="font-mono text-[11px] text-primary tracking-[0.2em] mb-3.5 uppercase">
            {col.kicker}
          </div>
          <h3 className="font-display text-[26px] font-medium leading-[1.1] tracking-[-0.01em] m-0 mb-3">
            {col.title}
          </h3>
          <p className="m-0 text-[14.5px] leading-[1.55] text-muted-foreground">
            {col.body}
          </p>
        </div>
      ))}
    </div>
  );
}
