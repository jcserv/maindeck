type DeckAction = "bulk-edit" | "export" | "toggle-view";

const handlers = new Map<DeckAction, () => void>();

export function registerDeckAction(action: DeckAction, cb: () => void) {
  handlers.set(action, cb);
  return () => {
    if (handlers.get(action) === cb) handlers.delete(action);
  };
}

export function fireDeckAction(action: DeckAction): boolean {
  const cb = handlers.get(action);
  if (!cb) return false;
  cb();
  return true;
}

