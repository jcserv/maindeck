export function rowNavDelta(key: string): 1 | -1 | null {
  if (key === "ArrowRight" || key === "j") return 1;
  if (key === "ArrowLeft" || key === "k") return -1;
  return null;
}

export function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export function computeNextRowIndex(
  currentIdx: number,
  rowsLen: number,
  delta: 1 | -1,
): number {
  if (rowsLen === 0) return -1;
  if (currentIdx === -1) return delta === 1 ? 0 : rowsLen - 1;
  return (currentIdx + delta + rowsLen) % rowsLen;
}

export function isFocusInRow(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  return Boolean(
    active.matches("[data-deck-row]") || active.closest("[data-deck-row]"),
  );
}

export function resolveCurrentRowIndex(rows: HTMLElement[]): number {
  if (typeof document === "undefined") return -1;
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    const row = active.matches("[data-deck-row]")
      ? active
      : active.closest<HTMLElement>("[data-deck-row]");
    if (row) return rows.indexOf(row);
  }
  const hovered = document.querySelector<HTMLElement>("[data-deck-row]:hover");
  return hovered ? rows.indexOf(hovered) : -1;
}
