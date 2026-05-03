export type RowNavKey = "ArrowRight" | "ArrowLeft" | "j" | "k";

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
